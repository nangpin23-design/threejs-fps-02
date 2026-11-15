// Navigation: A* over the map's waypoint graph. Paths are short (the graph
// has 32 nodes), so the search runs in place with plain arrays and no
// allocations beyond the returned node list.
export function createNav(waypoints, edges) {
  const adjacency = waypoints.map(() => []);
  for (const [a, b] of edges) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  const dist = (a, b) => {
    const dx = waypoints[a].x - waypoints[b].x;
    const dz = waypoints[a].z - waypoints[b].z;
    return Math.hypot(dx, dz);
  };
  function nearestNode(x, z) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < waypoints.length; i += 1) {
      const dx = waypoints[i].x - x;
      const dz = waypoints[i].z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
  function findPath(start, goal) {
    if (start === goal) return [start];
    const open = [start];
    const came = new Map([[start, -1]]);
    const g = new Map([[start, 0]]);
    const f = new Map([[start, dist(start, goal)]]);
    const closed = new Set();
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i += 1) {
        if ((f.get(open[i]) ?? Infinity) < (f.get(open[bi]) ?? Infinity)) bi = i;
      }
      const current = open.splice(bi, 1)[0];
      if (current === goal) {
        const path = [current];
        let node = current;
        while (came.get(node) !== -1) { node = came.get(node); path.unshift(node); }
        return path;
      }
      closed.add(current);
      for (const next of adjacency[current]) {
        if (closed.has(next)) continue;
        const ng = (g.get(current) ?? 0) + dist(current, next);
        if (ng < (g.get(next) ?? Infinity)) {
          came.set(next, current);
          g.set(next, ng);
          f.set(next, ng + dist(next, goal));
          if (!open.includes(next)) open.push(next);
        }
      }
    }
    return [start, goal];
  }
  return { nearestNode, findPath, adjacency };
}
