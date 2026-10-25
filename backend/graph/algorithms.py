import heapq
import time
from collections import deque
from typing import Any, Callable, Dict, List, Optional, Set, Tuple
import networkx as nx
from shapely.geometry import LineString
from backend.graph.geometry_utils import edge_geometry_to_coords, haversine_distance_m
from backend.graph.navigation_engine import generate_maneuver_instructions


class RoutingResult:
    def __init__(
        self,
        status: str,
        message: str,
        algorithm: str,
        optimization: str,
        total_distance_m: float = 0.0,
        total_travel_time_s: Optional[float] = None,
        visited_nodes_count: int = 0,
        execution_time_ms: float = 0.0,
        path_nodes: Optional[List[int]] = None,
        path_edges: Optional[List[Dict[str, Any]]] = None,
        geometry: Optional[Dict[str, Any]] = None,
        instructions: Optional[List[Dict[str, Any]]] = None,
    ):
        self.status = status
        self.message = message
        self.algorithm = algorithm
        self.optimization = optimization
        self.total_distance_m = round(total_distance_m, 2)
        self.total_travel_time_s = round(total_travel_time_s, 2) if total_travel_time_s is not None else None
        self.visited_nodes_count = visited_nodes_count
        self.execution_time_ms = round(execution_time_ms, 2)
        self.path_nodes = path_nodes or []
        self.path_edges = path_edges or []
        self.geometry = geometry
        if instructions is not None:
            self.instructions = instructions
        elif self.status == "success" and self.path_edges:
            self.instructions = generate_maneuver_instructions(self.path_edges)
        else:
            self.instructions = []

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status,
            "message": self.message,
            "algorithm": self.algorithm,
            "optimization": self.optimization,
            "total_distance_m": self.total_distance_m,
            "total_travel_time_s": self.total_travel_time_s,
            "visited_nodes_count": self.visited_nodes_count,
            "execution_time_ms": self.execution_time_ms,
            "path_nodes": self.path_nodes,
            "path_edges": self.path_edges,
            "geometry": self.geometry,
            "instructions": self.instructions,
        }


PUNE_URBAN_SPEEDS_KPH: Dict[str, float] = {
    "motorway": 65.0,
    "motorway_link": 40.0,
    "trunk": 45.0,
    "trunk_link": 35.0,
    "primary": 32.0,
    "primary_link": 25.0,
    "secondary": 26.0,
    "secondary_link": 20.0,
    "tertiary": 22.0,
    "tertiary_link": 18.0,
    "residential": 18.0,
    "living_street": 14.0,
    "service": 12.0,
    "unclassified": 20.0,
}


def compute_realistic_travel_time(edge_data: Dict[str, Any]) -> float:
    """
    Compute Google Maps-calibrated realistic travel duration in seconds
    for Pune & PCMC urban traffic, factoring road hierarchy and intersection density.
    """
    length_m = float(edge_data.get("length", 1.0))

    # 1. If explicit custom speed override is set (e.g. from scenario / user simulation)
    if "override_speed" in edge_data and float(edge_data["override_speed"]) > 0:
        speed_mps = float(edge_data["override_speed"]) * (1000.0 / 3600.0)
        return length_m / max(1.5, speed_mps)

    # 2. If highway tag is present (Real OSM road network in Pune / PCMC)
    # Calibrate with Google Maps realistic urban driving speeds
    hw = edge_data.get("highway")
    if hw:
        if isinstance(hw, list):
            hw = hw[0]
        hw_str = str(hw).lower()
        speed_kph = PUNE_URBAN_SPEEDS_KPH.get(hw_str, 20.0)
        speed_mps = max(1.5, speed_kph * (1000.0 / 3600.0))
        return length_m / speed_mps

    # 3. Fallback for synthetic / custom graphs without highway tags
    travel_time = edge_data.get("travel_time")
    if travel_time is not None and float(travel_time) > 0:
        return float(travel_time)

    speed_kph = edge_data.get("speed_kph")
    if speed_kph is not None and float(speed_kph) > 0:
        speed_mps = float(speed_kph) * (1000.0 / 3600.0)
        return length_m / max(1.5, speed_mps)

    return length_m / (20.0 * 1000.0 / 3600.0)


def get_edge_weight(
    edge_data: Dict[str, Any],
    optimization: str = "distance",
    is_blocked: bool = False,
    risk_penalty: float = 1.0,
    is_restricted: bool = False,
) -> Optional[float]:
    """
    Returns edge traversal cost, or None if blocked/inaccessible.
    """
    if is_blocked:
        return None

    length = float(edge_data.get("length", 1.0))
    if optimization == "time":
        base_cost = compute_realistic_travel_time(edge_data)
    else:
        base_cost = length

    # High-risk penalty multiplier
    cost = base_cost * max(1.0, risk_penalty)

    # Restricted access penalty / guard
    if is_restricted:
        cost *= 3.0

    return cost


def reconstruct_path(
    G: nx.MultiDiGraph,
    parent_map: Dict[int, Tuple[int, int, Dict[str, Any]]],
    start_node: int,
    target_node: int,
) -> Tuple[List[int], List[Dict[str, Any]], Dict[str, Any], float, float]:
    """
    Reconstruct ordered nodes, edge details, exact LineString geometry,
    and cumulative distance and travel time from parent map.
    """
    path_nodes = [target_node]
    edges_info: List[Dict[str, Any]] = []
    all_coords: List[List[float]] = []

    curr = target_node
    while curr != start_node:
        if curr not in parent_map:
            break
        u, k, data = parent_map[curr]
        path_nodes.append(u)
        edges_info.append({
            "u": u,
            "v": curr,
            "key": k,
            "way_id": data.get("osmid") if isinstance(data.get("osmid"), int) else (data.get("osmid")[0] if isinstance(data.get("osmid"), list) else None),
            "name": str(data.get("name")) if data.get("name") else None,
            "highway": str(data.get("highway")) if data.get("highway") else None,
            "length_m": round(float(data.get("length", 0.0)), 2),
            "travel_time_s": round(compute_realistic_travel_time(data), 1),
            "oneway": bool(data.get("oneway", False)),
            "state": data.get("state", "OPEN"),
            "closure_reason": data.get("closure_reason"),
        })
        curr = u

    path_nodes.reverse()
    edges_info.reverse()

    # Reconstruct continuous road curvature geometry
    total_dist = 0.0
    total_time = 0.0
    for edge in edges_info:
        u, v, k = edge["u"], edge["v"], edge["key"]
        data = G[u][v][k]
        u_node = G.nodes[u]
        v_node = G.nodes[v]
        coords = edge_geometry_to_coords(
            data,
            (float(u_node["x"]), float(u_node["y"])),
            (float(v_node["x"]), float(v_node["y"]))
        )
        edge["geometry"] = coords
        if not all_coords:
            all_coords.extend(coords)
        else:
            # Avoid duplicate vertex at junction
            if all_coords[-1] == coords[0]:
                all_coords.extend(coords[1:])
            else:
                all_coords.extend(coords)

        total_dist += float(data.get("length", 0.0))
        total_time += compute_realistic_travel_time(data)

    geometry = {
        "type": "LineString",
        "coordinates": all_coords if all_coords else [
            [float(G.nodes[start_node]["x"]), float(G.nodes[start_node]["y"])],
            [float(G.nodes[target_node]["x"]), float(G.nodes[target_node]["y"])],
        ],
    }

    return path_nodes, edges_info, geometry, total_dist, total_time


def route_bfs(
    G: nx.MultiDiGraph,
    start_node: int,
    target_node: int,
    is_edge_blocked_fn: Callable[[int, int, int], bool],
    is_node_unavailable_fn: Callable[[int], bool],
) -> RoutingResult:
    """
    Breadth-First Search (BFS): unweighted shortest path by edge count.
    Respects one-way directionality, blocked edges, and unavailable nodes.
    """
    t0 = time.perf_counter()
    if is_node_unavailable_fn(start_node):
        return RoutingResult("inaccessible_start", "Start node is unavailable or blocked.", "bfs", "unweighted", execution_time_ms=(time.perf_counter() - t0) * 1000)
    if is_node_unavailable_fn(target_node):
        return RoutingResult("inaccessible_target", "Target node is unavailable or blocked.", "bfs", "unweighted", execution_time_ms=(time.perf_counter() - t0) * 1000)

    queue = deque([start_node])
    visited: Set[int] = {start_node}
    parent_map: Dict[int, Tuple[int, int, Dict[str, Any]]] = {}
    visited_count = 0

    while queue:
        u = queue.popleft()
        visited_count += 1

        if u == target_node:
            nodes, edges, geom, dist, t_time = reconstruct_path(G, parent_map, start_node, target_node)
            return RoutingResult(
                "success", "Route found successfully via BFS.", "bfs", "unweighted",
                dist, t_time, visited_count, (time.perf_counter() - t0) * 1000,
                nodes, edges, geom
            )

        if not G.has_node(u):
            continue

        for v in G.neighbors(u):
            if is_node_unavailable_fn(v):
                continue
            for k, data in G[u][v].items():
                if is_edge_blocked_fn(u, v, k):
                    continue
                if v not in visited:
                    visited.add(v)
                    parent_map[v] = (u, k, data)
                    queue.append(v)
                    break  # Take first available multigraph edge to v

    return RoutingResult(
        "no_path_found", "No path found connecting start and destination.", "bfs", "unweighted",
        visited_nodes_count=visited_count, execution_time_ms=(time.perf_counter() - t0) * 1000
    )


def route_dijkstra(
    G: nx.MultiDiGraph,
    start_node: int,
    target_node: int,
    optimization: str,
    is_edge_blocked_fn: Callable[[int, int, int], bool],
    is_node_unavailable_fn: Callable[[int], bool],
    get_edge_penalty_fn: Callable[[int, int, int], Tuple[float, bool]],
) -> RoutingResult:
    """
    Dijkstra's Algorithm: minimum non-negative weighted cost.
    Optimizes for either distance (meters) or travel time (seconds).
    Applies high-risk penalties and access restriction rules.
    """
    t0 = time.perf_counter()
    if is_node_unavailable_fn(start_node):
        return RoutingResult("inaccessible_start", "Start node is unavailable or blocked.", "dijkstra", optimization, execution_time_ms=(time.perf_counter() - t0) * 1000)
    if is_node_unavailable_fn(target_node):
        return RoutingResult("inaccessible_target", "Target node is unavailable or blocked.", "dijkstra", optimization, execution_time_ms=(time.perf_counter() - t0) * 1000)

    # Priority queue: (cost, node)
    pq: List[Tuple[float, int]] = [(0.0, start_node)]
    dist_map: Dict[int, float] = {start_node: 0.0}
    parent_map: Dict[int, Tuple[int, int, Dict[str, Any]]] = {}
    visited_count = 0

    while pq:
        curr_dist, u = heapq.heappop(pq)
        if curr_dist > dist_map.get(u, float("inf")):
            continue

        visited_count += 1
        if u == target_node:
            nodes, edges, geom, dist, t_time = reconstruct_path(G, parent_map, start_node, target_node)
            return RoutingResult(
                "success", f"Optimal route found via Dijkstra ({optimization}).", "dijkstra", optimization,
                dist, t_time, visited_count, (time.perf_counter() - t0) * 1000,
                nodes, edges, geom
            )

        if not G.has_node(u):
            continue

        for v in G.neighbors(u):
            if is_node_unavailable_fn(v):
                continue

            for k, data in G[u][v].items():
                if is_edge_blocked_fn(u, v, k):
                    continue

                risk_penalty, is_restricted = get_edge_penalty_fn(u, v, k)
                w = get_edge_weight(data, optimization, False, risk_penalty, is_restricted)
                if w is None:
                    continue

                new_cost = curr_dist + w
                if new_cost < dist_map.get(v, float("inf")):
                    dist_map[v] = new_cost
                    parent_map[v] = (u, k, data)
                    heapq.heappush(pq, (new_cost, v))

    return RoutingResult(
        "no_path_found", "No path found connecting start and destination.", "dijkstra", optimization,
        visited_nodes_count=visited_count, execution_time_ms=(time.perf_counter() - t0) * 1000
    )


def route_astar(
    G: nx.MultiDiGraph,
    start_node: int,
    target_node: int,
    optimization: str,
    is_edge_blocked_fn: Callable[[int, int, int], bool],
    is_node_unavailable_fn: Callable[[int], bool],
    get_edge_penalty_fn: Callable[[int, int, int], Tuple[float, bool]],
) -> RoutingResult:
    """
    A* Algorithm: optimal point-to-point routing with an admissible heuristic.
    Heuristic:
    - Distance: Geodesic Haversine distance from node to target.
    - Time: Geodesic distance / max speed (35 m/s = 126 km/h), strictly admissible.
    """
    t0 = time.perf_counter()
    if is_node_unavailable_fn(start_node):
        return RoutingResult("inaccessible_start", "Start node is unavailable or blocked.", "astar", optimization, execution_time_ms=(time.perf_counter() - t0) * 1000)
    if is_node_unavailable_fn(target_node):
        return RoutingResult("inaccessible_target", "Target node is unavailable or blocked.", "astar", optimization, execution_time_ms=(time.perf_counter() - t0) * 1000)

    target_data = G.nodes[target_node]
    t_lat, t_lon = float(target_data["y"]), float(target_data["x"])

    # Max speed in m/s for travel-time heuristic admissibility (e.g. 126 km/h)
    MAX_SPEED_MPS = 35.0

    def heuristic(node: int) -> float:
        n_data = G.nodes[node]
        h_dist = haversine_distance_m(float(n_data["y"]), float(n_data["x"]), t_lat, t_lon)
        if optimization == "time":
            return h_dist / MAX_SPEED_MPS
        return h_dist

    # Priority queue: (f_score, g_score, node)
    initial_h = heuristic(start_node)
    pq: List[Tuple[float, float, int]] = [(initial_h, 0.0, start_node)]
    g_score: Dict[int, float] = {start_node: 0.0}
    parent_map: Dict[int, Tuple[int, int, Dict[str, Any]]] = {}
    visited_count = 0

    while pq:
        _, curr_g, u = heapq.heappop(pq)
        if curr_g > g_score.get(u, float("inf")):
            continue

        visited_count += 1
        if u == target_node:
            nodes, edges, geom, dist, t_time = reconstruct_path(G, parent_map, start_node, target_node)
            return RoutingResult(
                "success", f"Optimal route found via A* ({optimization}).", "astar", optimization,
                dist, t_time, visited_count, (time.perf_counter() - t0) * 1000,
                nodes, edges, geom
            )

        if not G.has_node(u):
            continue

        for v in G.neighbors(u):
            if is_node_unavailable_fn(v):
                continue

            for k, data in G[u][v].items():
                if is_edge_blocked_fn(u, v, k):
                    continue

                risk_penalty, is_restricted = get_edge_penalty_fn(u, v, k)
                w = get_edge_weight(data, optimization, False, risk_penalty, is_restricted)
                if w is None:
                    continue

                tentative_g = curr_g + w
                if tentative_g < g_score.get(v, float("inf")):
                    g_score[v] = tentative_g
                    parent_map[v] = (u, k, data)
                    f_score = tentative_g + heuristic(v)
                    heapq.heappush(pq, (f_score, tentative_g, v))

    return RoutingResult(
        "no_path_found", "No path found connecting start and destination.", "astar", optimization,
        visited_nodes_count=visited_count, execution_time_ms=(time.perf_counter() - t0) * 1000
    )


def execute_routing(
    G: nx.MultiDiGraph,
    start_node: int,
    target_node: int,
    algorithm: str = "dijkstra",
    optimization: str = "distance",
    is_edge_blocked_fn: Optional[Callable[[int, int, int], bool]] = None,
    is_node_unavailable_fn: Optional[Callable[[int], bool]] = None,
    get_edge_penalty_fn: Optional[Callable[[int, int, int], Tuple[float, bool]]] = None,
) -> RoutingResult:
    """
    Shared entrypoint for routing algorithms with uniform interface.
    """
    if is_edge_blocked_fn is None:
        is_edge_blocked_fn = lambda u, v, k: False
    if is_node_unavailable_fn is None:
        is_node_unavailable_fn = lambda n: False
    if get_edge_penalty_fn is None:
        get_edge_penalty_fn = lambda u, v, k: (1.0, False)

    algo = algorithm.lower().strip()
    opt = optimization.lower().strip()
    if opt not in ("distance", "time"):
        opt = "distance"

    if algo == "dfs":
        raise ValueError("Algorithm 'dfs' has been removed from ResQ. Supported algorithms: dijkstra, astar, bfs")
    elif algo == "bfs":
        return route_bfs(G, start_node, target_node, is_edge_blocked_fn, is_node_unavailable_fn)
    elif algo == "astar":
        return route_astar(G, start_node, target_node, opt, is_edge_blocked_fn, is_node_unavailable_fn, get_edge_penalty_fn)
    elif algo == "dijkstra":
        return route_dijkstra(G, start_node, target_node, opt, is_edge_blocked_fn, is_node_unavailable_fn, get_edge_penalty_fn)
    else:
        raise ValueError(f"Unknown routing algorithm '{algorithm}'. Supported algorithms: dijkstra, astar, bfs")

