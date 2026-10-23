import math
from typing import Any, Dict, List, Tuple
from shapely.geometry import LineString, Point, Polygon, mapping, shape


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great-circle distance between two points in meters."""
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


def edge_geometry_to_coords(edge_data: Dict[str, Any], u_coords: Tuple[float, float], v_coords: Tuple[float, float]) -> List[List[float]]:
    """
    Extract coordinate list [[lon, lat], ...] from an edge.
    If 'geometry' is present (Shapely LineString), coordinates are extracted.
    Otherwise, straight line between u_coords [lon, lat] and v_coords [lon, lat] is used.
    """
    geom = edge_data.get("geometry")
    if geom is not None:
        if isinstance(geom, LineString):
            return [[float(x), float(y)] for x, y in geom.coords]
        elif isinstance(geom, dict) and "coordinates" in geom:
            return geom["coordinates"]
        elif hasattr(geom, "coords"):
            return [[float(x), float(y)] for x, y in geom.coords]
    return [[u_coords[0], u_coords[1]], [v_coords[0], v_coords[1]]]


def create_circle_polygon(center_lon: float, center_lat: float, radius_m: float, points: int = 36) -> Polygon:
    """
    Create a geodesic approximation of a circle polygon on WGS84 coordinates.
    """
    coords = []
    lat_r = math.radians(center_lat)
    m_per_deg_lat = 111132.954 - 559.822 * math.cos(2 * lat_r) + 1.175 * math.cos(4 * lat_r)
    m_per_deg_lon = 111412.84 * math.cos(lat_r) - 93.5 * math.cos(3 * lat_r)

    for i in range(points):
        theta = 2.0 * math.pi * i / points
        dx = radius_m * math.cos(theta)
        dy = radius_m * math.sin(theta)
        p_lon = center_lon + (dx / m_per_deg_lon)
        p_lat = center_lat + (dy / m_per_deg_lat)
        coords.append((p_lon, p_lat))
    coords.append(coords[0])  # Close ring
    return Polygon(coords)


def parse_hazard_polygon(geom_dict: Dict[str, Any]) -> Polygon:
    """
    Parse a GeoJSON Polygon or custom Circle dict into a Shapely Polygon.
    """
    g_type = geom_dict.get("type")
    if g_type == "Circle":
        center = geom_dict.get("center", [0, 0])
        radius = float(geom_dict.get("radius_m", 100))
        return create_circle_polygon(center[0], center[1], radius)
    elif g_type in ("Polygon", "MultiPolygon"):
        s = shape(geom_dict)
        if isinstance(s, Polygon):
            return s
        elif hasattr(s, "geoms"):  # MultiPolygon -> convex hull or exterior
            return s.convex_hull
    raise ValueError(f"Unsupported hazard geometry type: {g_type}")

