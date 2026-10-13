"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { Node } from "@xyflow/react";
import { PERSON_NODE_SIZE } from "@/lib/node-styles";
import type { MindMapData, NodeType } from "@/types/mindmap";

export type ForceSimNode = SimulationNodeDatum & {
  id: string;
  pinned?: boolean;
  type?: NodeType;
};

type ForceSimLink = SimulationLinkDatum<ForceSimNode> & {
  id: string;
};

function topologyKey(data: MindMapData): string {
  const problems = data.nodes
    .filter((node) => node.type === "problem")
    .map((node) => node.id)
    .join(",");
  return `${data.nodes.map((n) => n.id).join(",")}|${data.edges
    .map((e) => `${e.id}:${e.source}->${e.target}`)
    .join(",")}|${problems}`;
}

type ClusterTie = { id: string; dist: number };

type ClusterModel = {
  ties: Map<string, ClusterTie[]>;
  exclusive: Map<string, string[]>;
  cross: Map<string, number>;
};

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Problems are clusters. A node belongs to every problem at its shortest
 * hop-distance, so a bridge is pulled toward both. A connected group with
 * no path to a problem is its own small cluster. Centers are not stored:
 * the force recomputes them from live positions.
 */
function buildClusterModel(
  nodes: { id: string; type?: string }[],
  links: { source: string; target: string }[],
): ClusterModel {
  const adjacent = new Map<string, string[]>(nodes.map((node) => [node.id, []]));
  for (const link of links) {
    adjacent.get(link.source)?.push(link.target);
    adjacent.get(link.target)?.push(link.source);
  }
  const problems = nodes.filter((node) => node.type === "problem").map((node) => node.id);
  const hops = new Map<string, Map<string, number>>(
    nodes.map((node) => [node.id, new Map()]),
  );
  for (const problemId of problems) {
    const distance = new Map<string, number>([[problemId, 0]]);
    const queue = [problemId];
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id) continue;
      const depth = distance.get(id) ?? 0;
      for (const next of adjacent.get(id) ?? []) {
        if (distance.has(next)) continue;
        distance.set(next, depth + 1);
        queue.push(next);
      }
    }
    for (const [id, depth] of distance) hops.get(id)?.set(problemId, depth);
  }

  const ties = new Map<string, ClusterTie[]>();
  for (const node of nodes) {
    if (node.type === "problem") {
      ties.set(node.id, [{ id: node.id, dist: 0 }]);
      continue;
    }
    const table = hops.get(node.id);
    if (!table || table.size === 0) continue;
    let best = Infinity;
    for (const depth of table.values()) if (depth < best) best = depth;
    ties.set(
      node.id,
      [...table.entries()]
        .filter(([, depth]) => depth === best)
        .map(([id, dist]) => ({ id, dist })),
    );
  }

  const seen = new Set(ties.keys());
  for (const node of nodes) {
    if (seen.has(node.id)) continue;
    const stack = [node.id];
    seen.add(node.id);
    const members: string[] = [];
    while (stack.length > 0) {
      const id = stack.pop();
      if (!id) continue;
      members.push(id);
      for (const next of adjacent.get(id) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    const root = members.reduce((smallest, id) => (id < smallest ? id : smallest));
    for (const id of members) ties.set(id, [{ id: `c:${root}`, dist: 1 }]);
  }

  const exclusive = new Map<string, string[]>();
  for (const [id, nodeTies] of ties) {
    if (nodeTies.length !== 1) continue;
    const clusterId = nodeTies[0].id;
    const members = exclusive.get(clusterId) ?? [];
    members.push(id);
    exclusive.set(clusterId, members);
  }
  for (const nodeTies of ties.values()) {
    for (const tie of nodeTies) {
      if (!exclusive.has(tie.id)) exclusive.set(tie.id, []);
    }
  }

  const cross = new Map<string, number>();
  for (const link of links) {
    const left = ties.get(link.source) ?? [];
    const right = ties.get(link.target) ?? [];
    const pairs = new Set<string>();
    for (const a of left) {
      for (const b of right) {
        if (a.id !== b.id) pairs.add(pairKey(a.id, b.id));
      }
    }
    for (const key of pairs) cross.set(key, (cross.get(key) ?? 0) + 1);
  }

  return { ties, exclusive, cross };
}

/**
 * Holds each cluster around the live average of its own members. Whole yards
 * push apart; shared links weaken that push, and a node tied to two problems
 * drags both centers toward itself. Centers are never fixed.
 */
function forceClusters(model: ClusterModel) {
  let nodes: ForceSimNode[] = [];
  const byId = new Map<string, ForceSimNode>();
  const pullAt = [0.08, 0.12, 0.05];
  const repel = 28;
  const reach = 1400;
  const crossDamp = 0.8;
  const constellation = 0.012;
  const rimPad = 200;

  function pullStrength(dist: number): number {
    if (dist <= 0) return pullAt[0];
    if (dist === 1) return pullAt[1];
    return pullAt[2];
  }

  function force(alpha: number) {
    const centroids = new Map<string, { x: number; y: number }>();
    for (const [clusterId, memberIds] of model.exclusive) {
      let sx = 0;
      let sy = 0;
      let count = 0;
      for (const id of memberIds) {
        const node = byId.get(id);
        if (!node || node.type === "person" || node.x == null || node.y == null) continue;
        sx += node.x;
        sy += node.y;
        count += 1;
      }
      if (count > 0) centroids.set(clusterId, { x: sx / count, y: sy / count });
    }
    if (centroids.size === 0) return;
    let meanX = 0;
    let meanY = 0;
    for (const centroid of centroids.values()) {
      meanX += centroid.x;
      meanY += centroid.y;
    }
    meanX /= centroids.size;
    meanY /= centroids.size;
    const radii = [...centroids.values()]
      .map((centroid) => Math.hypot(centroid.x - meanX, centroid.y - meanY))
      .sort((a, b) => a - b);
    const rim = (radii[Math.floor(radii.length * 0.75)] ?? 400) + rimPad;

    const clusterIds = [...centroids.keys()];
    const push = new Map(clusterIds.map((id) => [id, { x: 0, y: 0 }]));
    for (let i = 0; i < clusterIds.length; i += 1) {
      for (let j = i + 1; j < clusterIds.length; j += 1) {
        const leftId = clusterIds[i];
        const rightId = clusterIds[j];
        const left = centroids.get(leftId);
        const right = centroids.get(rightId);
        if (!left || !right) continue;
        let dx = left.x - right.x;
        let dy = left.y - right.y;
        let distance = Math.hypot(dx, dy);
        if (distance < 1) {
          dx = i - j || 1;
          dy = j * 3 - i || 1;
          distance = Math.hypot(dx, dy);
        }
        if (distance > reach) continue;
        if (leftId.startsWith("c:") || rightId.startsWith("c:")) continue;
        const crossCount = model.cross.get(pairKey(leftId, rightId)) ?? 0;
        const factor = 1 / (1 + crossCount * crossDamp);
        const magnitude = repel * factor * (1 - distance / reach) * alpha;
        const leftPush = push.get(leftId);
        const rightPush = push.get(rightId);
        if (!leftPush || !rightPush) continue;
        leftPush.x += (dx / distance) * magnitude;
        leftPush.y += (dy / distance) * magnitude;
        rightPush.x -= (dx / distance) * magnitude;
        rightPush.y -= (dy / distance) * magnitude;
      }
    }

    const drag = new Map(clusterIds.map((id) => [id, { x: 0, y: 0 }]));
    for (const node of nodes) {
      if (node.type === "person" || node.x == null || node.y == null) continue;
      const ties = model.ties.get(node.id) ?? [];
      if (ties.length < 2) continue;
      for (const tie of ties) {
        const centroid = centroids.get(tie.id);
        const bucket = drag.get(tie.id);
        if (!centroid || !bucket) continue;
        const share = Math.max(model.exclusive.get(tie.id)?.length ?? 1, 1);
        const strength = pullStrength(tie.dist) * alpha / share;
        bucket.x += (node.x - centroid.x) * strength;
        bucket.y += (node.y - centroid.y) * strength;
      }
    }

    for (const node of nodes) {
      if (node.type === "person") continue;
      if (node.fx != null || node.fy != null || node.x == null || node.y == null) continue;
      let vx = node.vx ?? 0;
      let vy = node.vy ?? 0;
      const ties = model.ties.get(node.id) ?? [];
      const satellite = ties.length === 1 && ties[0].id.startsWith("c:");
      for (const tie of ties) {
        const centroid = centroids.get(tie.id);
        if (!centroid) continue;
        const strength = pullStrength(tie.dist);
        vx += (centroid.x - node.x) * strength * alpha;
        vy += (centroid.y - node.y) * strength * alpha;
      }
      if (ties.length === 1) {
        const shift = push.get(ties[0].id);
        const follow = drag.get(ties[0].id);
        if (shift) {
          vx += shift.x;
          vy += shift.y;
        }
        if (follow) {
          vx += follow.x;
          vy += follow.y;
        }
      }
      if (satellite) {
        const dx = meanX - node.x;
        const dy = meanY - node.y;
        const distance = Math.hypot(dx, dy) || 1;
        const gap = distance - rim * 0.92;
        const gain = gap > 0 ? 0.35 : 0.08;
        vx += (dx / distance) * gap * gain * alpha;
        vy += (dy / distance) * gap * gain * alpha;
      }
      vx += (meanX - node.x) * constellation * alpha;
      vy += (meanY - node.y) * constellation * alpha;
      node.vx = vx;
      node.vy = vy;
    }
  }

  force.initialize = (next: ForceSimNode[]) => {
    nodes = next;
    byId.clear();
    for (const node of next) byId.set(node.id, node);
  };
  return force;
}

/** Avatar tiles are narrower than the text boxes, so they need less personal space. */
function collideRadius(node: ForceSimNode): number {
  return node.type === "organization" ? 54 : 68;
}

const MOON_GAP = 6;

type HostAnchor = { x: number; y: number; rx: number; ry: number };

function hostAnchor(
  node: ForceSimNode,
  measured: { width: number; height: number } | undefined,
): HostAnchor | null {
  if (node.x == null || node.y == null) return null;
  if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return null;
  const width = measured?.width ?? (node.type === "organization" ? 48 : 96);
  const height = measured?.height ?? (node.type === "organization" ? 56 : 36);
  return {
    x: node.x + width / 2,
    y: node.y + height / 2,
    rx: width / 2,
    ry: height / 2,
  };
}

function ringRadii(anchor: HostAnchor, count: number): { rx: number; ry: number } {
  const pad = PERSON_NODE_SIZE / 2 + MOON_GAP;
  let rx = anchor.rx + pad;
  let ry = anchor.ry + pad;
  const packed = (count * (PERSON_NODE_SIZE + 4)) / (2 * Math.PI);
  const base = Math.max(rx, ry, 1);
  if (packed > base) {
    const scale = packed / base;
    rx *= scale;
    ry *= scale;
  }
  return { rx, ry };
}

/**
 * People are left out of the simulation. One host puts them on a tight ring.
 * Two or more hosts put them on the midpoint, so they never pull those nodes
 * together. Several people on the same hosts spread sideways. Pinned people
 * stay where they were dragged.
 */
function applyPersonMoons(
  nodes: Map<string, ForceSimNode>,
  edges: { source: string; target: string }[],
  measured: Map<string, { width: number; height: number }>,
  visibleIds: Set<string>,
) {
  const hosts = new Map<string, HostAnchor>();
  const people: ForceSimNode[] = [];
  for (const node of nodes.values()) {
    if (node.type === "person") {
      people.push(node);
      continue;
    }
    if (visibleIds.size > 0 && !visibleIds.has(node.id)) continue;
    const anchor = hostAnchor(node, measured.get(node.id));
    if (anchor) hosts.set(node.id, anchor);
  }
  if (people.length === 0 || hosts.size === 0) return;

  const anchorsOf = new Map<string, string[]>();
  const addAnchor = (personId: string, hostId: string) => {
    if (!hosts.has(hostId)) return;
    const list = anchorsOf.get(personId);
    if (list) list.push(hostId);
    else anchorsOf.set(personId, [hostId]);
  };
  for (const edge of edges) {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target) continue;
    if (source.type === "person" && target.type !== "person") addAnchor(source.id, target.id);
    else if (target.type === "person" && source.type !== "person") {
      addAnchor(target.id, source.id);
    }
  }

  const orbiting = new Map<string, ForceSimNode[]>();
  const bridging = new Map<string, { hostIds: string[]; moons: ForceSimNode[] }>();
  for (const person of people) {
    if (person.fx != null || person.fy != null) {
      if (person.fx != null) person.x = person.fx;
      if (person.fy != null) person.y = person.fy;
      person.vx = 0;
      person.vy = 0;
      continue;
    }
    const anchors = [...new Set(anchorsOf.get(person.id) ?? [])].sort();
    if (anchors.length === 0) continue;
    if (anchors.length === 1) {
      const list = orbiting.get(anchors[0]) ?? [];
      list.push(person);
      orbiting.set(anchors[0], list);
      continue;
    }
    const key = anchors.join("|");
    const group = bridging.get(key);
    if (group) group.moons.push(person);
    else bridging.set(key, { hostIds: anchors, moons: [person] });
  }

  const half = PERSON_NODE_SIZE / 2;
  for (const [hostId, moons] of orbiting) {
    const host = hosts.get(hostId);
    if (!host) continue;
    moons.sort((a, b) => a.id.localeCompare(b.id));
    const { rx, ry } = ringRadii(host, moons.length);
    const step = (2 * Math.PI) / moons.length;
    moons.forEach((moon, index) => {
      const angle = -Math.PI / 2 + index * step;
      moon.x = host.x + rx * Math.cos(angle) - half;
      moon.y = host.y + ry * Math.sin(angle) - half;
      moon.vx = 0;
      moon.vy = 0;
    });
  }

  for (const group of bridging.values()) {
    const points = group.hostIds
      .map((id) => hosts.get(id))
      .filter((point): point is HostAnchor => point != null);
    if (points.length < 2) continue;
    let cx = 0;
    let cy = 0;
    for (const point of points) {
      cx += point.x;
      cy += point.y;
    }
    cx /= points.length;
    cy /= points.length;
    const dx = points[1].x - points[0].x;
    const dy = points[1].y - points[0].y;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    const moons = [...group.moons].sort((a, b) => a.id.localeCompare(b.id));
    const gap = PERSON_NODE_SIZE + MOON_GAP;
    moons.forEach((moon, index) => {
      const offset = (index - (moons.length - 1) / 2) * gap;
      moon.x = cx + px * offset - half;
      moon.y = cy + py * offset - half;
      moon.vx = 0;
      moon.vy = 0;
    });
  }
}

/** Person↔person ties are drawn dashed and do not pull nodes in the layout. */
export function isPersonPersonEdge(
  edge: { source: string; target: string },
  nodesById: Map<string, { type: string }> | Record<string, { type: string }>,
): boolean {
  const get = (id: string) =>
    nodesById instanceof Map ? nodesById.get(id) : nodesById[id];
  const source = get(edge.source);
  const target = get(edge.target);
  return source?.type === "person" && target?.type === "person";
}

/**
 * Runs a d3-force simulation and writes positions into React Flow nodes.
 * Unpinned nodes settle by links; pinned nodes stay fixed (fx/fy).
 * Each problem keeps a cluster around a moving center. Shared links let
 * related problems drift together; unrelated clusters stay apart.
 * People are moons: they are omitted from the forces and placed around the
 * nodes they touch. A person tied to two or more nodes sits between them.
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
  const edgesRef = useRef(data.edges);
  const measuredRef = useRef(new Map<string, { width: number; height: number }>());
  const topoRef = useRef<string>("");
  const draggingRef = useRef<Set<string>>(new Set());
  const pausedRef = useRef(false);
  const pausedAlphaRef = useRef(0);
  const reheatWhilePausedRef = useRef(false);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  useEffect(() => {
    edgesRef.current = data.edges;
    if (!enabled) return;

    const key = topologyKey(data);
    const existing = nodesByIdRef.current;
    const nextMap = new Map<string, ForceSimNode>();
    let reheat = false;

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
      simNode.type = node.type;
      if (node.pinned) {
        simNode.pinned = true;
        simNode.fx = node.position.x;
        simNode.fy = node.position.y;
      } else if (!draggingRef.current.has(node.id)) {
        if (simNode.pinned) reheat = true;
        simNode.pinned = false;
        simNode.fx = undefined;
        simNode.fy = undefined;
      }
      nextMap.set(node.id, simNode);
    }

    nodesByIdRef.current = nextMap;
    const simNodes = Array.from(nextMap.values());
    const layoutNodes = simNodes.filter((node) => node.type !== "person");
    const simLinks: ForceSimLink[] = data.edges
      .filter((e) => nextMap.has(e.source) && nextMap.has(e.target))
      .filter((e) => {
        const source = nextMap.get(e.source);
        const target = nextMap.get(e.target);
        return source?.type !== "person" && target?.type !== "person";
      })
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
      }));

    if (key !== topoRef.current || !simRef.current) {
      topoRef.current = key;
      simRef.current?.stop();

      const clusterModel = buildClusterModel(
        layoutNodes,
        simLinks.map((link) => ({
          source: String(link.source),
          target: String(link.target),
        })),
      );
      const simulation = forceSimulation<ForceSimNode>(layoutNodes)
        .force(
          "link",
          forceLink<ForceSimNode, ForceSimLink>(simLinks)
            .id((d) => d.id)
            .distance(120)
            .strength(0.45),
        )
        .force(
          "charge",
          forceManyBody<ForceSimNode>().strength(-60).distanceMin(48).distanceMax(220),
        )
        .force("cluster", forceClusters(clusterModel))
        .force(
          "collide",
          forceCollide<ForceSimNode>().radius(collideRadius).strength(0.9).iterations(2),
        )
        .velocityDecay(0.45)
        .alpha(1)
        .alphaDecay(0.022);

      simulation.on("tick", () => {
        if (pausedRef.current) return;
        setNodes((current) => {
          for (const flowNode of current) {
            const width = flowNode.measured?.width;
            const height = flowNode.measured?.height;
            if (width && height) {
              measuredRef.current.set(flowNode.id, { width, height });
            }
          }
          applyPersonMoons(
            nodesByIdRef.current,
            edgesRef.current,
            measuredRef.current,
            new Set(current.map((flowNode) => flowNode.id)),
          );
          return current.map((flowNode) => {
            const simNode = nodesByIdRef.current.get(flowNode.id);
            if (!simNode || simNode.x == null || simNode.y == null) return flowNode;
            if (flowNode.position.x === simNode.x && flowNode.position.y === simNode.y) {
              return flowNode;
            }
            return {
              ...flowNode,
              position: { x: simNode.x, y: simNode.y },
            };
          });
        });
      });

      simulation.on("end", () => {
        const positions: Record<string, { x: number; y: number }> = {};
        for (const n of nodesByIdRef.current.values()) {
          if (n.x == null || n.y == null) continue;
          positions[n.id] = { x: n.x, y: n.y };
        }
        onSettledRef.current?.(positions);
      });

      simRef.current = simulation;
    } else {
      const simulation = simRef.current;
      simulation.nodes(layoutNodes);
      const linkForce = simulation.force("link") as ReturnType<
        typeof forceLink<ForceSimNode, ForceSimLink>
      > | null;
      linkForce?.links(simLinks);
      if (reheat) {
        if (pausedRef.current) reheatWhilePausedRef.current = true;
        else simulation.alphaTarget(0).alpha(0.4).restart();
      }
    }
    if (pausedRef.current) simRef.current?.stop();
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
        if (!pausedRef.current) simRef.current?.alphaTarget(0.25).restart();
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
          if (!pausedRef.current) {
            simRef.current?.alphaTarget(0).alpha(0.35).restart();
          }
        }
      },
      pause() {
        const sim = simRef.current;
        pausedRef.current = true;
        if (!sim) return;
        pausedAlphaRef.current = sim.alpha();
        sim.stop();
      },
      resume() {
        pausedRef.current = false;
        const sim = simRef.current;
        const alpha = Math.max(
          pausedAlphaRef.current,
          reheatWhilePausedRef.current ? 0.4 : 0,
        );
        pausedAlphaRef.current = 0;
        reheatWhilePausedRef.current = false;
        if (!sim || alpha <= 0.05) return;
        sim.alphaTarget(0).alpha(alpha).restart();
      },
      positions() {
        const positions = new Map<string, { x: number; y: number }>();
        for (const [id, node] of nodesByIdRef.current) {
          if (node.x == null || node.y == null) continue;
          positions.set(id, { x: node.x, y: node.y });
        }
        return positions;
      },
    }),
    [],
  );
}
