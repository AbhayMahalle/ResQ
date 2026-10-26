import os
import json
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from backend.db.database import get_db_connection
from backend.graph.importer import import_osm_road_network
from backend.graph.manager import graph_manager
from backend.schemas.models import NetworkImportRequest, NetworkMetadata

router = APIRouter(prefix="/api/networks", tags=["Networks"])


@router.post("/import", response_model=NetworkMetadata)
def import_network(req: NetworkImportRequest) -> NetworkMetadata:
    """
    Import genuine OpenStreetMap road network for a configurable geographic area.
    """
    try:
        res = import_osm_road_network(
            name=req.name,
            place_query=req.place_query,
            bbox=req.bbox,
            point=req.point,
            distance_m=req.distance_m or 1500.0,
            network_type=req.network_type,
        )
        return NetworkMetadata(
            id=res["id"],
            name=res["name"],
            place_or_query=res["place_or_query"],
            bbox=res["bbox"],
            node_count=res["node_count"],
            edge_count=res["edge_count"],
            created_at=res["created_at"],
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to import road network: {str(e)}")


@router.get("", response_model=List[NetworkMetadata])
def list_networks() -> List[NetworkMetadata]:
    """List all imported road networks stored in database."""
    with get_db_connection() as conn:
        cur = conn.execute(
            """
            SELECT id, name, place_or_query, bbox_json, node_count, edge_count, created_at
            FROM networks
            ORDER BY created_at DESC
            """
        )
        items = []
        for row in cur.fetchall():
            bbox = json.loads(row["bbox_json"]) if row["bbox_json"] else None
            items.append(
                NetworkMetadata(
                    id=row["id"],
                    name=row["name"],
                    place_or_query=row["place_or_query"],
                    bbox=bbox,
                    node_count=row["node_count"],
                    edge_count=row["edge_count"],
                    created_at=str(row["created_at"]),
                )
            )
        return items


@router.get("/{network_id}", response_model=NetworkMetadata)
def get_network(network_id: str) -> NetworkMetadata:
    """Get metadata for a specific network."""
    with get_db_connection() as conn:
        cur = conn.execute(
            """
            SELECT id, name, place_or_query, bbox_json, node_count, edge_count, created_at
            FROM networks
            WHERE id = ?
            """,
            (network_id,)
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Network not found.")

        bbox = json.loads(row["bbox_json"]) if row["bbox_json"] else None
        return NetworkMetadata(
            id=row["id"],
            name=row["name"],
            place_or_query=row["place_or_query"],
            bbox=bbox,
            node_count=row["node_count"],
            edge_count=row["edge_count"],
            created_at=str(row["created_at"]),
        )


@router.get("/{network_id}/geojson")
def get_network_geojson(
    network_id: str,
    scenario_id: Optional[str] = Query(None, description="Optional scenario ID"),
):
    """
    Get GeoJSON representation of road network.
    Fast streaming of pre-compressed base network (<100ms).
    """
    try:
        base_geojson_file = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "data", "graphs", f"{network_id}_base.geojson"
        )
        base_geojson_gz = base_geojson_file + ".gz"

        if os.path.exists(base_geojson_gz):
            from fastapi.responses import FileResponse
            return FileResponse(
                base_geojson_gz,
                media_type="application/json",
                headers={"Content-Encoding": "gzip"},
            )
        if os.path.exists(base_geojson_file):
            from fastapi.responses import FileResponse
            return FileResponse(base_geojson_file, media_type="application/json")
        return graph_manager.get_network_geojson(network_id, scenario_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

