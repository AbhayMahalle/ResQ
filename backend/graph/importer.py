import os
import json
import uuid
from typing import Any, Dict, List, Optional, Tuple
import networkx as nx
import osmnx as ox
from shapely.geometry import LineString
from backend.db.database import get_db_connection

GRAPHS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "graphs")

# Configure resilient Overpass settings and meaningful User-Agent
ox.settings.overpass_url = "https://overpass-api.de/api"
ox.settings.http_user_agent = "ResQ-Disaster-Routing-Simulation/1.0 (contact: support@resq.local)"
ox.settings.requests_timeout = 30

OVERPASS_MIRRORS = [
    "https://overpass.osm.ch/api",
    "https://overpass-api.de/api",
    "https://overpass.kumi.systems/api",
    "https://overpass.openstreetmap.ru/cgi/api",
]


def get_graphs_dir() -> str:
    os.makedirs(GRAPHS_DIR, exist_ok=True)
    return GRAPHS_DIR


def validate_graph_integrity(G: nx.MultiDiGraph) -> Tuple[bool, str]:
    """
    Validate graph integrity:
    - Must be a MultiDiGraph
    - Must contain nodes and edges
    - Nodes must have valid float coordinates x (lon) and y (lat)
    - Edges must have positive length
    """
    if not isinstance(G, (nx.MultiDiGraph, nx.DiGraph)):
        return False, "Graph is not a directed graph"

    if G.number_of_nodes() == 0:
        return False, "Graph contains zero nodes"

    if G.number_of_edges() == 0:
        return False, "Graph contains zero edges"

    # Validate node coordinates
    sample_nodes = list(G.nodes(data=True))[:50]
    for n, data in sample_nodes:
        if "x" not in data or "y" not in data:
            return False, f"Node {n} is missing coordinate attributes (x, y)"
        try:
            x, y = float(data["x"]), float(data["y"])
            if not (-180.0 <= x <= 180.0 and -90.0 <= y <= 90.0):
                return False, f"Node {n} coordinates out of WGS84 bounds: ({x}, {y})"
        except (ValueError, TypeError):
            return False, f"Node {n} has non-numeric coordinates: {data}"

    # Validate edges
    sample_edges = list(G.edges(data=True, keys=True))[:50]
    for u, v, k, data in sample_edges:
        length = data.get("length")
        if length is None or float(length) < 0:
            return False, f"Edge ({u}, {v}, {k}) has invalid length: {length}"

    return True, "Valid"


def compute_graph_bbox(G: nx.MultiDiGraph) -> List[float]:
    """Compute [min_lon, min_lat, max_lon, max_lat] for graph nodes."""
    lons = [float(data["x"]) for _, data in G.nodes(data=True) if "x" in data]
    lats = [float(data["y"]) for _, data in G.nodes(data=True) if "y" in data]
    if not lons or not lats:
        return [-180.0, -90.0, 180.0, 90.0]
    return [min(lons), min(lats), max(lons), max(lats)]


def enrich_graph_attributes(G: nx.MultiDiGraph) -> nx.MultiDiGraph:
    """
    Ensure all edges have:
    - length (float meters)
    - speed_kph and travel_time (when reliable speed data is available)
    - geometry (Shapely LineString if curved, or constructed straight line)
    - normalized road name and highway type
    """
    try:
        G = ox.routing.add_edge_speeds(G)
        G = ox.routing.add_edge_travel_times(G)
    except Exception as e:
        # Fallback heuristic calculation if OSMnx speed calculation fails
        for u, v, k, data in G.edges(data=True, keys=True):
            length = float(data.get("length", 10.0))
            highway = data.get("highway", "residential")
            if isinstance(highway, list):
                highway = highway[0]

            # Standard urban speed estimates (km/h)
            speed_map = {
                "motorway": 100.0,
                "trunk": 80.0,
                "primary": 60.0,
                "secondary": 50.0,
                "tertiary": 40.0,
                "residential": 30.0,
                "living_street": 20.0,
                "service": 20.0,
            }
            speed = speed_map.get(str(highway), 35.0)
            data["speed_kph"] = speed
            # travel_time in seconds = length / (speed_kph * 1000 / 3600)
            data["travel_time"] = length / (speed * 1000.0 / 3600.0)

    # Ensure geometry on every edge for exact curvature rendering
    for u, v, k, data in G.edges(data=True, keys=True):
        if "geometry" not in data or data["geometry"] is None:
            u_node = G.nodes[u]
            v_node = G.nodes[v]
            data["geometry"] = LineString([
                (float(u_node["x"]), float(u_node["y"])),
                (float(v_node["x"]), float(v_node["y"]))
            ])

    return G


def import_osm_road_network(
    name: str,
    place_query: Optional[str] = None,
    bbox: Optional[List[float]] = None,
    point: Optional[List[float]] = None,
    distance_m: float = 1500.0,
    network_type: str = "drive",
) -> Dict[str, Any]:
    """
    Download and import genuine OpenStreetMap road data using OSMnx.
    Saves graph to disk cache and registers in SQLite.
    Never uses mock data.
    """
    network_id = f"net_{uuid.uuid4().hex[:12]}"
    G: Optional[nx.MultiDiGraph] = None
    query_description = ""

    last_err = None
    for mirror in OVERPASS_MIRRORS:
        try:
            ox.settings.overpass_url = mirror
            if place_query:
                query_description = f"Place: {place_query}"
                G = ox.graph_from_place(place_query, network_type=network_type, simplify=True)
            elif bbox and len(bbox) == 4:
                min_lon, min_lat, max_lon, max_lat = bbox
                query_description = f"BBox: [{min_lon:.4f}, {min_lat:.4f}, {max_lon:.4f}, {max_lat:.4f}]"
                G = ox.graph_from_bbox(
                    bbox=(min_lon, min_lat, max_lon, max_lat),
                    network_type=network_type,
                    simplify=True
                )
            elif point and len(point) == 2:
                lat, lon = point[0], point[1]
                query_description = f"Point: ({lat:.5f}, {lon:.5f}) r={distance_m}m"
                G = ox.graph_from_point(
                    center_point=(lat, lon),
                    dist=distance_m,
                    network_type=network_type,
                    simplify=True
                )
            else:
                raise ValueError("Must provide either place_query, bbox [min_lon, min_lat, max_lon, max_lat], or point [lat, lon]")

            if G is not None and G.number_of_nodes() > 0:
                break
        except Exception as e:
            last_err = e
            continue

    if G is None or G.number_of_nodes() == 0:
        raise RuntimeError(f"Failed to download road network from Overpass: {last_err}")

    # Validate graph integrity
    is_valid, validation_msg = validate_graph_integrity(G)
    if not is_valid:
        raise RuntimeError(f"Downloaded graph failed integrity check: {validation_msg}")

    # Enrich with speeds, travel times, and exact geometries
    G = enrich_graph_attributes(G)

    # Save to disk cache
    file_path = os.path.join(get_graphs_dir(), f"{network_id}.graphml")
    ox.save_graphml(G, file_path)

    calc_bbox = compute_graph_bbox(G)

    # Register in SQLite
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO networks (id, name, place_or_query, bbox_json, node_count, edge_count, file_path)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                network_id,
                name,
                query_description,
                json.dumps(calc_bbox),
                G.number_of_nodes(),
                G.number_of_edges(),
                file_path,
            )
        )

        # Create default Baseline scenario
        baseline_id = f"scen_base_{uuid.uuid4().hex[:8]}"
        conn.execute(
            """
            INSERT INTO scenarios (id, network_id, name, description, version, is_active)
            VALUES (?, ?, 'Baseline', 'Default open road network with no closures', 1, 1)
            """,
            (baseline_id, network_id)
        )

    return {
        "id": network_id,
        "name": name,
        "place_or_query": query_description,
        "bbox": calc_bbox,
        "node_count": G.number_of_nodes(),
        "edge_count": G.number_of_edges(),
        "baseline_scenario_id": baseline_id,
        "created_at": "now",
    }

