import json
import logging
import urllib.parse
import urllib.request
import uuid
from typing import Any, Dict, List, Optional, Tuple
from backend.db.database import get_db_connection

logger = logging.getLogger("res_q.facilities")

OVERPASS_MIRRORS = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]


def build_overpass_query(min_lat: float, min_lon: float, max_lat: float, max_lon: float) -> str:
    return f"""
    [out:json][timeout:25];
    (
      node["amenity"~"hospital|clinic|doctors|nursing_home"]({min_lat},{min_lon},{max_lat},{max_lon});
      way["amenity"~"hospital|clinic|doctors|nursing_home"]({min_lat},{min_lon},{max_lat},{max_lon});
      node["healthcare"~"hospital|clinic"]({min_lat},{min_lon},{max_lat},{max_lon});
      way["healthcare"~"hospital|clinic"]({min_lat},{min_lon},{max_lat},{max_lon});
      node["amenity"="fire_station"]({min_lat},{min_lon},{max_lat},{max_lon});
      way["amenity"="fire_station"]({min_lat},{min_lon},{max_lat},{max_lon});
      node["amenity"="police"]({min_lat},{min_lon},{max_lat},{max_lon});
      way["amenity"="police"]({min_lat},{min_lon},{max_lat},{max_lon});
      node["amenity"="shelter"]({min_lat},{min_lon},{max_lat},{max_lon});
      node["emergency"~"shelter|assembly_point"]({min_lat},{min_lon},{max_lat},{max_lon});
      node["building"="warehouse"]({min_lat},{min_lon},{max_lat},{max_lon});
      way["building"="warehouse"]({min_lat},{min_lon},{max_lat},{max_lon});
    );
    out center tags;
    """


def categorize_osm_facility(tags: Dict[str, str]) -> Tuple[str, str]:
    """Map OSM tags to standard ResQ disaster facility categories."""
    amenity = tags.get("amenity", "").lower()
    healthcare = tags.get("healthcare", "").lower()
    emergency = tags.get("emergency", "").lower()
    building = tags.get("building", "").lower()

    if amenity in ("hospital", "clinic", "doctors", "nursing_home") or healthcare in ("hospital", "clinic"):
        return "hospital", amenity or healthcare or "hospital"

    if amenity == "fire_station" or emergency == "fire_station":
        return "fire_station", "fire_station"

    if amenity == "police":
        return "police", "police"

    if amenity == "shelter" or emergency == "shelter" or emergency == "assembly_point":
        return "shelter", emergency or amenity or "shelter"

    if building == "warehouse" or tags.get("shop") in ("agrarian", "wholesale") or tags.get("industrial") == "warehouse":
        return "warehouse", "warehouse"

    return "shelter", "general_facility"


def query_overpass_elements(min_lat: float, min_lon: float, max_lat: float, max_lon: float) -> List[Dict[str, Any]]:
    query = build_overpass_query(min_lat, min_lon, max_lat, max_lon)
    encoded = urllib.parse.urlencode({"data": query}).encode("utf-8")

    for mirror in OVERPASS_MIRRORS:
        try:
            req = urllib.request.Request(
                mirror,
                data=encoded,
                headers={"User-Agent": "ResQ-Disaster-App/1.0 (Emergency Facilities Discovery)"},
            )
            with urllib.request.urlopen(req, timeout=18) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                elements = data.get("elements", [])
                if elements:
                    logger.info(f"Retrieved {len(elements)} facilities from {mirror}")
                    return elements
        except Exception as e:
            logger.warning(f"Overpass query to {mirror} failed: {e}")
            continue

    return []


def import_emergency_facilities_for_network(
    network_id: str,
    bbox: Tuple[float, float, float, float],
) -> List[Dict[str, Any]]:
    """
    Import genuine OpenStreetMap emergency facilities for a network's bounding box.
    bbox format: (min_lon, min_lat, max_lon, max_lat)
    """
    min_lon, min_lat, max_lon, max_lat = bbox
    elements = query_overpass_elements(min_lat, min_lon, max_lat, max_lon)
    if not elements:
        logger.info(f"No facilities returned from Overpass for network {network_id}")
        return []

    imported: List[Dict[str, Any]] = []

    with get_db_connection() as conn:
        for el in elements:
            tags = el.get("tags", {})
            osm_id = el.get("id")
            if not osm_id:
                continue

            # Determine coordinates (nodes have lat/lon, ways have center.lat/center.lon)
            lat = el.get("lat") or el.get("center", {}).get("lat")
            lon = el.get("lon") or el.get("center", {}).get("lon")
            if lat is None or lon is None:
                continue

            category, subcategory = categorize_osm_facility(tags)
            name = tags.get("name") or tags.get("name:en") or f"Emergency {category.replace('_', ' ').title()}"

            # Extract address / phone if present
            street = tags.get("addr:street")
            city = tags.get("addr:city")
            address = f"{street}, {city}".strip(", ") if (street or city) else None
            phone = tags.get("phone") or tags.get("contact:phone")

            fac_id = f"fac_{uuid.uuid4().hex[:12]}"

            conn.execute(
                """
                INSERT INTO emergency_facilities (
                    id, network_id, osm_id, name, category, subcategory, lat, lon, address, phone, raw_tags_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(network_id, osm_id) DO UPDATE SET
                    name = excluded.name,
                    category = excluded.category,
                    subcategory = excluded.subcategory,
                    lat = excluded.lat,
                    lon = excluded.lon,
                    address = excluded.address,
                    phone = excluded.phone,
                    raw_tags_json = excluded.raw_tags_json
                """,
                (
                    fac_id,
                    network_id,
                    osm_id,
                    name,
                    category,
                    subcategory,
                    float(lat),
                    float(lon),
                    address,
                    phone,
                    json.dumps(tags),
                ),
            )

            imported.append({
                "id": fac_id,
                "network_id": network_id,
                "osm_id": osm_id,
                "name": name,
                "category": category,
                "subcategory": subcategory,
                "lat": float(lat),
                "lon": float(lon),
                "address": address,
                "phone": phone,
            })

    return imported

