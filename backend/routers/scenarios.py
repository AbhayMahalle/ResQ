import uuid
from typing import List
from fastapi import APIRouter, HTTPException, Query
from backend.db.database import get_db_connection
from backend.schemas.models import ScenarioCreate, ScenarioResponse, ScenarioUpdate

router = APIRouter(prefix="/api/scenarios", tags=["Scenarios"])


@router.get("", response_model=List[ScenarioResponse])
def list_scenarios(network_id: str = Query(..., description="ID of network")) -> List[ScenarioResponse]:
    """List all scenarios for a network with override and hazard counts."""
    with get_db_connection() as conn:
        cur = conn.execute(
            """
            SELECT s.id, s.network_id, s.name, s.description, s.version, s.is_active, s.created_at, s.updated_at,
                   (SELECT COUNT(*) FROM road_overrides r WHERE r.scenario_id = s.id) as overrides_count,
                   (SELECT COUNT(*) FROM hazards h WHERE h.scenario_id = s.id) as hazards_count
            FROM scenarios s
            WHERE s.network_id = ?
            ORDER BY s.is_active DESC, s.created_at ASC
            """,
            (network_id,)
        )
        items = []
        for row in cur.fetchall():
            items.append(
                ScenarioResponse(
                    id=row["id"],
                    network_id=row["network_id"],
                    name=row["name"],
                    description=row["description"],
                    version=row["version"],
                    is_active=bool(row["is_active"]),
                    road_overrides_count=row["overrides_count"],
                    hazards_count=row["hazards_count"],
                    created_at=str(row["created_at"]),
                    updated_at=str(row["updated_at"]),
                )
            )
        return items


@router.post("", response_model=ScenarioResponse)
def create_scenario(req: ScenarioCreate) -> ScenarioResponse:
    """Create a new independent disaster scenario."""
    scenario_id = f"scen_{uuid.uuid4().hex[:10]}"
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO scenarios (id, network_id, name, description, version, is_active)
            VALUES (?, ?, ?, ?, 1, 0)
            """,
            (scenario_id, req.network_id, req.name, req.description or "")
        )

    return get_scenario(scenario_id)


@router.get("/{scenario_id}", response_model=ScenarioResponse)
def get_scenario(scenario_id: str) -> ScenarioResponse:
    """Get scenario details."""
    with get_db_connection() as conn:
        cur = conn.execute(
            """
            SELECT s.id, s.network_id, s.name, s.description, s.version, s.is_active, s.created_at, s.updated_at,
                   (SELECT COUNT(*) FROM road_overrides r WHERE r.scenario_id = s.id) as overrides_count,
                   (SELECT COUNT(*) FROM hazards h WHERE h.scenario_id = s.id) as hazards_count
            FROM scenarios s
            WHERE s.id = ?
            """,
            (scenario_id,)
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Scenario not found.")

        return ScenarioResponse(
            id=row["id"],
            network_id=row["network_id"],
            name=row["name"],
            description=row["description"],
            version=row["version"],
            is_active=bool(row["is_active"]),
            road_overrides_count=row["overrides_count"],
            hazards_count=row["hazards_count"],
            created_at=str(row["created_at"]),
            updated_at=str(row["updated_at"]),
        )


@router.put("/{scenario_id}", response_model=ScenarioResponse)
def update_scenario(scenario_id: str, req: ScenarioUpdate) -> ScenarioResponse:
    """Update scenario metadata."""
    with get_db_connection() as conn:
        if req.name is not None and req.description is not None:
            conn.execute(
                """
                UPDATE scenarios
                SET name = ?, description = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (req.name, req.description, scenario_id)
            )
        elif req.name is not None:
            conn.execute(
                """
                UPDATE scenarios
                SET name = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (req.name, scenario_id)
            )
        elif req.description is not None:
            conn.execute(
                """
                UPDATE scenarios
                SET description = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (req.description, scenario_id)
            )

    return get_scenario(scenario_id)


@router.post("/{scenario_id}/activate", response_model=ScenarioResponse)
def activate_scenario(scenario_id: str) -> ScenarioResponse:
    """Set a scenario as the active scenario for its network."""
    with get_db_connection() as conn:
        cur = conn.execute("SELECT network_id FROM scenarios WHERE id = ?", (scenario_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Scenario not found.")

        net_id = row["network_id"]
        # Deactivate other scenarios for this network
        conn.execute("UPDATE scenarios SET is_active = 0 WHERE network_id = ?", (net_id,))
        conn.execute("UPDATE scenarios SET is_active = 1 WHERE id = ?", (scenario_id,))

    return get_scenario(scenario_id)


@router.post("/{scenario_id}/duplicate", response_model=ScenarioResponse)
def duplicate_scenario(scenario_id: str, new_name: str = Query(None, description="Name for duplicated scenario")) -> ScenarioResponse:
    """Duplicate a scenario and all its road overrides, node overrides, and hazards."""
    with get_db_connection() as conn:
        cur = conn.execute("SELECT network_id, name, description FROM scenarios WHERE id = ?", (scenario_id,))
        orig = cur.fetchone()
        if not orig:
            raise HTTPException(status_code=404, detail="Scenario not found.")

        new_id = f"scen_{uuid.uuid4().hex[:10]}"
        dup_name = new_name or f"Copy of {orig['name']}"

        conn.execute(
            """
            INSERT INTO scenarios (id, network_id, name, description, version, is_active)
            VALUES (?, ?, ?, ?, 1, 0)
            """,
            (new_id, orig["network_id"], dup_name, orig["description"])
        )

        # Copy road overrides
        conn.execute(
            """
            INSERT INTO road_overrides (id, scenario_id, edge_u, edge_v, edge_key, way_id, state, closure_reason, risk_penalty, notes)
            SELECT ( 'ov_' || lower(hex(randomblob(6))) ), ?, edge_u, edge_v, edge_key, way_id, state, closure_reason, risk_penalty, notes
            FROM road_overrides
            WHERE scenario_id = ?
            """,
            (new_id, scenario_id)
        )

        # Copy node overrides
        conn.execute(
            """
            INSERT INTO node_overrides (id, scenario_id, node_id, state, reason)
            SELECT ( 'nov_' || lower(hex(randomblob(6))) ), ?, node_id, state, reason
            FROM node_overrides
            WHERE scenario_id = ?
            """,
            (new_id, scenario_id)
        )

        # Copy hazards
        conn.execute(
            """
            INSERT INTO hazards (id, scenario_id, name, hazard_type, severity, impact_mode, risk_penalty, geometry_json)
            SELECT ( 'haz_' || lower(hex(randomblob(6))) ), ?, name, hazard_type, severity, impact_mode, risk_penalty, geometry_json
            FROM hazards
            WHERE scenario_id = ?
            """,
            (new_id, scenario_id)
        )

    return get_scenario(new_id)


@router.post("/{scenario_id}/reset", response_model=ScenarioResponse)
def reset_scenario(scenario_id: str) -> ScenarioResponse:
    """Reset a scenario by clearing all its road overrides, node overrides, and hazards."""
    with get_db_connection() as conn:
        conn.execute("DELETE FROM road_overrides WHERE scenario_id = ?", (scenario_id,))
        conn.execute("DELETE FROM node_overrides WHERE scenario_id = ?", (scenario_id,))
        conn.execute("DELETE FROM hazards WHERE scenario_id = ?", (scenario_id,))
        conn.execute(
            "UPDATE scenarios SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (scenario_id,)
        )

    return get_scenario(scenario_id)


@router.delete("/{scenario_id}")
def delete_scenario(scenario_id: str) -> dict:
    """Delete a scenario and its associated overrides."""
    with get_db_connection() as conn:
        cur = conn.execute("SELECT name, is_active FROM scenarios WHERE id = ?", (scenario_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Scenario not found.")
        if row["name"] == "Baseline":
            raise HTTPException(status_code=400, detail="Cannot delete default Baseline scenario.")

        conn.execute("DELETE FROM scenarios WHERE id = ?", (scenario_id,))

    return {"deleted": True, "id": scenario_id}

