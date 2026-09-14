"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { Node } from "@xyflow/react";
import type { MindMapData } from "@/types/mindmap";

export type ForceSimNode = SimulationNodeDatum & {
  id: string;
  pinned?: boolean;
};

type ForceSimLink = SimulationLinkDatum<ForceSimNode> & {
  id: string;
};

function topologyKey(data: MindMapData): string {
  return `${data.nodes.map((n) => n.id).join(",")}|${data.edges
    .map((e) => `${e.id}:${e.source}->${e.target}`)
    .join(",")}`;
}

/**
 * Runs a d3-force simulation and writes positions into React Flow nodes.
 * Unpinned nodes settle by links; pinned nodes stay fixed (fx/fy).
 * New nodes from JSON/API join on the next topology restart.
 */
export function useForceLayout({
  data,
  setNodes,
  onSettled,
  enabled = true,
}: {
  data: MindMapData;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  onSettled?: (positions: Record<string, { x: number; y: number }>) => void;
  enabled?: boolean;
}) {
  const simRef = useRef<Simulation<ForceSimNode, ForceSimLink> | null>(null);
  const nodesByIdRef = useRef<Map<string, ForceSimNode>>(new Map());
  const topoRef = useRef<string>("");
  const draggingRef = useRef<Set<string>>(new Set());
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  useEffect(() => {
    if (!enabled) return;

    const key = topologyKey(data);
    const existing = nodesByIdRef.current;
    const nextMap = new Map<string, ForceSimNode>();

    for (const node of data.nodes) {
      const prev = existing.get(node.id);
      const simNode: ForceSimNode = prev ?? {
        id: node.id,
        x: node.position.x,
        y: node.position.y,
      };
      if (!prev) {
        simNode.x = node.position.x;
        simNode.y = node.position.y;
      }
      if (node.pinned) {
        simNode.pinned = true;
        simNode.fx = node.position.x;
        simNode.fy = node.position.y;
      } else if (!draggingRef.current.has(node.id)) {
        simNode.pinned = false;
        simNode.fx = undefined;
        simNode.fy = undefined;
      }
      nextMap.set(node.id, simNode);
    }

    nodesByIdRef.current = nextMap;
    const simNodes = Array.from(nextMap.values());
    const simLinks: ForceSimLink[] = data.edges
      .filter((e) => nextMap.has(e.source) && nextMap.has(e.target))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
      }));

    if (key !== topoRef.current || !simRef.current) {
      topoRef.current = key;
      simRef.current?.stop();

      const simulation = forceSimulation<ForceSimNode>(simNodes)
        .force(
          "link",
          forceLink<ForceSimNode, ForceSimLink>(simLinks)
            .id((d) => d.id)
            .distance(140)
            .strength(0.55),
        )
        .force("charge", forceManyBody().strength(-420))
        .force("center", forceCenter(0, 0).strength(0.05))
        .force("collide", forceCollide<ForceSimNode>().radius(56).strength(0.8))
        .alpha(1)
        .alphaDecay(0.028);

      simulation.on("tick", () => {
        setNodes((current) =>
          current.map((flowNode) => {
            const simNode = nextMap.get(flowNode.id);
            if (!simNode || simNode.x == null || simNode.y == null) return flowNode;
            return {
              ...flowNode,
              position: { x: simNode.x, y: simNode.y },
            };
          }),
        );
      });

      simulation.on("end", () => {
        const positions: Record<string, { x: number; y: number }> = {};
        for (const n of nextMap.values()) {
          if (n.x == null || n.y == null) continue;
          positions[n.id] = { x: n.x, y: n.y };
        }
        onSettledRef.current?.(positions);
      });

      simRef.current = simulation;
    } else {
      const simulation = simRef.current;
      simulation.nodes(simNodes);
      const linkForce = simulation.force("link") as ReturnType<
        typeof forceLink<ForceSimNode, ForceSimLink>
      > | null;
      linkForce?.links(simLinks);
    }
  }, [data, enabled, setNodes]);

  useEffect(() => {
    return () => {
      simRef.current?.stop();
      simRef.current = null;
    };
  }, []);

  return useMemo(
    () => ({
      fixNode(id: string, x: number, y: number) {
        const simNode = nodesByIdRef.current.get(id);
        if (!simNode) return;
        draggingRef.current.add(id);
        simNode.fx = x;
        simNode.fy = y;
        simRef.current?.alphaTarget(0.25).restart();
      },
      dragNode(id: string, x: number, y: number) {
        const simNode = nodesByIdRef.current.get(id);
        if (!simNode) return;
        simNode.fx = x;
        simNode.fy = y;
      },
      releaseNode(id: string, pinned?: boolean) {
        const simNode = nodesByIdRef.current.get(id);
        draggingRef.current.delete(id);
        if (!simNode) return;
        if (pinned) {
          simNode.pinned = true;
        } else {
          simNode.pinned = false;
          simNode.fx = undefined;
          simNode.fy = undefined;
          simRef.current?.alphaTarget(0).alpha(0.35).restart();
        }
      },
    }),
    [],
  );
}
