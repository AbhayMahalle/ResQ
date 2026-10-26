import json
import logging
import math
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional, Tuple
from fastapi import APIRouter, Query
from backend.db.database import get_db_connection
from backend.graph.manager import graph_manager

logger = logging.getLogger("res_q.search")

router = APIRouter(prefix="/api/search", tags=["Search & Geocoding"])


def calculate_haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
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
def search_places(
    q: str = Query(..., min_length=1, description="Search query string"),
    network_id: Optional[str] = Query(None, description="Active road network ID to search within"),
    lat: Optional[float] = Query(None, description="User or map center latitude for proximity ranking"),
    lon: Optional[float] = Query(None, description="User or map center longitude for proximity ranking"),
) -> List[Dict[str, Any]]:
    """
    Intelligent autocomplete search across emergency facilities, local road network streets,
    and genuine OpenStreetMap places/addresses.
    """
    clean_q = q.strip().lower()
    results: List[Dict[str, Any]] = []
    seen_names = set()

    # Determine network bounding box and center coordinates
    net_bbox = None
    with get_db_connection() as conn:
        if network_id:
            row_net = conn.execute("SELECT bbox_json FROM networks WHERE id = ?", (network_id,)).fetchone()
        else:
            row_net = conn.execute("SELECT bbox_json FROM networks ORDER BY node_count DESC LIMIT 1").fetchone()
        if row_net and row_net["bbox_json"]:
            try:
                net_bbox = json.loads(row_net["bbox_json"])
            except Exception:
                net_bbox = None

    center_lat = (net_bbox[1] + net_bbox[3]) / 2.0 if (net_bbox and len(net_bbox) == 4) else 18.5204
    center_lon = (net_bbox[0] + net_bbox[2]) / 2.0 if (net_bbox and len(net_bbox) == 4) else 73.8567
    eff_lat = lat if lat is not None else center_lat
    eff_lon = lon if lon is not None else center_lon

    # 1. Search local Emergency Facilities in SQLite
    with get_db_connection() as conn:
        db_query = """
        SELECT id, name, category, subcategory, lat, lon, address
        FROM emergency_facilities
        WHERE lower(name) LIKE ? OR lower(category) LIKE ? OR (address IS NOT NULL AND lower(address) LIKE ?)
        """
        params: List[Any] = [f"%{clean_q}%", f"%{clean_q}%", f"%{clean_q}%"]
        if network_id:
            db_query += " AND network_id = ?"
            params.append(network_id)
        db_query += " LIMIT 10"

        rows = conn.execute(db_query, params).fetchall()
        for r in rows:
            r_lat = float(r["lat"])
            r_lon = float(r["lon"])
            dist = calculate_haversine(eff_lat, eff_lon, r_lat, r_lon)
            name = r["name"]
            seen_names.add(name.lower())

            category_label = r["category"].replace("_", " ").title()
            context = f"Emergency {category_label}"
            if r["address"]:
                context += f" • {r['address']}"

            results.append({
                "id": r["id"],
                "name": name,
                "category": r["category"],
                "type": "facility",
                "location_context": context,
                "lat": r_lat,
                "lon": r_lon,
                "distance_m": round(dist, 1),
                "is_facility": True,
            })

    # 2. Search Streets & Roads in Active Road Network Graph (<1ms via cached street index)
    if network_id:
        try:
            street_index = graph_manager.get_street_index(network_id)
            matched_count = 0
            for item in street_index:
                s_name = item["name"]
                if clean_q in s_name.lower() and s_name.lower() not in seen_names:
                    seen_names.add(s_name.lower())
                    s_lat = item["lat"]
                    s_lon = item["lon"]
                    dist = calculate_haversine(eff_lat, eff_lon, s_lat, s_lon)
                    hw_label = str(item.get("highway", "road")).replace("_", " ").title()
                    results.append({
                        "id": f"street_{hash(s_name)}",
                        "name": s_name,
                        "category": "street",
                        "type": "street",
                        "location_context": f"{hw_label} in active network",
                        "lat": s_lat,
                        "lon": s_lon,
                        "distance_m": round(dist, 1),
                        "is_facility": False,
                    })
                    matched_count += 1
                    if matched_count >= 6:
                        break
        except Exception as e:
            logger.debug(f"Street search error: {e}")

    # 3. Fallback / Complement with OpenStreetMap Photon Autocomplete Geocoder
    # Photon is strictly bounded to the active coverage area (Pune & PCMC) so external places never pollute results
    if len(results) < 8 and len(clean_q) >= 2:
        try:
            photon_params: Dict[str, Any] = {
                "q": clean_q,
                "limit": 10,
                "lat": eff_lat,
                "lon": eff_lon,
            }
            if net_bbox and len(net_bbox) == 4:
                # Add 0.08 degree buffer around Pune & PCMC network
                photon_params["bbox"] = f"{net_bbox[0] - 0.08:.4f},{net_bbox[1] - 0.08:.4f},{net_bbox[2] + 0.08:.4f},{net_bbox[3] + 0.08:.4f}"

            url = f"https://photon.komoot.io/api/?{urllib.parse.urlencode(photon_params)}"
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "ResQ-Disaster-App/1.0 (Autocomplete Geocoding)"},
            )
            with urllib.request.urlopen(req, timeout=1.8) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                for feat in data.get("features", []):
                    props = feat.get("properties", {})
                    p_name = props.get("name")
                    if not p_name or p_name.lower() in seen_names:
                        continue

                    coords = feat.get("geometry", {}).get("coordinates", [])
                    if len(coords) < 2:
                        continue

                    p_lon, p_lat = float(coords[0]), float(coords[1])
                    dist = calculate_haversine(eff_lat, eff_lon, p_lat, p_lon)
                    # Filter out any point farther than 45km from coverage center
                    if dist > 45000:
                        continue

                    seen_names.add(p_name.lower())

                    city = props.get("city") or props.get("district") or props.get("state") or props.get("country")
                    street = props.get("street")
                    ctx_parts = [p for p in [street, city] if p]
                    context = ", ".join(ctx_parts) if ctx_parts else (props.get("type") or "Location")

                    osm_val = props.get("osm_value") or props.get("type") or "place"
                    cat = "place"
                    if osm_val in ("hospital", "clinic"):
                        cat = "hospital"
                    elif osm_val == "police":
                        cat = "police"
                    elif osm_val == "fire_station":
                        cat = "fire_station"

                    results.append({
                        "id": f"osm_{props.get('osm_id', hash(p_name))}",
                        "name": p_name,
                        "category": cat,
                        "type": "place",
                        "location_context": context,
                        "lat": p_lat,
                        "lon": p_lon,
                        "distance_m": round(dist, 1),
                        "is_facility": cat in ("hospital", "police", "fire_station"),
                    })
        except Exception as e:
            logger.debug(f"Photon geocoder lookup failed: {e}")

    # Rank results: exact match first, then by distance
    def sort_key(item: Dict[str, Any]) -> Tuple[int, float]:
        name_lower = item["name"].lower()
        is_exact = 0 if name_lower == clean_q else (1 if name_lower.startswith(clean_q) else 2)
        dist = item["distance_m"] if item["distance_m"] is not None else 9999999.0
        return (is_exact, dist)

    results.sort(key=sort_key)
    return results[:10]

