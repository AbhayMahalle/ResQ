import json
import uuid
from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException
from backend.db.database import get_db_connection
from backend.graph.geometry_utils import parse_hazard_polygon
from backend.graph.manager import graph_manager
from backend.schemas.models import HazardCreate, HazardResponse
from shapely.geometry import LineString

router = APIRouter(prefix="/api/scenarios/{scenario_id}/hazards", tags=["Hazards"])


@router.get("", response_model=List[HazardResponse])
def list_hazards(scenario_id: str) -> List[HazardResponse]:
    """List all hazards defined in a scenario."""
    with get_db_connection() as conn:
        cur_scen = conn.execute("SELECT network_id FROM scenarios WHERE id = ?", (scenario_id,))
        scen_row = cur_scen.fetchone()
        if not scen_row:
            raise HTTPException(status_code=404, detail="Scenario not found.")

        network_id = scen_row["network_id"]
        base_g = graph_manager.get_base_graph(network_id)

        cur = conn.execute(
            """
            SELECT id, scenario_id, name, hazard_type, severity, impact_mode, risk_penalty, geometry_json, created_at
            FROM hazards
            WHERE scenario_id = ?
            ORDER BY created_at DESC
            """,
            (scenario_id,)
        )

        results = []
        for row in cur.fetchall():
            geom_dict = json.loads(row["geometry_json"])
            # Count affected edges
            try:
                poly = parse_hazard_polygon(geom_dict)
                affected_count = 0
                for _, _, _, data in base_g.edges(data=True, keys=True):
                    g = data.get("geometry")
                    if g is not None and isinstance(g, LineString) and poly.intersects(g):
                        affected_count += 1
            except Exception:
                affected_count = 0

            results.append(
                HazardResponse(
                    id=row["id"],
                    scenario_id=row["scenario_id"],
                    name=row["name"],
                    hazard_type=row["hazard_type"],
                    severity=row["severity"],
                    impact_mode=row["impact_mode"],
                    risk_penalty=float(row["risk_penalty"]),
                    geometry=geom_dict,
                    affected_edges_count=affected_count,
                    created_at=str(row["created_at"]),
                )
            )
        return results


@router.post("", response_model=HazardResponse)
def create_hazard(scenario_id: str, req: HazardCreate) -> HazardResponse:
    """
    Create a hazard zone (polygon or circle) and associate it with a scenario.
    Real geometric intersection is performed against the road network.
    """
    with get_db_connection() as conn:
        cur_scen = conn.execute("SELECT network_id FROM scenarios WHERE id = ?", (scenario_id,))
        scen_row = cur_scen.fetchone()
        if not scen_row:
            raise HTTPException(status_code=404, detail="Scenario not found.")

        network_id = scen_row["network_id"]
        base_g = graph_manager.get_base_graph(network_id)

        # Validate geometry
        try:
            poly = parse_hazard_polygon(req.geometry)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid hazard geometry: {str(e)}")

        # Count intersecting edges
        affected_count = 0
        for _, _, _, data in base_g.edges(data=True, keys=True):
            g = data.get("geometry")
            if g is not None and isinstance(g, LineString) and poly.intersects(g):
                affected_count += 1

        hazard_id = f"haz_{uuid.uuid4().hex[:10]}"
        geom_json_str = json.dumps(req.geometry)

        conn.execute(
            """
            INSERT INTO hazards (id, scenario_id, name, hazard_type, severity, impact_mode, risk_penalty, geometry_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                hazard_id,
                scenario_id,
                req.name,
                req.hazard_type,
                req.severity,
                req.impact_mode,
                req.risk_penalty,
                geom_json_str,
            )
        )

        conn.execute(
            "UPDATE scenarios SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (scenario_id,)
        )

    return HazardResponse(
        id=hazard_id,
        scenario_id=scenario_id,
        name=req.name,
        hazard_type=req.hazard_type,
        severity=req.severity,
        impact_mode=req.impact_mode,
        risk_penalty=req.risk_penalty,
        geometry=req.geometry,
        affected_edges_count=affected_count,
        created_at="now",
    )


@router.delete("/{hazard_id}")
def delete_hazard(scenario_id: str, hazard_id: str) -> dict:
    """Delete a hazard zone from a scenario."""
    with get_db_connection() as conn:
        res = conn.execute(
            "DELETE FROM hazards WHERE id = ? AND scenario_id = ?",
            (hazard_id, scenario_id)
        )
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Hazard not found.")

        conn.execute(
            "UPDATE scenarios SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (scenario_id,)
        )

    return {"deleted": True, "id": hazard_id}

