export type OrbitPoint = { x: number; y: number };

export type OrbitNodeBox = {
  id: string;
  /** Visual center before arranging. */
  x: number;
  y: number;
  width: number;
  height: number;
};

/** The node and every node one edge away. Anything further is left out. */
export function orbitMemberIds(
  nodes: { id: string }[],
  edges: { source: string; target: string }[],
  centerId: string,
): Set<string> {
  const known = new Set(nodes.map((node) => node.id));
  const ids = new Set<string>();
  if (!known.has(centerId)) return ids;
  ids.add(centerId);
  for (const edge of edges) {
    if (edge.source === centerId && known.has(edge.target)) ids.add(edge.target);
    else if (edge.target === centerId && known.has(edge.source)) {
      ids.add(edge.source);
    }
  }
  return ids;
}

/**
 * Top-left positions that put `center` on `origin` and direct neighbors
 * on a ring. Angular order is kept so nodes slide into place.
 */
export function orbitPositions(
  origin: OrbitPoint,
  center: OrbitNodeBox,
  neighbors: OrbitNodeBox[],
): Map<string, OrbitPoint> {
  const positions = new Map<string, OrbitPoint>();
  positions.set(center.id, {
    x: origin.x - center.width / 2,
    y: origin.y - center.height / 2,
  });
  if (neighbors.length === 0) return positions;

  const widest = neighbors.reduce(
    (max, node) => Math.max(max, node.width),
    96,
  );
  const minChord = widest + 48;
  const hubReach = Math.max(center.width, center.height) / 2;
  const radius = Math.max(
    240,
    hubReach + widest / 2 + 72,
    (neighbors.length * minChord) / (2 * Math.PI),
  );

  const ordered = [...neighbors].sort((a, b) => {
    const angleA = Math.atan2(a.y - origin.y, a.x - origin.x);
    const angleB = Math.atan2(b.y - origin.y, b.x - origin.x);
    return angleA - angleB || a.id.localeCompare(b.id);
  });
  const start = Math.atan2(ordered[0].y - origin.y, ordered[0].x - origin.x);
  const step = (2 * Math.PI) / ordered.length;

  ordered.forEach((node, index) => {
    const angle = start + index * step;
    positions.set(node.id, {
      x: origin.x + radius * Math.cos(angle) - node.width / 2,
      y: origin.y + radius * Math.sin(angle) - node.height / 2,
    });
  });
  return positions;
}
