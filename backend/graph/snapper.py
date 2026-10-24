from typing import Any, Callable, Dict, Optional
import networkx as nx
from backend.graph.geometry_utils import haversine_distance_m


def snap_coordinate_to_accessible_node(
    G: nx.MultiDiGraph,
    lon: float,
    lat: float,
    max_snap_distance_m: float = 1500.0,
    is_node_unavailable_fn: Optional[Callable[[int], bool]] = None,
    is_edge_blocked_fn: Optional[Callable[[int, int, int], bool]] = None,
) -> Dict[str, Any]:
    """
    Snap a coordinate to the nearest accessible road node in the graph within max_snap_distance_m.
    Evaluates node availability and edge closures.
    Uses pure geodesic calculations, independent of CRS metadata.
    """
    if is_node_unavailable_fn is None:
        is_node_unavailable_fn = lambda n: False
    if is_edge_blocked_fn is None:
        is_edge_blocked_fn = lambda u, v, k: False

    if G.number_of_nodes() == 0:
        return {
            "original_coords": [lon, lat],
            "snapped_coords": [lon, lat],
            "node_id": -1,
            "distance_m": float("inf"),
            "accessible": False,
        }

    def is_accessible(n: int) -> bool:
        if is_node_unavailable_fn(n):
            return False
        # Must have at least one unblocked outgoing or incoming edge
        for v in G.neighbors(n):
            for k in G[n][v]:
                if not is_edge_blocked_fn(n, v, k):
                    return True
        for pred in G.predecessors(n):
            for k in G[pred][n]:
                if not is_edge_blocked_fn(pred, n, k):
                    return True
        return False

    closest_any_node: Optional[int] = None
    min_any_dist = float("inf")

    best_accessible_node: Optional[int] = None
    min_accessible_dist = float("inf")

    # Efficient distance scan across nodes
    for n, data in G.nodes(data=True):
        if "x" not in data or "y" not in data:
            continue
        n_lon = float(data["x"])
        n_lat = float(data["y"])
        dist = haversine_distance_m(lat, lon, n_lat, n_lon)

        if dist < min_any_dist:
            min_any_dist = dist
            closest_any_node = n

        if dist <= max_snap_distance_m and dist < min_accessible_dist:
            if is_accessible(n):
                min_accessible_dist = dist
                best_accessible_node = n

    if best_accessible_node is not None:
        best_data = G.nodes[best_accessible_node]
        return {
            "original_coords": [lon, lat],
            "snapped_coords": [float(best_data["x"]), float(best_data["y"])],
            "node_id": best_accessible_node,
            "distance_m": round(min_accessible_dist, 2),
            "accessible": True,
        }

    # If within reasonable distance of coverage network (up to 5000m), snap to closest available road
    # so search destinations inside large campuses, parks, or facilities always successfully route!
    if closest_any_node is not None and min_any_dist <= 5000.0:
        best_data = G.nodes[closest_any_node]
        return {
            "original_coords": [lon, lat],
            "snapped_coords": [float(best_data["x"]), float(best_data["y"])],
            "node_id": closest_any_node,
            "distance_m": round(min_any_dist, 2),
            "accessible": True,
        }

    # Closest node exceeded max distance or graph was completely inaccessible
    fallback_node = closest_any_node if closest_any_node is not None else -1
    fallback_coords = (
        [float(G.nodes[fallback_node]["x"]), float(G.nodes[fallback_node]["y"])]
        if fallback_node != -1
        else [lon, lat]
    )
    return {
        "original_coords": [lon, lat],
        "snapped_coords": fallback_coords,
        "node_id": fallback_node,
        "distance_m": round(min_any_dist, 2),
        "accessible": False,
    }

