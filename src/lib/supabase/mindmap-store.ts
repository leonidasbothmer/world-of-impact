import type { SupabaseClient } from "@supabase/supabase-js";
import type { MindMapAction, MindMapData, MindMapNode } from "@/types/mindmap";
import { applyMindMapActions } from "@/lib/mindmap-actions";
import { isPrivateNode } from "@/lib/mindmap-split";
import {
  edgeRowToMindMap,
  extractContactDetails,
  mindMapNodeToPrivateRow,
  mindMapNodeToSharedRow,
  privateNodeToMindMap,
  sharedNodeToMindMap,
  type ContactDetailsRow,
  type LayoutRow,
  type PrivateEdgeRow,
  type PrivateNodeRow,
  type PrivateNotesRow,
  type SharedEdgeRow,
  type SharedNodeRow,
} from "@/lib/supabase/map-rows";

type Db = SupabaseClient;

async function bumpRevision(db: Db): Promise<{ revision: number; updatedAt: string }> {
  const { data: meta, error: readError } = await db
    .from("mindmap_meta")
    .select("revision")
    .eq("id", 1)
    .single();
  if (readError) throw readError;
  const revision = (meta?.revision ?? 0) + 1;
  const updatedAt = new Date().toISOString();
  const { error } = await db
    .from("mindmap_meta")
    .update({ revision, updated_at: updatedAt })
    .eq("id", 1);
  if (error) throw error;
  return { revision, updatedAt };
}

async function upsertLayouts(
  db: Db,
  userId: string,
  entries: { nodeId: string; x: number; y: number; pinned?: boolean }[],
) {
  if (entries.length === 0) return;
  const rows = entries.map((e) => ({
    user_id: userId,
    node_id: e.nodeId,
    x: e.x,
    y: e.y,
    pinned: e.pinned ?? false,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await db.from("node_layouts").upsert(rows);
  if (error) throw error;
}

async function upsertContact(
  db: Db,
  userId: string,
  contact: ContactDetailsRow,
) {
  const { error } = await db.from("contact_details").upsert({
    user_id: userId,
    node_id: contact.node_id,
    email: contact.email,
    phone: contact.phone,
    org_email: contact.org_email,
    tags: contact.tags ?? [],
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function upsertSharedNode(
  db: Db,
  userId: string,
  node: MindMapNode,
) {
  if (isPrivateNode(node)) {
    throw new Error("Person nodes cannot be written to shared_nodes");
  }
  const row = mindMapNodeToSharedRow(node);
  const { data: existing } = await db
    .from("shared_nodes")
    .select("id, notes")
    .eq("id", node.id)
    .maybeSingle();

  // Preserve seeded public notes; per-user edits go to private_notes.
  const { error } = await db.from("shared_nodes").upsert({
    ...row,
    notes: existing?.notes ?? row.notes,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;

  if (node.notes !== undefined && node.notes !== (existing?.notes ?? null)) {
    const { error: noteError } = await db.from("private_notes").upsert({
      user_id: userId,
      shared_node_id: node.id,
      body: node.notes ?? "",
      updated_at: new Date().toISOString(),
    });
    if (noteError) throw noteError;
  }
}

async function upsertPrivateNode(db: Db, userId: string, node: MindMapNode) {
  const row = mindMapNodeToPrivateRow(node);
  const { error } = await db.from("private_nodes").upsert({
    user_id: userId,
    ...row,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function writeNode(
  db: Db,
  userId: string,
  node: MindMapNode,
  options?: { layout?: boolean },
) {
  if (isPrivateNode(node)) {
    await upsertPrivateNode(db, userId, node);
  } else {
    await upsertSharedNode(db, userId, node);
  }
  const contact = extractContactDetails(node);
  if (contact) {
    await upsertContact(db, userId, contact);
  } else if (!isPrivateNode(node)) {
    await db
      .from("contact_details")
      .delete()
      .eq("user_id", userId)
      .eq("node_id", node.id);
  } else {
    // Person with no contact fields — still clear stale contact row if empty.
    await db
      .from("contact_details")
      .delete()
      .eq("user_id", userId)
      .eq("node_id", node.id);
  }
  if (options?.layout !== false) {
    await upsertLayouts(db, userId, [
      {
        nodeId: node.id,
        x: node.position.x,
        y: node.position.y,
        pinned: Boolean(node.pinned),
      },
    ]);
  }
}

function edgeTouchesPerson(
  edge: { source: string; target: string },
  personIds: Set<string>,
): boolean {
  return personIds.has(edge.source) || personIds.has(edge.target);
}

export async function readMindMapFromSupabase(
  db: Db,
  userId: string | null,
): Promise<MindMapData> {
  const sharedNodesRes = await db.from("shared_nodes").select("*");
  const sharedEdgesRes = await db.from("shared_edges").select("*");
  const metaRes = await db
    .from("mindmap_meta")
    .select("revision, updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (sharedNodesRes.error) throw sharedNodesRes.error;
  if (sharedEdgesRes.error) throw sharedEdgesRes.error;

  let layoutsRes = { data: [] as LayoutRow[], error: null as null | { message: string } };
  let privateNodesRes = { data: [] as PrivateNodeRow[], error: null as null | { message: string } };
  let privateEdgesRes = { data: [] as PrivateEdgeRow[], error: null as null | { message: string } };
  let contactsRes = { data: [] as ContactDetailsRow[], error: null as null | { message: string } };
  let privateNotesRes = { data: [] as PrivateNotesRow[], error: null as null | { message: string } };

  if (userId) {
    const [layouts, privateNodes, privateEdges, contacts, privateNotes] =
      await Promise.all([
        db.from("node_layouts").select("*").eq("user_id", userId),
        db.from("private_nodes").select("*").eq("user_id", userId),
        db.from("private_edges").select("*").eq("user_id", userId),
        db.from("contact_details").select("*").eq("user_id", userId),
        db.from("private_notes").select("*").eq("user_id", userId),
      ]);
    layoutsRes = layouts as typeof layoutsRes;
    privateNodesRes = privateNodes as typeof privateNodesRes;
    privateEdgesRes = privateEdges as typeof privateEdgesRes;
    contactsRes = contacts as typeof contactsRes;
    privateNotesRes = privateNotes as typeof privateNotesRes;

    for (const res of [
      layoutsRes,
      privateNodesRes,
      privateEdgesRes,
      contactsRes,
      privateNotesRes,
    ]) {
      if (res.error) throw res.error;
    }
  }

  const layouts = new Map<string, LayoutRow>(
    ((layoutsRes.data ?? []) as LayoutRow[]).map((l) => [l.node_id, l]),
  );
  const contacts = new Map<string, ContactDetailsRow>(
    ((contactsRes.data ?? []) as ContactDetailsRow[]).map((c) => [c.node_id, c]),
  );
  const privateNotes = new Map<string, string>(
    ((privateNotesRes.data ?? []) as PrivateNotesRow[]).map((n) => [
      n.shared_node_id,
      n.body,
    ]),
  );

  const sharedNodes = ((sharedNodesRes.data ?? []) as SharedNodeRow[]).map(
    (row) => {
      // Owner sees personal note when set; otherwise the shared public notes.
      const personal = privateNotes.get(row.id);
      const node = sharedNodeToMindMap(
        row,
        layouts.get(row.id),
        contacts.get(row.id),
        personal !== undefined ? personal : undefined,
      );
      return node;
    },
  );

  const privateNodes = ((privateNodesRes.data ?? []) as PrivateNodeRow[]).map(
    (row) =>
      privateNodeToMindMap(row, layouts.get(row.id), contacts.get(row.id)),
  );

  const edges = [
    ...((sharedEdgesRes.data ?? []) as SharedEdgeRow[]).map(edgeRowToMindMap),
    ...((privateEdgesRes.data ?? []) as PrivateEdgeRow[]).map(edgeRowToMindMap),
  ];

  return {
    nodes: [...sharedNodes, ...privateNodes],
    edges,
    revision: metaRes.data?.revision ?? 0,
    updatedAt: metaRes.data?.updated_at,
  };
}

async function applyOneAction(
  db: Db,
  userId: string,
  current: MindMapData,
  action: MindMapAction,
): Promise<void> {
  const personIds = () =>
    new Set(current.nodes.filter((n) => n.type === "person").map((n) => n.id));

  switch (action.action) {
    case "addNode":
    case "updateNode": {
      await writeNode(db, userId, action.node);
      // Keep current in sync for subsequent actions in the batch.
      Object.assign(current, applyMindMapActions(current, [action]));
      return;
    }
    case "deleteNode": {
      const node = current.nodes.find((n) => n.id === action.id);
      if (node && isPrivateNode(node)) {
        await db
          .from("private_nodes")
          .delete()
          .eq("user_id", userId)
          .eq("id", action.id);
        await db
          .from("private_edges")
          .delete()
          .eq("user_id", userId)
          .or(`source.eq.${action.id},target.eq.${action.id}`);
      } else {
        await db.from("shared_nodes").delete().eq("id", action.id);
        // shared_edges cascade; also drop private edges that pointed at it
        await db
          .from("private_edges")
          .delete()
          .eq("user_id", userId)
          .or(`source.eq.${action.id},target.eq.${action.id}`);
      }
      await db
        .from("contact_details")
        .delete()
        .eq("user_id", userId)
        .eq("node_id", action.id);
      await db
        .from("node_layouts")
        .delete()
        .eq("user_id", userId)
        .eq("node_id", action.id);
      await db
        .from("private_notes")
        .delete()
        .eq("user_id", userId)
        .eq("shared_node_id", action.id);
      Object.assign(current, applyMindMapActions(current, [action]));
      return;
    }
    case "addEdge": {
      const people = personIds();
      if (edgeTouchesPerson(action.edge, people)) {
        const { error } = await db.from("private_edges").upsert({
          user_id: userId,
          id: action.edge.id,
          source: action.edge.source,
          target: action.edge.target,
          label: action.edge.label ?? null,
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;
      } else {
        const { error } = await db.from("shared_edges").upsert({
          id: action.edge.id,
          source: action.edge.source,
          target: action.edge.target,
          label: action.edge.label ?? null,
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;
      }
      Object.assign(current, applyMindMapActions(current, [action]));
      return;
    }
    case "updateEdge": {
      const people = personIds();
      if (edgeTouchesPerson(action.edge, people)) {
        const { error } = await db
          .from("private_edges")
          .update({
            label: action.edge.label ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId)
          .eq("id", action.edge.id);
        if (error) throw error;
      } else {
        const { error } = await db
          .from("shared_edges")
          .update({
            label: action.edge.label ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", action.edge.id);
        if (error) throw error;
      }
      Object.assign(current, applyMindMapActions(current, [action]));
      return;
    }
    case "deleteEdge": {
      await db.from("shared_edges").delete().eq("id", action.id);
      await db
        .from("private_edges")
        .delete()
        .eq("user_id", userId)
        .eq("id", action.id);
      Object.assign(current, applyMindMapActions(current, [action]));
      return;
    }
    case "deleteEdges": {
      if (action.ids.length > 0) {
        await db.from("shared_edges").delete().in("id", action.ids);
        await db
          .from("private_edges")
          .delete()
          .eq("user_id", userId)
          .in("id", action.ids);
      }
      Object.assign(current, applyMindMapActions(current, [action]));
      return;
    }
    case "createWithEdge": {
      await applyOneAction(db, userId, current, {
        action: "addNode",
        node: action.node,
      });
      await applyOneAction(db, userId, current, {
        action: "addEdge",
        edge: action.edge,
      });
      return;
    }
    case "updatePositions": {
      const entries = Object.entries(action.positions).map(([nodeId, pos]) => ({
        nodeId,
        x: pos.x,
        y: pos.y,
        pinned: current.nodes.find((n) => n.id === nodeId)?.pinned,
      }));
      // Preserve pinned flag from existing layouts when not in current.
      const { data: existing } = await db
        .from("node_layouts")
        .select("node_id, pinned")
        .eq("user_id", userId)
        .in(
          "node_id",
          entries.map((e) => e.nodeId),
        );
      const pinnedById = new Map(
        (existing ?? []).map((r) => [r.node_id as string, r.pinned as boolean]),
      );
      await upsertLayouts(
        db,
        userId,
        entries.map((e) => ({
          ...e,
          pinned: e.pinned ?? pinnedById.get(e.nodeId) ?? false,
        })),
      );
      Object.assign(current, applyMindMapActions(current, [action]));
      return;
    }
    case "updatePin": {
      const entries: {
        nodeId: string;
        x: number;
        y: number;
        pinned?: boolean;
      }[] = [];
      const target = current.nodes.find((n) => n.id === action.id);
      const pos = action.position ?? target?.position ?? { x: 0, y: 0 };
      entries.push({
        nodeId: action.id,
        x: pos.x,
        y: pos.y,
        pinned: action.pinned,
      });
      if (action.extraPositions) {
        for (const [nodeId, p] of Object.entries(action.extraPositions)) {
          if (nodeId === action.id) continue;
          entries.push({
            nodeId,
            x: p.x,
            y: p.y,
            pinned: current.nodes.find((n) => n.id === nodeId)?.pinned,
          });
        }
      }
      await upsertLayouts(db, userId, entries);
      Object.assign(current, applyMindMapActions(current, [action]));
      return;
    }
    case "unpinAll": {
      const { error } = await db
        .from("node_layouts")
        .update({ pinned: false, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("pinned", true);
      if (error) throw error;
      Object.assign(current, applyMindMapActions(current, [action]));
      return;
    }
    case "replace":
      throw new Error("replace must use writeMindMapToSupabase");
    default:
      return;
  }
}

export async function applyActionsToSupabase(
  db: Db,
  userId: string,
  actions: MindMapAction[],
): Promise<MindMapData> {
  const current = await readMindMapFromSupabase(db, userId);
  for (const action of actions) {
    await applyOneAction(db, userId, current, action);
  }
  const { revision, updatedAt } = await bumpRevision(db);
  const next = await readMindMapFromSupabase(db, userId);
  return { ...next, revision, updatedAt };
}

export async function writeMindMapToSupabase(
  db: Db,
  userId: string,
  data: MindMapData,
  options?: { force?: boolean },
): Promise<MindMapData> {
  const current = await readMindMapFromSupabase(db, userId);
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

  // Full replace: wipe and re-insert (import). Shared graph is shared — replace
  // shared tables for all members; private tables only for this user.
  const { error: delSharedEdges } = await db
    .from("shared_edges")
    .delete()
    .neq("id", "");
  if (delSharedEdges) throw delSharedEdges;
  const { error: delSharedNodes } = await db
    .from("shared_nodes")
    .delete()
    .neq("id", "");
  if (delSharedNodes) throw delSharedNodes;

  await db.from("private_edges").delete().eq("user_id", userId);
  await db.from("private_nodes").delete().eq("user_id", userId);
  await db.from("contact_details").delete().eq("user_id", userId);
  await db.from("private_notes").delete().eq("user_id", userId);
  await db.from("node_layouts").delete().eq("user_id", userId);

  for (const node of data.nodes) {
    await writeNode(db, userId, node);
  }

  const people = new Set(
    data.nodes.filter((n) => n.type === "person").map((n) => n.id),
  );
  for (const edge of data.edges) {
    if (edgeTouchesPerson(edge, people)) {
      const { error } = await db.from("private_edges").upsert({
        user_id: userId,
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label ?? null,
      });
      if (error) throw error;
    } else {
      const { error } = await db.from("shared_edges").upsert({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label ?? null,
      });
      if (error) throw error;
    }
  }

  const { revision, updatedAt } = await bumpRevision(db);
  return { ...data, revision, updatedAt };
}
