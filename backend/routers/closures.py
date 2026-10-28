import uuid
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from backend.db.database import get_db_connection
from backend.graph.geometry_utils import edge_geometry_to_coords
from backend.graph.manager import graph_manager
from backend.schemas.models import BulkRemoveClosuresRequest, RoadOverrideCreate, RoadOverrideResponse

router = APIRouter(prefix="/api/scenarios/{scenario_id}/closures", tags=["Road Closures"])


@router.get("", response_model=List[RoadOverrideResponse])
def list_closures(scenario_id: str) -> List[RoadOverrideResponse]:
    """List all active road overrides/closures in a scenario with road names."""
    with get_db_connection() as conn:
        cur_scen = conn.execute("SELECT network_id FROM scenarios WHERE id = ?", (scenario_id,))
        scen_row = cur_scen.fetchone()
        base_g = None
        if scen_row:
            try:
                base_g = graph_manager.get_base_graph(scen_row["network_id"])
            except Exception:
                base_g = None

        cur = conn.execute(
            """
            SELECT id, scenario_id, edge_u, edge_v, edge_key, way_id, state, closure_reason, risk_penalty, notes, created_at
            FROM road_overrides
            WHERE scenario_id = ?
            ORDER BY created_at DESC
            """,
            (scenario_id,)
        )
        results = []
        for row in cur.fetchall():
            road_name = row["notes"]
            if (not road_name or road_name in {"nan", "undefined"}) and base_g:
                u, v, k = row["edge_u"], row["edge_v"], row["edge_key"]
                if base_g.has_edge(u, v):
                    d = base_g[u][v].get(k, next(iter(base_g[u][v].values())))
                    road_name = str(d.get("name", ""))
                elif base_g.has_edge(v, u):
                    d = base_g[v][u].get(k, next(iter(base_g[v][u].values())))
                    road_name = str(d.get("name", ""))
            
            results.append(
                RoadOverrideResponse(
                    id=row["id"],
                    scenario_id=row["scenario_id"],
                    edge_u=row["edge_u"],
                    edge_v=row["edge_v"],
                    edge_key=row["edge_key"],
                    way_id=row["way_id"],
                    state=row["state"],
                    closure_reason=row["closure_reason"],
                    risk_penalty=float(row["risk_penalty"]),
                    notes=road_name or None,
                    created_at=str(row["created_at"]),
                )
            )
        return results


@router.post("", response_model=List[RoadOverrideResponse])
def apply_road_closure(scenario_id: str, req: RoadOverrideCreate) -> List[RoadOverrideResponse]:
    """
    Apply a road condition/closure to a single edge, both directions, or an entire OSM way.
    Preserves shared intersections and unrelated connecting roads.
    """
    with get_db_connection() as conn:
        cur_scen = conn.execute("SELECT network_id FROM scenarios WHERE id = ?", (scenario_id,))
        scen_row = cur_scen.fetchone()
        if not scen_row:
            raise HTTPException(status_code=404, detail="Scenario not found.")

        network_id = scen_row["network_id"]
        base_g = graph_manager.get_base_graph(network_id)

        target_edges = []
        if req.scope == "edge":
            target_edges.append((req.edge_u, req.edge_v, req.edge_key))

        elif req.scope == "both_directions":
            target_edges.append((req.edge_u, req.edge_v, req.edge_key))
            # Find reverse edges in base graph
            if base_g.has_edge(req.edge_v, req.edge_u):
                for r_key in base_g[req.edge_v][req.edge_u]:
                    target_edges.append((req.edge_v, req.edge_u, r_key))

        elif req.scope == "entire_way" and req.way_id:
            # Match all edges sharing this way_id
            for u, v, k, data in base_g.edges(data=True, keys=True):
                osmid = data.get("osmid")
                match = False
                if isinstance(osmid, list) and req.way_id in osmid:
                    match = True
                elif osmid == req.way_id:
                    match = True
                if match:
                    target_edges.append((u, v, k))

        if not target_edges:
            target_edges.append((req.edge_u, req.edge_v, req.edge_key))

        if req.state == "OPEN":
            for u, v, k in set(target_edges):
                conn.execute(
                    "DELETE FROM road_overrides WHERE scenario_id = ? AND edge_u = ? AND edge_v = ? AND edge_key = ?",
                    (scenario_id, u, v, k),
                )
        else:
            default_road_name = req.notes
            if (not default_road_name or default_road_name in {"nan", "undefined"}) and base_g:
                if base_g.has_edge(req.edge_u, req.edge_v):
                    d = base_g[req.edge_u][req.edge_v].get(req.edge_key, next(iter(base_g[req.edge_u][req.edge_v].values())))
                    default_road_name = str(d.get("name", ""))
                elif base_g.has_edge(req.edge_v, req.edge_u):
                    d = base_g[req.edge_v][req.edge_u].get(req.edge_key, next(iter(base_g[req.edge_v][req.edge_u].values())))
                    default_road_name = str(d.get("name", ""))

            for u, v, k in set(target_edges):
                override_id = f"ov_{uuid.uuid4().hex[:10]}"
                edge_name = default_road_name
                if (not edge_name or edge_name in {"nan", "undefined"}) and base_g and base_g.has_edge(u, v):
                    d = base_g[u][v].get(k, next(iter(base_g[u][v].values())))
                    edge_name = str(d.get("name", ""))

                conn.execute(
                    """
                    INSERT INTO road_overrides (id, scenario_id, edge_u, edge_v, edge_key, way_id, state, closure_reason, risk_penalty, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(scenario_id, edge_u, edge_v, edge_key) DO UPDATE SET
                        state = excluded.state,
                        closure_reason = excluded.closure_reason,
                        risk_penalty = excluded.risk_penalty,
                        notes = excluded.notes,
                        way_id = coalesce(excluded.way_id, road_overrides.way_id)
                    """,
                    (
                        override_id,
                        scenario_id,
                        u,
                        v,
                        k,
                        req.way_id,
                        req.state,
                        req.closure_reason,
                        req.risk_penalty,
                        edge_name or "",
                    )
                )

        # Bump scenario version
        conn.execute(
            "UPDATE scenarios SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (scenario_id,)
        )

    return list_closures(scenario_id)


@router.get("/geojson")
def get_closures_geojson(scenario_id: str) -> dict:
    """
    Export active road overrides (closures, high-risk, restricted) as a lightweight GeoJSON.
    Instant extraction (<5ms) directly using graph geometry.
    """
    with get_db_connection() as conn:
        cur_scen = conn.execute("SELECT network_id FROM scenarios WHERE id = ?", (scenario_id,))
        scen_row = cur_scen.fetchone()
        if not scen_row:
            raise HTTPException(status_code=404, detail="Scenario not found.")

        network_id = scen_row["network_id"]
        base_g = graph_manager.get_base_graph(network_id)

        cur = conn.execute(
            """
            SELECT id, edge_u, edge_v, edge_key, way_id, state, closure_reason, risk_penalty, notes
            FROM road_overrides
            WHERE scenario_id = ? AND state != 'OPEN'
            """,
            (scenario_id,)
        )
        rows = cur.fetchall()

        features = []
        for r in rows:
            u, v, k = r["edge_u"], r["edge_v"], r["edge_key"]
            if not base_g.has_edge(u, v):
                if base_g.has_edge(v, u):
                    u, v = v, u
                else:
                    continue

            d = base_g[u][v].get(k, next(iter(base_g[u][v].values())))
            u_node = base_g.nodes.get(u)
            v_node = base_g.nodes.get(v)
            if not u_node or not v_node:
                continue

            coords = edge_geometry_to_coords(
                d,
                (float(u_node["x"]), float(u_node["y"])),
                (float(v_node["x"]), float(v_node["y"])),
            )

            features.append({
                "type": "Feature",
                "id": r["id"],
                "geometry": {
                    "type": "LineString",
                    "coordinates": coords,
                },
                "properties": {
                    "id": r["id"],
                    "u": u,
                    "v": v,
                    "key": k,
                    "way_id": r["way_id"],
                    "name": str(d.get("name", "Closed Road")),
                    "state": r["state"],
                    "closure_reason": r["closure_reason"],
                    "risk_penalty": float(r["risk_penalty"]),
                    "length_m": round(float(d.get("length", 0.0)), 1),
                },
            })

        return {
            "type": "FeatureCollection",
            "features": features,
        }


@router.post("/bulk-remove")
def bulk_remove_road_closures(scenario_id: str, req: BulkRemoveClosuresRequest) -> dict:
    """Reopen multiple closed roads, an entire way, or all roads in a scenario at once."""
    with get_db_connection() as conn:
        deleted_count = 0
        if req.all_closures:
            res = conn.execute("DELETE FROM road_overrides WHERE scenario_id = ?", (scenario_id,))
            deleted_count = res.rowcount
        elif req.override_ids and len(req.override_ids) > 0:
            placeholders = ",".join("?" for _ in req.override_ids)
            params = [scenario_id] + list(req.override_ids)
            res = conn.execute(
                f"DELETE FROM road_overrides WHERE scenario_id = ? AND id IN ({placeholders})",
                params,
            )
            deleted_count = res.rowcount
        elif req.way_id:
            res = conn.execute(
                "DELETE FROM road_overrides WHERE scenario_id = ? AND way_id = ?",
                (scenario_id, req.way_id),
            )
            deleted_count = res.rowcount

        conn.execute(
            "UPDATE scenarios SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (scenario_id,)
        )

    return {"reopened_count": deleted_count, "scenario_id": scenario_id}


@router.delete("/{override_id}")
def remove_road_closure(scenario_id: str, override_id: str) -> dict:
    """Reopen a closed road by removing its scenario override."""
    with get_db_connection() as conn:
        res = conn.execute(
            "DELETE FROM road_overrides WHERE id = ? AND scenario_id = ?",
            (override_id, scenario_id)
        )
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Road closure override not found.")

        conn.execute(
            "UPDATE scenarios SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (scenario_id,)
        )

    return {"reopened": True, "override_id": override_id}

