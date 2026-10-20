"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useViewport,
  type Node,
  type Edge,
  type OnConnect,
  type OnConnectEnd,
  type OnNodeDrag,
  type ConnectionLineComponentProps,
  type Viewport,
  ConnectionLineType,
  ConnectionMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  CreateNodeDraft,
  type CreateNodeDraftState,
} from "@/components/create-node-draft";
import {
  EdgeLabelContext,
  MindMapFlowEdge,
} from "@/components/mindmap-edge";
import { MindMapFlowNode } from "@/components/mindmap-node";
import {
  edgeEndpointIds,
  edgeHighlight,
  neighborIds,
  nodeHighlight,
  nodeZIndex,
  type EdgeHighlight,
  type NodeHighlight,
} from "@/lib/selection-highlight";
import {
  isPersonPersonEdge,
  useForceLayout,
} from "@/lib/use-force-layout";
import {
  orbitMemberIds,
  orbitPositions,
  type OrbitNodeBox,
  type OrbitPoint,
} from "@/lib/orbit-layout";
import {
  problemFlowMemberIds,
  problemFlowPathIds,
  problemFlowPositions,
  type FlowColumnLabel,
} from "@/lib/problem-flow";
import { NODE_TYPE_CONFIG } from "@/lib/node-styles";
import { isHidden } from "@/lib/node-hide";
import { visibleNodeIds } from "@/lib/visible-nodes";
import { cn } from "@/lib/utils";
import type {
  MindMapData,
  MindMapGraphChange,
  MindMapNode,
  NodeType,
} from "@/types/mindmap";

const nodeTypes = { mindmap: MindMapFlowNode };
const edgeTypes = { mindmap: MindMapFlowEdge };

const MINIMAP_COLORS: Record<NodeType, string> = {
  problem: "#f43f5e",
  solution: "#10b981",
  organization: "#0ea5e9",
  person: "#8b5cf6",
  academic: "#f59e0b",
  media: "#d946ef",
};

export type NodeFocusRequest = {
  id: string;
  token: number;
};

export type HomeRequest = {
  token: number;
};

type MindMapGraphProps = {
  data: MindMapData;
  hiddenTypes: ReadonlySet<NodeType>;
  selectedNodeId: string | null;
  focusRequest?: NodeFocusRequest | null;
  homeRequest?: HomeRequest | null;
  onSelectNode: (id: string | null) => void;
  onGraphChange: (change: MindMapGraphChange) => void;
  /** When set, only these node ids (plus always-visible selection) stay on the canvas. */
  focusFilterIds?: ReadonlySet<string> | null;
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function defaultTypeFromSource(type: NodeType): NodeType {
  switch (type) {
    case "organization":
    case "person":
    case "academic":
    case "media":
    case "problem":
      return "solution";
    case "solution":
      return "organization";
  }
}

function clientPoint(event: MouseEvent | TouchEvent): { x: number; y: number } {
  if ("changedTouches" in event && event.changedTouches[0]) {
    return {
      x: event.changedTouches[0].clientX,
      y: event.changedTouches[0].clientY,
    };
  }
  const mouse = event as MouseEvent;
  return { x: mouse.clientX, y: mouse.clientY };
}

function edgeStyle(
  social: boolean,
  highlight?: EdgeHighlight,
  focused = false,
  selected = false,
) {
  const dashed = social ? { strokeDasharray: "5 4" } : {};
  if (selected) {
    return {
      ...dashed,
      strokeWidth: social ? 1.25 : 1.35,
      stroke: "var(--primary)",
      opacity: 1,
    };
  }
  if (highlight === "path") {
    return {
      ...dashed,
      strokeWidth: social ? 1.75 : 2.25,
      stroke: "var(--primary)",
      opacity: 1,
    };
  }
  if (highlight === "neighbor") {
    return {
      ...dashed,
      strokeWidth: social ? 1.5 : 1.75,
      stroke: "var(--ring)",
      opacity: social ? 0.28 : 0.34,
    };
  }
  return social
    ? {
        strokeWidth: 1.25,
        stroke: "var(--muted-foreground)",
        strokeDasharray: "5 4",
        opacity: focused ? 0.08 : 0.16,
      }
    : { strokeWidth: 1.35, opacity: focused ? 0.08 : 0.2 };
}

function canvasZIndex(
  type: NodeType,
  selected: boolean,
  highlight?: NodeHighlight,
) {
  const rank = nodeZIndex(selected, highlight);
  if (type === "person" && rank < 3) return 3;
  return rank;
}

function nodeFocusStyle(
  selectedId: string | null,
  nodeId: string,
  highlight?: NodeHighlight,
  edgeFocused = false,
  type?: NodeType,
) {
  const onPath = highlight === "neighbor" || highlight === "path" || highlight === "endpoint";
  const dimmed = edgeFocused
    ? highlight !== "endpoint"
    : Boolean(selectedId) && nodeId !== selectedId && !onPath;
  return {
    opacity: dimmed ? 0.4 : 1,
    transition: "opacity 150ms ease",
    ...(type === "person" ? { overflow: "visible" as const } : {}),
  };
}

function toFlowNodes(
  nodes: MindMapNode[],
  selectedId: string | null,
  neighbors: Set<string>,
  endpoints?: ReadonlySet<string>,
  revealAll = false,
  pathHighlight = false,
): Node[] {
  const edgeFocused = !revealAll && Boolean(endpoints && endpoints.size > 0);
  const focusId = revealAll ? null : selectedId;
  return nodes.map((node) => {
    const selected = node.id === selectedId;
    const base = nodeHighlight(node.id, focusId, neighbors, endpoints);
    const highlight = pathHighlight && base === "neighbor" ? "path" : base;
    return {
      id: node.id,
      type: "mindmap",
      position: node.position,
      data: { node, highlight },
      selected,
      zIndex: canvasZIndex(node.type, selected, highlight),
      style: nodeFocusStyle(focusId, node.id, highlight, edgeFocused, node.type),
    };
  });
}

function toFlowEdges(
  edges: MindMapData["edges"],
  nodes: MindMapNode[],
  selectedId: string | null,
  selectedEdgeId: string | null = null,
  revealAll = false,
  pathIds: Set<string> | null = null,
): Edge[] {
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const focusId = revealAll ? null : selectedId;
  const focused =
    !revealAll && (Boolean(selectedId) || Boolean(selectedEdgeId) || Boolean(pathIds));
  return edges.map((edge) => {
    const social = isPersonPersonEdge(edge, byId);
    const selected = edge.id === selectedEdgeId;
    const highlight = selected
      ? undefined
      : pathIds
        ? pathIds.has(edge.source) && pathIds.has(edge.target)
          ? ("path" as const)
          : undefined
        : edgeHighlight(edge.source, edge.target, focusId);
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: "center",
      targetHandle: "center",
      label: edge.label,
      type: "mindmap",
      animated: false,
      selectable: true,
      selected,
      style: edgeStyle(social, highlight, focused, selected),
      zIndex: selected ? 5 : highlight === "path" || highlight === "neighbor" ? 3 : 0,
    };
  });
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

function flowSignature(data: MindMapData): string {
  return `${data.nodes.length}|${data.edges.length}|${data.nodes
    .map((n) => n.id)
    .join(",")}|${data.edges.map((e) => e.id).join(",")}`;
}

function MindMapConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
  toNode,
  connectionLineStyle,
}: ConnectionLineComponentProps) {
  const showGhost = !toNode;
  const w = 100;
  const h = 30;

  return (
    <g>
      <path
        fill="none"
        stroke={
          (connectionLineStyle?.stroke as string | undefined) ??
          "var(--muted-foreground)"
        }
        strokeWidth={
          typeof connectionLineStyle?.strokeWidth === "number"
            ? connectionLineStyle.strokeWidth
            : 1.5
        }
        d={`M ${fromX},${fromY} L ${toX},${toY}`}
      />
      {showGhost ? (
        <g
          transform={`translate(${toX - w / 2}, ${toY - h / 2})`}
          opacity={0.55}
          style={{ pointerEvents: "none" }}
        >
          <rect
            width={w}
            height={h}
            rx={6}
            fill="var(--background)"
            stroke="var(--muted-foreground)"
            strokeDasharray="4 3"
            strokeWidth={1.5}
          />
          <text
            x={w / 2}
            y={h / 2 + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--muted-foreground)"
            fontSize={11}
          >
            New node
          </text>
        </g>
      ) : null}
    </g>
  );
}

function shownGraph(data: MindMapData, visibleIds: Set<string>) {
  return {
    nodes: data.nodes.filter((node) => visibleIds.has(node.id)),
    edges: data.edges.filter(
      (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
    ),
  };
}

const ORBIT_MS = 650;

type FocalLens = "network" | "problem-flow";

function nodeExtent(node: Node | undefined) {
  return {
    width: node?.measured?.width || 96,
    height: node?.measured?.height || 48,
  };
}

function boundsCenter(
  targets: Map<string, OrbitPoint>,
  nodes: Node[],
): OrbitPoint {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [id, pos] of targets) {
    const node = byId.get(id);
    const { width, height } = nodeExtent(node);
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + width);
    maxY = Math.max(maxY, pos.y + height);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0 };
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

function nodeBox(node: Node): OrbitNodeBox {
  const width = node.measured?.width || 96;
  const height = node.measured?.height || 48;
  return {
    id: node.id,
    x: node.position.x + width / 2,
    y: node.position.y + height / 2,
    width,
    height,
  };
}

function MindMapGraphInner({
  data,
  hiddenTypes,
  selectedNodeId,
  focusRequest = null,
  homeRequest = null,
  onSelectNode,
  onGraphChange,
  focusFilterIds = null,
}: MindMapGraphProps) {
  const { screenToFlowPosition, fitView, getViewport, setViewport, setCenter } =
    useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const neighbors = neighborIds(selectedNodeId, data.edges);
  const [nodes, setNodes, onNodesChange] = useNodesState(
    toFlowNodes(data.nodes, selectedNodeId, neighbors),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    toFlowEdges(data.edges, data.nodes, selectedNodeId),
  );
  const [draft, setDraft] = useState<CreateNodeDraftState | null>(null);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [orbitId, setOrbitId] = useState<string | null>(null);
  const [orbitEpoch, setOrbitEpoch] = useState(0);
  const [focalLens, setFocalLens] = useState<FocalLens>("network");
  const [flowColumns, setFlowColumns] = useState<FlowColumnLabel[]>([]);
  const orbitIdRef = useRef<string | null>(null);
  const focalLensRef = useRef<FocalLens>("network");
  focalLensRef.current = focalLens;
  const orbitingRef = useRef(false);
  const viewportBeforeRef = useRef<Viewport | null>(null);
  const restoreRef = useRef<{
    positions: Map<string, OrbitPoint>;
    viewport: Viewport | null;
  } | null>(null);
  const snapPositionsRef = useRef<Map<string, OrbitPoint> | null>(null);
  const motionGenRef = useRef(0);
  const animRef = useRef(0);
  const pendingFramesRef = useRef<number[]>([]);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const problemFlowIds = useMemo(() => {
    if (!orbitId) return new Set<string>();
    return problemFlowMemberIds(data.nodes, data.edges, orbitId);
  }, [data, orbitId]);
  const tracesToProblem =
    orbitId != null &&
    data.nodes.some(
      (node) => node.type === "problem" && problemFlowIds.has(node.id),
    );
  const visibleIds = useMemo(() => {
    let ids: Set<string>;
    if (orbitId && focalLens === "problem-flow" && tracesToProblem) {
      ids = new Set(problemFlowIds);
    } else if (orbitId) {
      ids = new Set(orbitMemberIds(data.nodes, data.edges, orbitId));
    } else {
      ids = visibleNodeIds(
        data.nodes,
        data.edges,
        hiddenTypes,
        selectedNodeId,
      );
      if (focusFilterIds) {
        const next = new Set<string>();
        for (const id of ids) {
          if (focusFilterIds.has(id) || id === selectedNodeId) next.add(id);
        }
        ids = next;
      }
    }
    for (const node of data.nodes) {
      if (isHidden(node)) ids.delete(node.id);
    }
    return ids;
  }, [
    data,
    hiddenTypes,
    selectedNodeId,
    focusFilterIds,
    orbitId,
    focalLens,
    problemFlowIds,
    tracesToProblem,
  ]);
  const viewKey = `${flowSignature(data)}|${[...visibleIds].sort().join(",")}|orbit:${orbitId ?? ""}|lens:${focalLens}`;
  const viewKeyRef = useRef("");
  const visibleRef = useRef(visibleIds);
  visibleRef.current = visibleIds;
  const selectedRef = useRef(selectedNodeId);
  const selectedEdgeRef = useRef<string | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  const layoutSignature = useCallback(
    (next: MindMapData, ids: Iterable<string>) =>
      `${flowSignature(next)}|${[...ids].sort().join(",")}|orbit:${orbitIdRef.current ?? ""}|lens:${focalLensRef.current}`,
    [],
  );

  const persistPositions = useCallback(
    (positions: Record<string, { x: number; y: number }>) => {
      onGraphChange({ reason: "positions", positions });
    },
    [onGraphChange],
  );

  const didFitRef = useRef(false);
  const userMovedRef = useRef(false);
  const framingRef = useRef(false);
  const frameGraph = useCallback(
    (maxZoom: number, duration: number) => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      // A 0×0 pane and unmeasured nodes make fitView divide 0/0 and store NaN.
      const measured = nodesRef.current.some(
        (node) =>
          (node.measured?.width ?? 0) > 0 &&
          (node.measured?.height ?? 0) > 0 &&
          Number.isFinite(node.position.x) &&
          Number.isFinite(node.position.y),
      );
      if (!rect || rect.width < 8 || rect.height < 8 || !measured) return false;
      framingRef.current = true;
      void fitView({ padding: 0.18, duration, maxZoom }).finally(() => {
        window.setTimeout(() => {
          framingRef.current = false;
        }, 50);
      });
      return true;
    },
    [fitView],
  );
  const frameGraphRef = useRef(frameGraph);
  frameGraphRef.current = frameGraph;
  const cancelSettleFrame = useRef<(() => void) | null>(null);
  const scheduleFrame = useCallback((maxZoom: number, duration: number) => {
    let attempts = 0;
    let raf = 0;
    const tick = () => {
      if (frameGraphRef.current(maxZoom, duration)) return;
      if (attempts >= 60) return;
      attempts += 1;
      raf = requestAnimationFrame(tick);
    };
    const timer = window.setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, 40);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, []);

  const layoutData = useMemo(() => {
    const ids = visibleNodeIds(data.nodes, data.edges, hiddenTypes);
    for (const node of data.nodes) {
      if (isHidden(node)) ids.delete(node.id);
    }
    return shownGraph(data, ids);
  }, [data, hiddenTypes]);

  const force = useForceLayout({
    data: layoutData,
    setNodes,
    onSettled: (positions) => {
      persistPositions(positions);
      if (didFitRef.current || userMovedRef.current) return;
      didFitRef.current = true;
      cancelSettleFrame.current?.();
      cancelSettleFrame.current = scheduleFrame(1.1, 450);
    },
  });

  // Saved positions sit around the origin, which the default camera misses.
  // Cap the first frame so a too-early fit cannot zoom into the core and
  // clip the rim; the simulation's settle frames the final bounds.
  // Wait until the pane and nodes have size — fitting earlier yields NaN.
  useEffect(() => {
    const cancel = scheduleFrame(0.8, 0);
    return () => {
      cancel();
      cancelSettleFrame.current?.();
    };
  }, [scheduleFrame]);

  function cancelOrbitMotion() {
    motionGenRef.current += 1;
    cancelAnimationFrame(animRef.current);
    for (const frame of pendingFramesRef.current) cancelAnimationFrame(frame);
    pendingFramesRef.current = [];
  }

  function animatePositions(
    targets: Map<string, OrbitPoint>,
    onDone?: () => void,
  ) {
    const generation = motionGenRef.current;
    const started = performance.now();
    const origins = new Map(
      nodesRef.current.map((node) => [node.id, { ...node.position }]),
    );
    const step = (now: number) => {
      if (motionGenRef.current !== generation) return;
      const t = Math.min(1, (now - started) / ORBIT_MS);
      const eased = 1 - (1 - t) ** 3;
      setNodes((current) =>
        current.map((node) => {
          const target = targets.get(node.id);
          if (!target) return node;
          const origin = origins.get(node.id) ?? target;
          const x = origin.x + (target.x - origin.x) * eased;
          const y = origin.y + (target.y - origin.y) * eased;
          if (node.position.x === x && node.position.y === y) return node;
          return { ...node, position: { x, y } };
        }),
      );
      if (t < 1) animRef.current = requestAnimationFrame(step);
      else onDone?.();
    };
    animRef.current = requestAnimationFrame(step);
  }

  function frameRing(origin: OrbitPoint, targets: Map<string, OrbitPoint>) {
    const byId = new Map(nodesRef.current.map((node) => [node.id, node]));
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [id, pos] of targets) {
      const node = byId.get(id);
      const { width, height } = nodeExtent(node);
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + width);
      maxY = Math.max(maxY, pos.y + height);
    }
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect || rect.width < 8 || rect.height < 8 || !Number.isFinite(minX)) return;
    const pad = 0.2;
    const zoom = Math.min(
      1.2,
      (rect.width * (1 - pad * 2)) / Math.max(1, maxX - minX),
      (rect.height * (1 - pad * 2)) / Math.max(1, maxY - minY),
    );
    if (!Number.isFinite(zoom) || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) {
      return;
    }
    framingRef.current = true;
    void setCenter(origin.x, origin.y, {
      zoom: Math.max(0.2, zoom),
      duration: ORBIT_MS,
    }).finally(() => {
      window.setTimeout(() => {
        framingRef.current = false;
      }, 50);
    });
  }

  const enterOrbit = useCallback(
    (id: string) => {
      cancelOrbitMotion();
      if (!orbitIdRef.current) viewportBeforeRef.current = getViewport();
      orbitIdRef.current = id;
      restoreRef.current = null;
      snapPositionsRef.current = null;
      force.pause();
      setSelectedEdgeId(null);
      onSelectNode(id);
      setOrbitId(id);
      setOrbitEpoch((epoch) => epoch + 1);
    },
    [force, getViewport, onSelectNode],
  );

  const leaveOrbit = useCallback(
    (options?: { restoreView?: boolean; animate?: boolean }) => {
      if (!orbitIdRef.current && !orbitingRef.current) return;
      cancelOrbitMotion();
      const positions = force.positions();
      const restoreView = options?.restoreView !== false;
      const viewport = restoreView ? viewportBeforeRef.current : null;
      orbitIdRef.current = null;
      focalLensRef.current = "network";
      viewportBeforeRef.current = null;
      setFocalLens("network");
      setFlowColumns([]);
      if (options?.animate === false) {
        restoreRef.current = null;
        snapPositionsRef.current = positions;
        setOrbitId(null);
        force.resume();
        return;
      }
      restoreRef.current = { positions, viewport };
      setOrbitId(null);
      setOrbitEpoch((epoch) => epoch + 1);
    },
    [force],
  );

  // Sync from parent when the graph or the visible set changes, not on every drag tick.
  useEffect(() => {
    if (!selectedEdgeId) return;
    if (!data.edges.some((edge) => edge.id === selectedEdgeId)) {
      setSelectedEdgeId(null);
    }
  }, [data.edges, selectedEdgeId]);

  useEffect(() => {
    if (!selectedNodeId) return;
    setSelectedEdgeId(null);
  }, [selectedNodeId]);

  useEffect(() => {
    const edgeId = selectedNodeId ? null : selectedEdgeId;
    const endpoints = edgeEndpointIds(edgeId, data.edges);
    const nextNeighbors = neighborIds(selectedNodeId, data.edges);
    const selectionChanged = selectedRef.current !== selectedNodeId;
    const edgeSelectionChanged = selectedEdgeRef.current !== edgeId;
    selectedRef.current = selectedNodeId;
    selectedEdgeRef.current = edgeId;
    const leavingOrbit = orbitingRef.current && !orbitId;
    orbitingRef.current = orbitId != null;
    const view = shownGraph(data, visibleIds);
    const inFlow = focalLensRef.current === "problem-flow";
    const pathIds =
      inFlow && selectedNodeId
        ? problemFlowPathIds(data.nodes, data.edges, selectedNodeId)
        : null;
    const showAll = inFlow && pathIds == null;
    const focusId = showAll ? null : selectedNodeId;
    const highlightNeighbors = pathIds
      ? new Set([...pathIds].filter((id) => id !== selectedNodeId))
      : nextNeighbors;
    if (viewKey === viewKeyRef.current) {
      setNodes((current) =>
        current.map((n) => {
          const selected = n.id === selectedNodeId;
          const base = nodeHighlight(
            n.id,
            focusId,
            highlightNeighbors,
            endpoints,
          );
          const highlight = pathIds && base === "neighbor" ? "path" : base;
          const source =
            data.nodes.find((dn) => dn.id === n.id) ??
            (n.data as { node: MindMapNode }).node;
          return {
            ...n,
            selected,
            zIndex: canvasZIndex(source.type, selected, highlight),
            style: nodeFocusStyle(
              focusId,
              n.id,
              highlight,
              !showAll && endpoints.size > 0,
              source.type,
            ),
            data: {
              node: source,
              highlight,
            },
          };
        }),
      );
      setEdges((current) => {
        const shownSelected = current.find((edge) => edge.selected)?.id ?? null;
        if (
          !selectionChanged &&
          !edgeSelectionChanged &&
          shownSelected === edgeId
        ) {
          return current;
        }
        return toFlowEdges(
          view.edges,
          view.nodes,
          selectedNodeId,
          edgeId,
          showAll,
          pathIds,
        );
      });
      return;
    }
    viewKeyRef.current = viewKey;
    const snap = snapPositionsRef.current;
    snapPositionsRef.current = null;
    const live = leavingOrbit ? restoreRef.current?.positions : null;
    setNodes((current) => {
      const positions = new Map(current.map((node) => [node.id, node.position]));
      const nodes = view.nodes.map((node) => {
        if (snap?.has(node.id)) return { ...node, position: snap.get(node.id)! };
        if (leavingOrbit) {
          const kept = positions.get(node.id);
          if (kept) return { ...node, position: kept };
          const restored = live?.get(node.id);
          if (restored) return { ...node, position: restored };
          return node;
        }
        const position = positions.get(node.id);
        return position ? { ...node, position } : node;
      });
      return toFlowNodes(
        nodes,
        selectedNodeId,
        highlightNeighbors,
        endpoints,
        showAll,
        pathIds != null,
      );
    });
    setEdges(
      toFlowEdges(
        view.edges,
        view.nodes,
        selectedNodeId,
        edgeId,
        showAll,
        pathIds,
      ),
    );
  }, [data, orbitId, selectedEdgeId, selectedNodeId, setNodes, setEdges, viewKey, visibleIds]);

  useEffect(() => {
    if (!orbitIdRef.current && !restoreRef.current) return;
    let cancelled = false;
    const wait = (attempt: number) => {
      if (cancelled) return;
      const want = visibleRef.current;
      const have = new Set(nodesRef.current.map((node) => node.id));
      const ready =
        want.size > 0 &&
        have.size === want.size &&
        [...want].every((id) => have.has(id));
      const unmeasured =
        ready &&
        nodesRef.current.some(
          (node) => want.has(node.id) && (node.measured?.width ?? 0) <= 0,
        );
      if ((!ready && attempt < 8) || (unmeasured && attempt < 16)) {
        const frame = requestAnimationFrame(() => wait(attempt + 1));
        pendingFramesRef.current.push(frame);
        return;
      }
      if (cancelled) return;
      const centerId = orbitIdRef.current;
      if (centerId) {
        const current = nodesRef.current.filter((node) => want.has(node.id));
        const hub = current.find((node) => node.id === centerId);
        if (!hub) return;
        const hubBox = nodeBox(hub);
        const origin = { x: hubBox.x, y: hubBox.y };
        if (focalLensRef.current === "problem-flow") {
          const typeById = new Map(
            dataRef.current.nodes.map((node) => [node.id, node.type]),
          );
          const names = new Map(
            dataRef.current.nodes.map((node) => [node.id, node.name]),
          );
          const layout = problemFlowPositions(
            origin,
            current.map(nodeBox),
            typeById,
            names,
            centerId,
            dataRef.current.edges,
          );
          setFlowColumns(layout.columns);
          animatePositions(layout.positions);
          frameRing(boundsCenter(layout.positions, current), layout.positions);
          return;
        }
        setFlowColumns([]);
        const neighbors = current
          .filter((node) => node.id !== centerId)
          .map(nodeBox);
        const targets = orbitPositions(origin, hubBox, neighbors);
        animatePositions(targets);
        frameRing(origin, targets);
        return;
      }
      const pending = restoreRef.current;
      if (!pending) return;
      restoreRef.current = null;
      animatePositions(pending.positions, () => {
        if (!cancelled) force.resume();
      });
      if (pending.viewport) {
        const rect = wrapperRef.current?.getBoundingClientRect();
        const { x, y, zoom } = pending.viewport;
        if (
          !rect ||
          rect.width < 8 ||
          rect.height < 8 ||
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          !Number.isFinite(zoom)
        ) {
          return;
        }
        framingRef.current = true;
        void setViewport(pending.viewport, { duration: ORBIT_MS }).finally(() => {
          window.setTimeout(() => {
            framingRef.current = false;
          }, 50);
        });
      }
    };
    const frame = requestAnimationFrame(() => wait(0));
    pendingFramesRef.current.push(frame);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [orbitEpoch, force, setViewport]);

  const onNodeDragStart: OnNodeDrag = useCallback(
    (_event, node) => {
      if (orbitIdRef.current) return;
      force.fixNode(node.id, node.position.x, node.position.y);
    },
    [force],
  );

  const onNodeDrag: OnNodeDrag = useCallback(
    (_event, node) => {
      if (orbitIdRef.current) return;
      force.dragNode(node.id, node.position.x, node.position.y);
    },
    [force],
  );

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_event, node) => {
      if (orbitIdRef.current) return;
      force.releaseNode(node.id);
    },
    [force],
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) return;
      setDraft(null);
      const current = dataRef.current;
      const exists = current.edges.some(
        (edge) =>
          edge.source === connection.source && edge.target === connection.target,
      );
      if (exists) return;
      const newEdge = {
        id: `e-${connection.source}-${connection.target}-${Date.now()}`,
        source: connection.source,
        target: connection.target,
      };
      const next = { ...current, edges: [...current.edges, newEdge] };
      dataRef.current = next;
      const shown = shownGraph(next, visibleRef.current);
      viewKeyRef.current = layoutSignature(next, visibleRef.current);
      setEdges(toFlowEdges(shown.edges, shown.nodes, selectedNodeId));
      onGraphChange({ reason: "connect", edge: newEdge });
    },
    [layoutSignature, onGraphChange, selectedNodeId, setEdges],
  );

  const onConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      if (connectionState.toNode || !connectionState.fromNode) return;

      const screen = clientPoint(event);
      const flow = screenToFlowPosition(screen);
      const sourceId = connectionState.fromNode.id;
      const source = dataRef.current.nodes.find((n) => n.id === sourceId);
      const sourceType = (source?.type ?? "solution") as NodeType;

      setEditingEdgeId(null);
      setDraft({
        sourceId,
        position: { x: flow.x - 50, y: flow.y - 15 },
        screen,
        defaultType: defaultTypeFromSource(sourceType),
      });
    },
    [screenToFlowPosition],
  );

  const cancelDraft = useCallback(() => setDraft(null), []);

  const confirmDraft = useCallback(
    (input: {
      name: string;
      type: NodeType;
      linkedIn?: string;
      notes?: string;
      imageUrl?: string;
    }) => {
      if (!draft) return;
      const current = dataRef.current;
      const id = `${slugify(input.name) || "node"}-${Date.now()}`;
      const newNode: MindMapNode = {
        id,
        name: input.name,
        type: input.type,
        notes: input.notes ?? "",
        tags: [],
        position: draft.position,
        ...(input.linkedIn ? { linkedIn: input.linkedIn } : {}),
        ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
      };
      const newEdge = {
        id: `e-${draft.sourceId}-${id}-${Date.now()}`,
        source: draft.sourceId,
        target: id,
      };
      const next = {
        ...current,
        nodes: [...current.nodes, newNode],
        edges: [...current.edges, newEdge],
      };
      dataRef.current = next;
      const shownIds = new Set(visibleRef.current);
      shownIds.add(id);
      const shown = shownGraph(next, shownIds);
      viewKeyRef.current = layoutSignature(next, shownIds);
      const createdNeighbors = neighborIds(id, next.edges);
      setNodes(toFlowNodes(shown.nodes, id, createdNeighbors));
      setEdges(toFlowEdges(shown.edges, shown.nodes, id));
      setDraft(null);
      setSelectedEdgeId(null);
      onSelectNode(id);
      onGraphChange({ reason: "create", node: newNode, edge: newEdge });
    },
    [draft, layoutSignature, onGraphChange, onSelectNode, setEdges, setNodes],
  );

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes);
      const removes = changes.filter((c) => c.type === "remove");
      if (removes.length === 0) return;
      const removedIds = new Set(removes.map((c) => c.id));
      const current = dataRef.current;
      const next = {
        ...current,
        edges: current.edges.filter((e) => !removedIds.has(e.id)),
      };
      dataRef.current = next;
      viewKeyRef.current = layoutSignature(next, visibleRef.current);
      onGraphChange({ reason: "removeEdges", ids: [...removedIds] });
    },
    [layoutSignature, onEdgesChange, onGraphChange],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedEdgeId(null);
      onSelectNode(node.id);
    },
    [onSelectNode],
  );

  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.stopPropagation();
      setDraft(null);
      setSelectedEdgeId(edge.id);
      if (selectedRef.current) onSelectNode(null);
    },
    [onSelectNode],
  );

  const onNodeDoubleClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      event.stopPropagation();
      if (orbitIdRef.current === node.id) {
        leaveOrbit();
        return;
      }
      enterOrbit(node.id);
    },
    [enterOrbit, leaveOrbit],
  );

  const commitEdgeLabel = useCallback(
    (id: string, value: string) => {
      const next = value.trim();
      setEditingEdgeId((current) => (current === id ? null : current));
      const previous =
        dataRef.current.edges.find((edge) => edge.id === id)?.label ?? "";
      if (previous === next) return;
      const label = next || undefined;
      setEdges((current) =>
        current.map((edge) => (edge.id === id ? { ...edge, label } : edge)),
      );
      onGraphChange({ reason: "label", id, label });
    },
    [onGraphChange, setEdges],
  );

  const edgeLabelApi = useMemo(
    () => ({
      editingId: editingEdgeId,
      commit: commitEdgeLabel,
      cancel: () => setEditingEdgeId(null),
      select: (id: string) => {
        setDraft(null);
        setSelectedEdgeId(id);
        if (selectedRef.current) onSelectNode(null);
      },
    }),
    [commitEdgeLabel, editingEdgeId, onSelectNode],
  );

  const onEdgeDoubleClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.stopPropagation();
      setDraft(null);
      setEditingEdgeId(edge.id);
    },
    [],
  );

  const onPaneClick = useCallback(() => {
    setSelectedEdgeId(null);
    if (draft) {
      setDraft(null);
      return;
    }
    if (orbitIdRef.current) {
      leaveOrbit();
      return;
    }
    onSelectNode(null);
  }, [draft, leaveOrbit, onSelectNode]);

  const leaveOrbitRef = useRef(leaveOrbit);
  leaveOrbitRef.current = leaveOrbit;

  useEffect(() => {
    if (!homeRequest) return;
    setDraft(null);
    setSelectedEdgeId(null);
    setEditingEdgeId(null);
    if (orbitIdRef.current || orbitingRef.current) {
      leaveOrbitRef.current({ restoreView: false, animate: false });
    }
    return scheduleFrame(1.1, 450);
  }, [homeRequest, scheduleFrame]);

  useEffect(() => {
    if (!focusRequest) return;
    if (orbitIdRef.current) leaveOrbit({ restoreView: false, animate: false });
    const id = focusRequest.id;
    let attempts = 0;
    let raf = 0;
    const tick = () => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      const node = nodesRef.current.find((item) => item.id === id);
      const ready =
        rect &&
        rect.width >= 8 &&
        rect.height >= 8 &&
        (node?.measured?.width ?? 0) > 0 &&
        (node?.measured?.height ?? 0) > 0 &&
        Number.isFinite(node?.position.x) &&
        Number.isFinite(node?.position.y);
      if (!ready && attempts < 60) {
        attempts += 1;
        raf = requestAnimationFrame(tick);
        return;
      }
      if (!ready) return;
      void fitView({
        nodes: [{ id }],
        duration: 450,
        padding: 0.4,
        maxZoom: 1.5,
      });
    };
    const timer = window.setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, 40);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [focusRequest, fitView, leaveOrbit]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (orbitIdRef.current) {
          event.preventDefault();
          leaveOrbit();
          return;
        }
        if (selectedEdgeRef.current) setSelectedEdgeId(null);
        return;
      }
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const id = selectedEdgeRef.current;
      if (!id || isTypingTarget(event.target)) return;
      event.preventDefault();
      selectedEdgeRef.current = null;
      setSelectedEdgeId(null);
      setEditingEdgeId((current) => (current === id ? null : current));
      onGraphChange({ reason: "removeEdges", ids: [id] });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leaveOrbit, onGraphChange]);

  return (
    <div ref={wrapperRef} className="relative h-full w-full">
      <EdgeLabelContext.Provider value={edgeLabelApi}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onEdgeClick={onEdgeClick}
        onEdgeDoubleClick={onEdgeDoubleClick}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        nodesDraggable={!orbitId}
        zoomOnDoubleClick={false}
        onMoveStart={() => {
          if (!framingRef.current) userMovedRef.current = true;
        }}
        connectionMode={ConnectionMode.Loose}
        connectionLineType={ConnectionLineType.Straight}
        connectionLineComponent={MindMapConnectionLine}
        connectionLineStyle={{
          stroke: "var(--muted-foreground)",
          strokeWidth: 1.5,
        }}
        connectionRadius={48}
        isValidConnection={(connection) =>
          !!connection.source &&
          !!connection.target &&
          connection.source !== connection.target
        }
        deleteKeyCode={null}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <DottedBackground />
        {focalLens === "problem-flow" ? (
          <FlowColumnLabels columns={flowColumns} />
        ) : null}
        <Controls
          showInteractive={false}
          className={orbitId ? "!mb-14" : undefined}
        />
        <MiniMap
          nodeColor={(n) => {
            const type = (n.data as { node: MindMapNode }).node?.type as NodeType;
            return type ? MINIMAP_COLORS[type] : "#888";
          }}
          maskColor="rgba(0,0,0,0.08)"
          className={orbitId ? "!mb-14 !bg-background/80" : "!bg-background/80"}
        />
      </ReactFlow>
      </EdgeLabelContext.Provider>

      {orbitId ? (
        <button
          type="button"
          onClick={() => leaveOrbit()}
          className="absolute top-3 left-3 z-20 inline-flex items-center gap-1.5 rounded-full border bg-background/90 px-3 py-1 text-xs font-medium shadow-sm backdrop-blur-sm hover:bg-muted"
          title="Back to the full graph"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </button>
      ) : null}

      {orbitId ? (
        <FocalLensBar
          lens={focalLens}
          tracesToProblem={tracesToProblem}
          onChange={(next) => {
            if (next === "problem-flow" && !tracesToProblem) return;
            if (focalLensRef.current === next) return;
            cancelOrbitMotion();
            focalLensRef.current = next;
            setFocalLens(next);
            setFlowColumns([]);
            setOrbitEpoch((epoch) => epoch + 1);
          }}
        />
      ) : null}

      {draft ? (
        <CreateNodeDraft
          draft={draft}
          nodes={data.nodes}
          onConfirm={confirmDraft}
          onSelectExisting={(id) => {
            setDraft(null);
            onSelectNode(id);
            window.setTimeout(() => {
              const rect = wrapperRef.current?.getBoundingClientRect();
              if (!rect || rect.width < 8 || rect.height < 8) return;
              void fitView({
                nodes: [{ id }],
                duration: 450,
                padding: 0.4,
                maxZoom: 1.5,
              });
            }, 50);
          }}
          onCancel={cancelDraft}
        />
      ) : null}
    </div>
  );
}

function FlowColumnLabels({ columns }: { columns: FlowColumnLabel[] }) {
  const { x, y, zoom } = useViewport();
  const finite = Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(zoom) && zoom > 0;
  if (!finite || columns.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {columns.map((column, index) => (
        <div
          key={`${column.type}-${index}`}
          className="absolute text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
          style={{
            left: column.x * zoom + x,
            top: column.y * zoom + y - 8,
            transform: "translate(-50%, -100%)",
          }}
        >
          {NODE_TYPE_CONFIG[column.type].label}
        </div>
      ))}
    </div>
  );
}

function FocalLensBar({
  lens,
  tracesToProblem,
  onChange,
}: {
  lens: FocalLens;
  tracesToProblem: boolean;
  onChange: (lens: FocalLens) => void;
}) {
  const options = [
    {
      id: "network" as const,
      label: "Network",
      title: "Neighbors around this node",
      enabled: true,
    },
    {
      id: "problem-flow" as const,
      label: "Problem flow",
      title: tracesToProblem
        ? "Problem, each solution generation, organizations, then people"
        : "Only useful when this node traces back to a problem",
      enabled: tracesToProblem,
    },
  ];
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center">
      <div
        className="pointer-events-auto inline-flex items-center gap-0.5 rounded-full border bg-background/95 p-1 shadow-sm backdrop-blur-sm"
        role="tablist"
        aria-label="Focal layout"
      >
        {options.map((option) => {
          const active = lens === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-disabled={!option.enabled}
              disabled={!option.enabled}
              title={option.title}
              onClick={() => onChange(option.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium tracking-wide",
                active && "bg-foreground text-background",
                !active &&
                  option.enabled &&
                  "text-muted-foreground hover:text-foreground",
                !option.enabled && "cursor-not-allowed text-muted-foreground/40",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  active && "bg-background",
                  !active && option.enabled && "bg-muted-foreground/35",
                  !option.enabled && "bg-muted-foreground/20",
                )}
              />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DottedBackground() {
  const { x, y, zoom } = useViewport();
  const { setViewport } = useReactFlow();
  const finite =
    Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(zoom) && zoom > 0;
  const repaired = useRef(false);
  useEffect(() => {
    if (finite) {
      repaired.current = false;
      return;
    }
    if (repaired.current) return;
    repaired.current = true;
    void setViewport({ x: 0, y: 0, zoom: 1 });
  }, [finite, setViewport]);
  if (!finite) return null;
  return <Background gap={20} size={1} />;
}

export function MindMapGraph(props: MindMapGraphProps) {
  // useReactFlow requires provider — parent already wraps ReactFlowProvider.
  return <MindMapGraphInner {...props} />;
}
