import { promises as fs } from "fs";
import path from "path";
import type { MindMapAction, MindMapData } from "@/types/mindmap";
import { applyMindMapActions } from "@/lib/mindmap-actions";
import {
  emptyPrivateData,
  mergeMindMap,
  splitMindMap,
  type PrivateMindMapData,
} from "@/lib/mindmap-split";
import {
  isSupabaseConfigured,
  requireSupabaseInProduction,
} from "@/lib/supabase/env";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  applyActionsToSupabase,
  readMindMapFromSupabase,
  writeMindMapToSupabase,
} from "@/lib/supabase/mindmap-store";

const SHARED_PATH = path.join(process.cwd(), "data", "mindmap.json");
const PRIVATE_PATH = path.join(process.cwd(), "data", "private.json");

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

async function readSharedFile(): Promise<MindMapData> {
  const data = await readJsonFile<MindMapData>(SHARED_PATH);
  if (!data) {
    return { nodes: [], edges: [], revision: 0 };
  }
  return data;
}

async function readPrivateFile(): Promise<PrivateMindMapData> {
  const data = await readJsonFile<PrivateMindMapData>(PRIVATE_PATH);
  return data ?? emptyPrivateData();
}

async function getSessionUserId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Data access uses the service role on the server so we don't depend on
 * anon/authenticated table GRANTs (new publishable keys often lack them).
 * Auth is still enforced: session user is verified via getUser(); private
 * rows are always filtered by that userId in the store queries.
 */
function dataClient() {
  return createServiceClient();
}

export async function readMindMap(): Promise<MindMapData> {
  requireSupabaseInProduction();
  if (isSupabaseConfigured()) {
    const userId = await getSessionUserId();
    return readMindMapFromSupabase(dataClient(), userId);
  }

  const [shared, privateData] = await Promise.all([
    readSharedFile(),
    readPrivateFile(),
  ]);
  return mergeMindMap(shared, privateData);
}

let writeQueue: Promise<unknown> = Promise.resolve();

function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function writeMindMap(
  data: MindMapData,
  options?: { force?: boolean },
): Promise<MindMapData> {
  requireSupabaseInProduction();
  if (isSupabaseConfigured()) {
    const userId = await getSessionUserId();
    if (!userId) {
      throw Object.assign(new Error("Unauthorized"), { status: 401 });
    }
    return writeMindMapToSupabase(dataClient(), userId, data, options);
  }

  return enqueueWrite(async () => {
    const current = await readMindMap();
    const currentRevision = current.revision ?? 0;
    const incomingRevision = data.revision ?? 0;

    if (!options?.force && incomingRevision < currentRevision) {
      const error = new Error("Stale mind map revision") as Error & {
        status: number;
        current: MindMapData;
      };
      error.status = 409;
      error.current = current;
      throw error;
    }

    const revision = Math.max(currentRevision, incomingRevision);
    const updatedAt = new Date().toISOString();
    const merged: MindMapData = {
      ...data,
      revision,
      updatedAt,
    };

    const { shared, private: privateData } = splitMindMap(merged);
    await Promise.all([
      writeJsonFile(SHARED_PATH, shared),
      writeJsonFile(PRIVATE_PATH, privateData),
    ]);

    return merged;
  });
}

/**
 * Apply one or more patch actions against the current store.
 * Patches always apply to the latest revision (no whole-document 409).
 */
export async function applyActions(
  actions: MindMapAction[],
): Promise<MindMapData> {
  requireSupabaseInProduction();
  if (isSupabaseConfigured()) {
    const userId = await getSessionUserId();
    if (!userId) {
      throw Object.assign(new Error("Unauthorized"), { status: 401 });
    }
    return applyActionsToSupabase(dataClient(), userId, actions);
  }

  return enqueueWrite(async () => {
    const current = await mergeMindMap(
      await readSharedFile(),
      await readPrivateFile(),
    );
    const next = applyMindMapActions(current, actions);
    const revision = (current.revision ?? 0) + 1;
    const updatedAt = new Date().toISOString();
    const merged: MindMapData = { ...next, revision, updatedAt };
    const { shared, private: privateData } = splitMindMap(merged);
    await Promise.all([
      writeJsonFile(SHARED_PATH, shared),
      writeJsonFile(PRIVATE_PATH, privateData),
    ]);
    return merged;
  });
}

/** Paths exposed for scripts / diagnostics. */
export const mindmapPaths = {
  shared: SHARED_PATH,
  private: PRIVATE_PATH,
};
