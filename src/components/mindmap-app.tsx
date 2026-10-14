"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Table2, Waypoints } from "lucide-react";
import Link from "next/link";
import { focusNeighborhoodIds } from "@/lib/focus-neighborhood";
import { ReactFlowProvider } from "@xyflow/react";
import {
  MindMapGraph,
  type HomeRequest,
  type NodeFocusRequest,
} from "@/components/mindmap-graph";
import { NodeSearch, type SearchCreateInput } from "@/components/node-search";
import { isOrgSolutionPair, NodePanel } from "@/components/node-panel";
import { JobTracker } from "@/components/job-tracker";
import { PeopleDirectory } from "@/components/people-directory";
import { OrgTable } from "@/components/org-table";
import { AddNodeForm } from "@/components/add-node-form";
import { AccountMenu, type AccountProfile } from "@/components/account-menu";
import { NODE_TYPE_CONFIG } from "@/lib/node-styles";
import {
  DEFAULT_HIDDEN_TYPES,
  loadHiddenTypes,
  saveHiddenTypes,
} from "@/lib/visible-nodes";
import {
  withArchived,
  withTrackDate,
  withTrackRole,
  withTrackStatus,
  withTracked,
  type TrackStatus,
} from "@/lib/tracking";
import { cn } from "@/lib/utils";
import { fetchMindMap, patchMindMap } from "@/lib/mindmap-client";
import type {
  MindMapAction,
  MindMapData,
  MindMapEdge,
  MindMapGraphChange,
  MindMapNode,
  NodeType,
} from "@/types/mindmap";

type MindMapAppProps = {
  initialData?: MindMapData | null;
  authEnabled?: boolean;
  signedIn?: boolean;
  accountProfile?: AccountProfile | null;
};

const FOCUS_STORAGE_KEY = "impact-mindmap-focus-ids";
const SHOW_FULL_STORAGE_KEY = "impact-mindmap-show-full";

export function MindMapApp({
  initialData = null,
  authEnabled = false,
  signedIn = false,
  accountProfile = null,
}: MindMapAppProps) {
  const canEdit = !authEnabled || signedIn;
  const [data, setData] = useState<MindMapData | null>(initialData);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<NodeFocusRequest | null>(
    null,
  );
  const [homeRequest, setHomeRequest] = useState<HomeRequest | null>(null);
  const focusTokenRef = useRef(0);
  const homeTokenRef = useRef(0);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [hiddenTypes, setHiddenTypes] = useState<NodeType[]>([
    ...DEFAULT_HIDDEN_TYPES,
  ]);
  const [view, setView] = useState<"graph" | "table" | "tracker" | "people">(
    "graph",
  );
  const [focusIds, setFocusIds] = useState<string[]>([]);
  const [showFullGraph, setShowFullGraph] = useState(true);
  const hiddenTypeSet = useMemo(
    () => new Set(hiddenTypes),
    [hiddenTypes],
  );
  const focusFilterIds = useMemo(() => {
    if (showFullGraph || !data || focusIds.length === 0) return null;
    return focusNeighborhoodIds(data.nodes, data.edges, focusIds, 2);
  }, [data, focusIds, showFullGraph]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedFromUrlRef = useRef(false);
  const skipHiddenTypesSaveRef = useRef(true);
  const dataRef = useRef<MindMapData | null>(initialData);
  const genRef = useRef(initialData?.revision ?? 0);
  const savedGenRef = useRef(initialData?.revision ?? 0);
  const inFlightRef = useRef(false);
  const flushTailRef = useRef<Promise<void>>(Promise.resolve());
  const pendingActionsRef = useRef<MindMapAction[]>([]);
  const persistLatestRef = useRef<(keepalive?: boolean) => Promise<void>>(
    async () => {},
  );

  function enqueueAction(action: MindMapAction) {
    if (action.action === "updatePositions") {
      const last =
        pendingActionsRef.current[pendingActionsRef.current.length - 1];
      if (last?.action === "updatePositions") {
        last.positions = { ...last.positions, ...action.positions };
        return;
      }
    }
    pendingActionsRef.current.push(action);
  }

  useEffect(() => {
    if (initialData) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchMindMap()
      .then((next) => {
        if (!cancelled) {
          dataRef.current = next;
          genRef.current = next.revision ?? 0;
          savedGenRef.current = next.revision ?? 0;
          setData(next);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load mind map. Is the dev server running?");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialData]);

  useEffect(() => {
    if (openedFromUrlRef.current || !data) return;
    const id = new URLSearchParams(window.location.search).get("node");
    openedFromUrlRef.current = true;
    if (!id || !data.nodes.some((node) => node.id === id)) return;
    focusTokenRef.current += 1;
    setSelectedNodeId(id);
    setView("graph");
    setFocusRequest({ id, token: focusTokenRef.current });
  }, [data]);

  useEffect(() => {
    const types = Object.keys(NODE_TYPE_CONFIG) as NodeType[];
    setHiddenTypes(loadHiddenTypes(types));
    try {
      const raw = window.localStorage.getItem(FOCUS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          setFocusIds(parsed.filter((id): id is string => typeof id === "string"));
        }
      }
      const full = window.localStorage.getItem(SHOW_FULL_STORAGE_KEY);
      if (full === "0") setShowFullGraph(false);
      else if (full === "1") setShowFullGraph(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    // First run is the default, before localStorage is read.
    if (skipHiddenTypesSaveRef.current) {
      skipHiddenTypesSaveRef.current = false;
      return;
    }
    saveHiddenTypes(hiddenTypes);
  }, [hiddenTypes]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/focus", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { focusIds?: string[] } | null) => {
        if (cancelled || !body?.focusIds) return;
        setFocusIds(body.focusIds);
        if (body.focusIds.length > 0) {
          const full = window.localStorage.getItem(SHOW_FULL_STORAGE_KEY);
          if (full === null) setShowFullGraph(false);
        }
      })
      .catch(() => {
        /* file mode or offline — localStorage focus still applies */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(focusIds));
  }, [focusIds]);

  useEffect(() => {
    window.localStorage.setItem(
      SHOW_FULL_STORAGE_KEY,
      showFullGraph ? "1" : "0",
    );
  }, [showFullGraph]);

  async function persistFocusIds(next: string[]) {
    setFocusIds(next);
    try {
      await fetch("/api/focus", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focusIds: next }),
      });
    } catch {
      /* localStorage already updated */
    }
  }

  function toggleFocusRoot(id: string) {
    const removing = focusIds.includes(id);
    const next = removing
      ? focusIds.filter((item) => item !== id)
      : [...focusIds, id];
    if (!removing && focusIds.length === 0) {
      setShowFullGraph(false);
    }
    void persistFocusIds(next);
  }

  const flushPending = useCallback(async (keepalive = false) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const actions = pendingActionsRef.current;
    const gen = genRef.current;
    if (actions.length === 0 || gen === savedGenRef.current) return;
    inFlightRef.current = true;
    pendingActionsRef.current = [];
    if (!keepalive) setSaving(true);
    try {
      const saved = await patchMindMap(actions, { keepalive });
      if (genRef.current === gen) {
        savedGenRef.current = gen;
        if (saved) {
          // Keep local optimistic graph; adopt server revision clock.
          const next = {
            ...(dataRef.current ?? saved),
            revision: saved.revision,
            updatedAt: saved.updatedAt,
          };
          dataRef.current = next;
          setData(next);
        }
        setDirty(false);
      }
    } catch {
      // Re-queue failed actions so the next flush retries.
      pendingActionsRef.current = [...actions, ...pendingActionsRef.current];
      if (!keepalive) setError("Failed to save changes.");
    } finally {
      inFlightRef.current = false;
      if (!keepalive) setSaving(false);
    }
  }, []);

  const persistLatest = useCallback(
    (keepalive = false) => {
      const run = flushTailRef.current.then(() => flushPending(keepalive));
      flushTailRef.current = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    [flushPending],
  );
  persistLatestRef.current = persistLatest;

  const commit = useCallback(
    (
      next: MindMapData,
      options?: { immediate?: boolean; action?: MindMapAction },
    ) => {
      if (!canEdit) {
        const action = options?.action?.action;
        const localOnly =
          action === "updatePositions" || !options?.action;
        if (localOnly) {
          dataRef.current = next;
          setData(next);
          return;
        }
        setError("Sign in to add or edit the map.");
        return;
      }
      if (options?.action) enqueueAction(options.action);
      genRef.current += 1;
      const stamped: MindMapData = { ...next, revision: genRef.current };
      dataRef.current = stamped;
      setData(stamped);
      setDirty(true);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (options?.immediate) {
        return persistLatest();
      }
      saveTimerRef.current = setTimeout(() => {
        void persistLatest();
      }, 800);
    },
    [canEdit, persistLatest],
  );

  useEffect(() => {
    function flush() {
      void persistLatestRef.current(true);
    }
    function onVisibility() {
      if (document.visibilityState === "hidden") flush();
    }
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      void persistLatestRef.current(true);
    };
  }, []);

  const selectedNode =
    data?.nodes.find((n) => n.id === selectedNodeId) ?? null;

  function handleChangeLocations(
    id: string,
    update: (current: string[]) => string[],
  ) {
    const current = dataRef.current;
    if (!current) return;
    const node = current.nodes.find((item) => item.id === id);
    if (!node) return;
    const locations = update(node.locations ?? []);
    const previous = node.locations ?? [];
    if (
      locations.length === previous.length &&
      locations.every((item, index) => item === previous[index])
    ) {
      return;
    }
    const nextNode =
      locations.length === 0
        ? (() => {
            const { locations: _removed, ...rest } = node;
            return rest;
          })()
        : { ...node, locations };
    commit(
      {
        ...current,
        nodes: current.nodes.map((item) =>
          item.id === id ? nextNode : item,
        ),
      },
      { immediate: true, action: { action: "updateNode", node: nextNode } },
    );
  }

  function commitTrackedNode(id: string, nextNode: MindMapNode) {
    const current = dataRef.current;
    if (!current) return;
    const node = current.nodes.find((item) => item.id === id);
    if (!node || (nextNode.tags ?? []).join("\0") === (node.tags ?? []).join("\0")) {
      return;
    }
    commit(
      {
        ...current,
        nodes: current.nodes.map((item) =>
          item.id === id ? nextNode : item,
        ),
      },
      { immediate: true, action: { action: "updateNode", node: nextNode } },
    );
  }

  function handleSetTracked(id: string, tracked: boolean) {
    const node = dataRef.current?.nodes.find((item) => item.id === id);
    if (!node || node.type !== "organization") return;
    commitTrackedNode(id, withTracked(node, tracked));
  }

  function handleSetTrackStatus(id: string, status: TrackStatus) {
    const node = dataRef.current?.nodes.find((item) => item.id === id);
    if (!node || node.type !== "organization") return;
    commitTrackedNode(id, withTrackStatus(node, status));
  }

  function handleSetArchived(id: string, archived: boolean) {
    const node = dataRef.current?.nodes.find((item) => item.id === id);
    if (!node || node.type !== "organization") return;
    commitTrackedNode(id, withArchived(node, archived));
  }

  function handleSetTrackDate(
    id: string,
    field: "appliedOn" | "closedOn",
    value: string,
  ) {
    const node = dataRef.current?.nodes.find((item) => item.id === id);
    if (!node || node.type !== "organization") return;
    commitTrackedNode(id, withTrackDate(node, field, value));
  }

  function handleSetTrackRole(id: string, role: string) {
    const node = dataRef.current?.nodes.find((item) => item.id === id);
    if (!node || node.type !== "organization") return;
    commitTrackedNode(id, withTrackRole(node, role));
  }

  function handlePatchPerson(
    id: string,
    patch: { linkedIn?: string; imageUrl?: string; onlyIfLinkedIn?: string },
  ) {
    const current = dataRef.current;
    if (!current) return;
    const node = current.nodes.find((item) => item.id === id);
    if (!node) return;
    if (
      patch.onlyIfLinkedIn &&
      (node.linkedIn ?? "") !== patch.onlyIfLinkedIn &&
      (node.linkedIn ?? "") !== (patch.linkedIn ?? "").trim()
    ) {
      return;
    }

    let nextNode: MindMapNode = { ...node };
    if (patch.linkedIn !== undefined) {
      const value = patch.linkedIn.trim();
      if (value) nextNode = { ...nextNode, linkedIn: value };
      else {
        const { linkedIn: _removed, ...rest } = nextNode;
        nextNode = rest;
      }
    }
    if (patch.imageUrl?.trim()) {
      nextNode = { ...nextNode, imageUrl: patch.imageUrl.trim() };
    }
    if (
      (nextNode.linkedIn ?? "") === (node.linkedIn ?? "") &&
      (nextNode.imageUrl ?? "") === (node.imageUrl ?? "")
    ) {
      return;
    }
    commit(
      {
        ...current,
        nodes: current.nodes.map((item) =>
          item.id === id ? nextNode : item,
        ),
      },
      { immediate: true, action: { action: "updateNode", node: nextNode } },
    );
  }

  function handlePatchOrg(
    id: string,
    key: "orgKind" | "orgEmail" | "website" | "careerPage" | "linkedIn",
    value: string,
  ) {
    const current = dataRef.current;
    if (!current) return;
    const node = current.nodes.find((item) => item.id === id);
    if (!node) return;
    const nextValue = value.trim();
    const previous = (node[key] ?? "").trim();
    if (nextValue === previous) return;
    const nextNode = !nextValue
      ? (() => {
          const { [key]: _removed, ...rest } = node;
          return rest;
        })()
      : { ...node, [key]: nextValue };
    commit(
      {
        ...current,
        nodes: current.nodes.map((item) =>
          item.id === id ? nextNode : item,
        ),
      },
      { immediate: true, action: { action: "updateNode", node: nextNode } },
    );
  }

  function handleSaveNode(node: MindMapNode) {
    const current = dataRef.current;
    if (!current) return;
    const existing = current.nodes.find((n) => n.id === node.id);
    const nextNode = {
      ...node,
      position: existing?.position ?? node.position,
    };
    return commit(
      {
        ...current,
        nodes: current.nodes.map((n) =>
          n.id === node.id ? nextNode : n,
        ),
      },
      { immediate: true, action: { action: "updateNode", node: nextNode } },
    );
  }

  function handleDeleteNode(id: string) {
    const current = dataRef.current;
    if (!current) return;
    commit(
      {
        ...current,
        nodes: current.nodes.filter((n) => n.id !== id),
        edges: current.edges.filter((e) => e.source !== id && e.target !== id),
      },
      { immediate: true, action: { action: "deleteNode", id } },
    );
    if (selectedNodeId === id) setSelectedNodeId(null);
  }

  function handleAddNode(node: MindMapNode) {
    const current = dataRef.current;
    if (!current) return;
    commit(
      { ...current, nodes: [...current.nodes, node] },
      { immediate: true, action: { action: "addNode", node } },
    );
    setSelectedNodeId(node.id);
  }

  function handleCreateFromSearch(input: SearchCreateInput) {
    const current = dataRef.current;
    if (!current) return;
    const trimmed = input.name.trim();
    if (!trimmed) return;
    const slug = trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const id = `${slug || "node"}-${Date.now()}`;
    const related = input.connectToId
      ? current.nodes.find((node) => node.id === input.connectToId)
      : undefined;
    const node: MindMapNode = {
      id,
      name: trimmed,
      type: input.type,
      notes: input.notes ?? "",
      tags: [],
      position: related
        ? { x: related.position.x + 140, y: related.position.y + 48 }
        : {
            x: Math.round(Math.random() * 200 - 100),
            y: Math.round(Math.random() * 200 - 100),
          },
      ...(input.linkedIn ? { linkedIn: input.linkedIn } : {}),
      ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
    };
    const edges = related
      ? [
          ...current.edges,
          {
            id: `e-${id}-${related.id}-${Date.now()}`,
            source: id,
            target: related.id,
            label: input.edgeLabel?.trim() || undefined,
          },
        ]
      : current.edges;
    setHiddenTypes((hidden) =>
      (hidden ?? []).filter((item) => item !== input.type),
    );
    if (related && edges.length > current.edges.length) {
      const edge = edges[edges.length - 1]!;
      commit(
        { ...current, nodes: [...current.nodes, node], edges },
        {
          immediate: true,
          action: { action: "createWithEdge", node, edge },
        },
      );
    } else {
      commit(
        { ...current, nodes: [...current.nodes, node], edges },
        { immediate: true, action: { action: "addNode", node } },
      );
    }
    handleSearchSelect(id);
  }

  function handleAddEdge(source: string, target: string, label?: string) {
    const current = dataRef.current;
    if (!current) return;
    const exists = current.edges.some(
      (edge) => edge.source === source && edge.target === target,
    );
    if (exists) return;
    const edge: MindMapEdge = {
      id: `e-${source}-${target}-${Date.now()}`,
      source,
      target,
      label,
    };
    commit(
      { ...current, edges: [...current.edges, edge] },
      { immediate: true, action: { action: "addEdge", edge } },
    );
  }

  function handleDeleteEdge(id: string) {
    const current = dataRef.current;
    if (!current) return;
    commit(
      { ...current, edges: current.edges.filter((e) => e.id !== id) },
      { immediate: true, action: { action: "deleteEdge", id } },
    );
  }

  function handleReverseEdge(id: string) {
    const current = dataRef.current;
    if (!current) return;
    const existing = current.edges.find((edge) => edge.id === id);
    if (!existing) return;
    const sourceNode = current.nodes.find((node) => node.id === existing.source);
    const targetNode = current.nodes.find((node) => node.id === existing.target);
    if (isOrgSolutionPair(sourceNode, targetNode)) return;
    const reversed = {
      ...existing,
      source: existing.target,
      target: existing.source,
    };
    const duplicate = current.edges.some(
      (edge) =>
        edge.id !== id &&
        edge.source === reversed.source &&
        edge.target === reversed.target,
    );
    if (duplicate) return;
    commit(
      {
        ...current,
        edges: current.edges.map((edge) => (edge.id === id ? reversed : edge)),
      },
      { immediate: true, action: { action: "updateEdge", edge: reversed } },
    );
  }

  const handleGraphChange = useCallback(
    (change: MindMapGraphChange) => {
      const current = dataRef.current;
      if (!current) return;

      if (change.reason === "positions") {
        let changed = false;
        const positions: Record<string, { x: number; y: number }> = {};
        const nodes = current.nodes.map((node) => {
          const pos = change.positions[node.id];
          if (!pos) return node;
          if (
            Math.abs(pos.x - node.position.x) < 0.5 &&
            Math.abs(pos.y - node.position.y) < 0.5
          ) {
            return node;
          }
          changed = true;
          positions[node.id] = { x: pos.x, y: pos.y };
          return { ...node, position: { x: pos.x, y: pos.y } };
        });
        if (!changed) return;
        commit(
          { ...current, nodes },
          { action: { action: "updatePositions", positions } },
        );
        return;
      }

      if (change.reason === "connect") {
        const exists = current.edges.some(
          (edge) =>
            edge.source === change.edge.source &&
            edge.target === change.edge.target,
        );
        if (exists) return;
        commit(
          { ...current, edges: [...current.edges, change.edge] },
          { immediate: true, action: { action: "addEdge", edge: change.edge } },
        );
        return;
      }

      if (change.reason === "label") {
        const label = change.label?.trim() || undefined;
        const existing = current.edges.find((e) => e.id === change.id);
        if (!existing) return;
        const nextEdge = !label
          ? (() => {
              const { label: _removed, ...rest } = existing;
              return rest;
            })()
          : { ...existing, label };
        const edges = current.edges.map((edge) =>
          edge.id === change.id ? nextEdge : edge,
        );
        commit(
          { ...current, edges },
          {
            immediate: true,
            action: { action: "updateEdge", edge: nextEdge },
          },
        );
        return;
      }

      if (change.reason === "create") {
        if (current.nodes.some((node) => node.id === change.node.id)) return;
        commit(
          {
            ...current,
            nodes: [...current.nodes, change.node],
            edges: [...current.edges, change.edge],
          },
          {
            immediate: true,
            action: {
              action: "createWithEdge",
              node: change.node,
              edge: change.edge,
            },
          },
        );
        return;
      }

      if (change.reason === "removeEdges") {
        commit(
          {
            ...current,
            edges: current.edges.filter((e) => !change.ids.includes(e.id)),
          },
          {
            immediate: true,
            action: { action: "deleteEdges", ids: change.ids },
          },
        );
      }
    },
    [commit],
  );

  function returnHome() {
    homeTokenRef.current += 1;
    setSelectedNodeId(null);
    setView("graph");
    setHomeRequest({ token: homeTokenRef.current });
    const url = new URL(window.location.href);
    if (url.searchParams.has("node")) {
      url.searchParams.delete("node");
      const next = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState(null, "", next);
    }
  }

  function handleSearchSelect(id: string) {
    focusTokenRef.current += 1;
    setSelectedNodeId(id);
    setView("graph");
    setFocusRequest({ id, token: focusTokenRef.current });
  }

  function handleLocateNode(id: string) {
    focusTokenRef.current += 1;
    setFocusRequest({ id, token: focusTokenRef.current });
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading mind map…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-destructive">
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="relative z-30 shrink-0">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-3 py-2 md:px-4">
        <button
          type="button"
          onClick={returnHome}
          title="Back to the graph"
          className="min-w-0 cursor-pointer rounded-md text-left hover:opacity-80"
        >
          <h1 className="text-base font-semibold leading-tight md:text-lg">
            The <em className="font-serif font-normal italic">Berlin</em> Atlas
            for Social Progress
          </h1>
          <p className="text-sm leading-tight">
            Finding Purpose <em className="font-serif italic">in Tech</em>.
          </p>
        </button>

        <nav
          aria-label="Primary"
          className="ml-auto flex flex-wrap items-center gap-1"
        >
          <button
            type="button"
            aria-current={
              view === "graph" || view === "table" ? "page" : undefined
            }
            className={cn(
              "rounded-md px-2.5 py-1 text-sm font-medium",
              view === "graph" || view === "table"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            onClick={() => {
              if (view === "graph") returnHome();
              else setView("graph");
            }}
          >
            Canvas
          </button>
          {signedIn ? (
            <>
              <button
                type="button"
                aria-current={view === "people" ? "page" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1 text-sm font-medium",
                  view === "people"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                onClick={() => setView("people")}
              >
                People
              </button>
              <button
                type="button"
                aria-current={view === "tracker" ? "page" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1 text-sm font-medium",
                  view === "tracker"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                onClick={() => setView("tracker")}
              >
                Job tracker
              </button>
            </>
          ) : null}
          {authEnabled ? (
            signedIn && accountProfile ? (
              <AccountMenu profile={accountProfile} />
            ) : (
              <Link
                href="/login"
                className="inline-flex h-7 items-center rounded-full border border-border bg-background px-2.5 text-[0.8rem] font-medium hover:bg-muted"
              >
                Sign in
              </Link>
            )
          ) : null}
        </nav>
      </header>

      {view === "graph" || view === "table" ? (
      <header
        aria-label="Canvas"
        className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5 md:px-4"
      >
        {canEdit ? (
          <div className="flex items-center gap-1.5">
            {dirty && (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Unsaved layout…
              </span>
            )}
            {saving && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            <AddNodeForm
              nodes={data.nodes}
              onAdd={handleAddNode}
              onSelectExisting={handleSearchSelect}
            />
          </div>
        ) : null}

        <NodeSearch
          nodes={data.nodes}
          onSelect={handleSearchSelect}
          onCreate={
            canEdit
              ? handleCreateFromSearch
              : () => setError("Sign in to add or edit the map.")
          }
          className="w-full sm:w-64"
        />

        {focusIds.length > 0 ? (
          <div
            className="inline-flex items-center rounded-lg border p-0.5 text-xs"
            title="Limit the canvas to nodes near your focus roots"
          >
            <button
              type="button"
              className={cn(
                "rounded-md px-2 py-0.5 font-medium",
                !showFullGraph
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
              onClick={() => setShowFullGraph(false)}
            >
              Zones
            </button>
            <button
              type="button"
              className={cn(
                "rounded-md px-2 py-0.5 font-medium",
                showFullGraph
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
              onClick={() => setShowFullGraph(true)}
            >
              Full
            </button>
          </div>
        ) : null}

        <div
          className="inline-flex rounded-lg border bg-muted/40 p-0.5"
          role="tablist"
          aria-label="View"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === "graph"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium",
              view === "graph"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
            onClick={() => setView("graph")}
          >
            <Waypoints className="size-3.5" />
            Graph
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "table"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium",
              view === "table"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
            onClick={() => setView("table")}
          >
            <Table2 className="size-3.5" />
            Table
          </button>
        </div>

        {view === "graph" ? (
          <div
            className="ml-auto flex flex-wrap items-center justify-end gap-1.5"
            role="toolbar"
            aria-label="Categories on the graph"
          >
            {(Object.keys(NODE_TYPE_CONFIG) as NodeType[]).map((type) => {
              const style = NODE_TYPE_CONFIG[type];
              const shown = !hiddenTypeSet.has(type);
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={shown}
                  title={
                    type === "media"
                      ? shown
                        ? "Hide books, films, and other media"
                        : "Show books, films, and other media"
                      : type === "academic"
                        ? shown
                          ? "Hide academics and courses"
                          : "Show academics and courses"
                        : shown
                          ? `Hide ${style.label.toLowerCase()}`
                          : `Show ${style.label.toLowerCase()}`
                  }
                  onClick={() =>
                    setHiddenTypes((current) => {
                      const next = new Set(current);
                      if (next.has(type)) next.delete(type);
                      else next.add(type);
                      return [...next];
                    })
                  }
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-opacity",
                    shown
                      ? `${style.bg} ${style.border} ${style.text}`
                      : "border-border bg-muted/50 text-muted-foreground line-through opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      shown ? style.dot : "bg-muted-foreground/40",
                    )}
                  />
                  {style.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </header>
      ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <main
          className={cn(
            "relative min-h-[50vh] flex-1 md:min-h-0",
            view !== "graph" && "hidden",
          )}
          inert={view !== "graph"}
        >
          <ReactFlowProvider>
            <MindMapGraph
              data={data}
              hiddenTypes={hiddenTypeSet}
              selectedNodeId={selectedNodeId}
              focusRequest={focusRequest}
              homeRequest={homeRequest}
              focusFilterIds={focusFilterIds}
              onSelectNode={setSelectedNodeId}
              onGraphChange={handleGraphChange}
            />
          </ReactFlowProvider>
        </main>

        {view === "table" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <OrgTable
              nodes={data.nodes}
              selectedNodeId={selectedNodeId}
              onChangeLocations={
                canEdit ? handleChangeLocations : () => undefined
              }
              onPatchField={canEdit ? handlePatchOrg : () => undefined}
              onOpenOnGraph={handleSearchSelect}
            />
          </div>
        ) : null}

        {view === "people" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <PeopleDirectory
              nodes={data.nodes}
              edges={data.edges}
              selectedNodeId={selectedNodeId}
              onOpenOnGraph={handleSearchSelect}
            />
          </div>
        ) : null}

        {view === "tracker" ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <JobTracker
              nodes={data.nodes}
              edges={data.edges}
              selectedNodeId={selectedNodeId}
              onOpenOnGraph={handleSearchSelect}
              onSetTracked={canEdit ? handleSetTracked : () => undefined}
              onSetStatus={canEdit ? handleSetTrackStatus : () => undefined}
              onSetArchived={canEdit ? handleSetArchived : () => undefined}
              onSetRole={canEdit ? handleSetTrackRole : () => undefined}
              onSetDate={canEdit ? handleSetTrackDate : () => undefined}
              onPatchLink={canEdit ? handlePatchPerson : () => undefined}
            />
          </div>
        ) : null}

        {view === "graph" && selectedNode ? (
          <aside className="w-full shrink-0 border-t md:w-80 md:border-t-0 md:border-l lg:w-96">
            <NodePanel
              node={selectedNode}
              data={data}
              readOnly={!canEdit}
              isFocusRoot={focusIds.includes(selectedNode.id)}
              onToggleFocusRoot={
                canEdit &&
                (selectedNode.type === "problem" ||
                  selectedNode.type === "solution")
                  ? () => toggleFocusRoot(selectedNode.id)
                  : undefined
              }
              onSave={handleSaveNode}
              onLocate={() => handleLocateNode(selectedNode.id)}
              onSetTracked={
                canEdit
                  ? (tracked) => handleSetTracked(selectedNode.id, tracked)
                  : undefined
              }
              onDelete={handleDeleteNode}
              onAddEdge={handleAddEdge}
              onDeleteEdge={handleDeleteEdge}
              onReverseEdge={handleReverseEdge}
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}
