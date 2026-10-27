import json
import math
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from backend.db.database import get_db_connection
from backend.graph.facilities_importer import import_emergency_facilities_for_network

router = APIRouter(prefix="/api/facilities", tags=["Emergency Facilities"])


def calculate_haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0
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


@router.get("")
def list_facilities(
    network_id: Optional[str] = Query(None, description="Filter by network ID"),
    category: Optional[str] = Query(None, description="Comma-separated category filter (hospital,fire_station,police,shelter,warehouse)"),
    user_lat: Optional[float] = Query(None, description="User current latitude for proximity ranking"),
    user_lon: Optional[float] = Query(None, description="User current longitude for proximity ranking"),
) -> Dict[str, Any]:
    """
    List emergency facilities with optional category filtering and proximity sorting.
    Returns both list of items and GeoJSON for MapLibre map rendering.
    """
    categories = [c.strip().lower() for c in category.split(",") if c.strip()] if category else []

    with get_db_connection() as conn:
        # Check if we have facilities for network_id; if none exist, attempt auto-import
        if network_id:
            count = conn.execute(
                "SELECT COUNT(*) FROM emergency_facilities WHERE network_id = ?",
                (network_id,),
            ).fetchone()[0]

            if count == 0:
                # Attempt auto-import using network bbox
                net_row = conn.execute(
                    "SELECT bbox_json FROM networks WHERE id = ?",
                    (network_id,),
                ).fetchone()
                if net_row and net_row["bbox_json"]:
                    bbox = json.loads(net_row["bbox_json"])
                    if len(bbox) == 4:
                        import_emergency_facilities_for_network(network_id, tuple(bbox))

        query = "SELECT * FROM emergency_facilities WHERE 1=1"
        params: List[Any] = []

        if network_id:
            query += " AND network_id = ?"
            params.append(network_id)

        if categories:
            placeholders = ",".join("?" for _ in categories)
            query += f" AND category IN ({placeholders})"
            params.extend(categories)

        query += " ORDER BY name ASC"

        rows = conn.execute(query, params).fetchall()

        items: List[Dict[str, Any]] = []
        features: List[Dict[str, Any]] = []

        for row in rows:
            lat = float(row["lat"])
            lon = float(row["lon"])

            distance_m = None
            if user_lat is not None and user_lon is not None:
                distance_m = round(calculate_haversine_meters(user_lat, user_lon, lat, lon), 1)

            item = {
                "id": row["id"],
                "network_id": row["network_id"],
                "osm_id": row["osm_id"],
                "name": row["name"],
                "category": row["category"],
                "subcategory": row["subcategory"],
                "lat": lat,
                "lon": lon,
                "address": row["address"],
                "phone": row["phone"],
                "distance_m": distance_m,
            }
            items.append(item)

            features.append({
                "type": "Feature",
                "id": row["id"],
                "geometry": {
                    "type": "Point",
                    "coordinates": [lon, lat],
                },
                "properties": {
                    "id": row["id"],
                    "name": row["name"],
                    "category": row["category"],
                    "subcategory": row["subcategory"],
                    "address": row["address"] or "",
                    "phone": row["phone"] or "",
                    "distance_m": distance_m,
                },
            })

        # If user coordinates are provided, sort facilities by distance
        if user_lat is not None and user_lon is not None:
            items.sort(key=lambda x: x["distance_m"] if x["distance_m"] is not None else float("inf"))

        return {
            "facilities": items,
            "geojson": {
                "type": "FeatureCollection",
                "features": features,
            },
            "total_count": len(items),
        }


@router.post("/import")
def trigger_facility_import(network_id: str) -> Dict[str, Any]:
    """Force re-import or refresh real OSM facilities for a network."""
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT bbox_json FROM networks WHERE id = ?",
            (network_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Network not found")
        if not row["bbox_json"]:
            raise HTTPException(status_code=400, detail="Network does not have a bounding box")
        bbox = json.loads(row["bbox_json"])

    imported = import_emergency_facilities_for_network(network_id, tuple(bbox))
    return {
        "status": "success",
        "imported_count": len(imported),
        "network_id": network_id,
    }

