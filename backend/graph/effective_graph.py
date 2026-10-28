import json
from typing import Any, Dict, List, Optional, Set, Tuple
import networkx as nx
from shapely.geometry import LineString, Point, Polygon
from backend.db.database import get_db_connection
from backend.graph.geometry_utils import parse_hazard_polygon


class EffectiveGraphView:
    """
    Dynamic scenario view layered on top of an immutable base road graph.
    Applies scenario road overrides, node overrides, and geometric hazard intersections.
    Never modifies the underlying base graph.
    """

    def __init__(self, base_graph: nx.MultiDiGraph, scenario_id: Optional[str] = None):
        self.base_graph = base_graph
        self.scenario_id = scenario_id

        # Maps (u, v, k) -> dict of override attributes
        self.edge_overrides: Dict[Tuple[int, int, int], Dict[str, Any]] = {}
        # Set of unavailable node IDs
        self.unavailable_nodes: Set[int] = set()
        # Set of blocked edge tuples (u, v, k)
        self.blocked_edges: Set[Tuple[int, int, int]] = set()
        # Active hazards list with geometry
        self.active_hazards: List[Dict[str, Any]] = []

        if scenario_id:
            self._load_scenario_overrides(scenario_id)

    def _load_scenario_overrides(self, scenario_id: str) -> None:
        """
        Load scenario road overrides, node overrides, and hazards from SQLite,
        and calculate real geometric hazard intersections against base graph edges.
        """
        with get_db_connection() as conn:
            # 1. Load road overrides
            cur = conn.execute(
                """
                SELECT edge_u, edge_v, edge_key, way_id, state, closure_reason, risk_penalty, notes
                FROM road_overrides
                WHERE scenario_id = ?
                """,
                (scenario_id,)
            )
            for row in cur.fetchall():
                key_tuple = (row["edge_u"], row["edge_v"], row["edge_key"])
                self.edge_overrides[key_tuple] = {
                    "state": row["state"],
                    "closure_reason": row["closure_reason"],
                    "risk_penalty": float(row["risk_penalty"]),
                    "notes": row["notes"],
                }
                if row["state"] == "BLOCKED":
                    self.blocked_edges.add(key_tuple)

            # 2. Load node overrides
            cur_nodes = conn.execute(
                """
                SELECT node_id, state, reason
                FROM node_overrides
                WHERE scenario_id = ?
                """,
                (scenario_id,)
            )
            for row in cur_nodes.fetchall():
                if row["state"] == "UNAVAILABLE":
                    self.unavailable_nodes.add(row["node_id"])

            # 3. Load hazards and compute geometric intersections
            cur_hazards = conn.execute(
                """
                SELECT id, name, hazard_type, severity, impact_mode, risk_penalty, geometry_json
                FROM hazards
                WHERE scenario_id = ?
                """,
                (scenario_id,)
            )
            for row in cur_hazards.fetchall():
                try:
                    geom_dict = json.loads(row["geometry_json"])
                    hazard_poly = parse_hazard_polygon(geom_dict)
                    hazard_info = {
                        "id": row["id"],
                        "name": row["name"],
                        "hazard_type": row["hazard_type"],
                        "severity": row["severity"],
                        "impact_mode": row["impact_mode"],
                        "risk_penalty": float(row["risk_penalty"]),
                        "polygon": hazard_poly,
                    }
                    self.active_hazards.append(hazard_info)
                    self._apply_hazard_intersection(hazard_info)
                except Exception as e:
                    print(f"Error applying hazard {row['id']}: {e}")

    def _apply_hazard_intersection(self, hazard: Dict[str, Any]) -> None:
        """
        Perform real geometric intersection checks between hazard polygon
        and base road graph edges.
        """
        poly: Polygon = hazard["polygon"]
        impact_mode = hazard["impact_mode"]
        risk_penalty = hazard["risk_penalty"]
        reason = hazard["hazard_type"]

        # Intersect with edges
        for u, v, k, data in self.base_graph.edges(data=True, keys=True):
            edge_tuple = (u, v, k)
            # If user has an explicit road override (e.g. explicitly marked OPEN), respect user override
            if edge_tuple in self.edge_overrides and self.edge_overrides[edge_tuple]["state"] == "OPEN":
                continue

            geom = data.get("geometry")
            if geom is not None and isinstance(geom, LineString):
                if poly.intersects(geom):
                    if impact_mode == "BLOCK_ALL":
                        self.blocked_edges.add(edge_tuple)
                        self.edge_overrides[edge_tuple] = {
                            "state": "BLOCKED",
                            "closure_reason": reason,
                            "risk_penalty": risk_penalty,
                            "notes": f"Blocked by {hazard['name']}",
                        }
                    elif impact_mode == "HIGH_RISK":
                        curr_penalty = self.edge_overrides.get(edge_tuple, {}).get("risk_penalty", 1.0)
                        self.edge_overrides[edge_tuple] = {
                            "state": "HIGH_RISK",
                            "closure_reason": reason,
                            "risk_penalty": max(curr_penalty, risk_penalty),
                            "notes": f"High risk from {hazard['name']}",
                        }
                    elif impact_mode == "RESTRICTED":
                        self.edge_overrides[edge_tuple] = {
                            "state": "RESTRICTED",
                            "closure_reason": reason,
                            "risk_penalty": risk_penalty,
                            "notes": f"Restricted by {hazard['name']}",
                        }

    def is_edge_blocked(self, u: int, v: int, k: int = 0) -> bool:
        """Check if edge is currently blocked."""
        return (u, v, k) in self.blocked_edges

    def is_node_unavailable(self, n: int) -> bool:
        """Check if node is currently marked unavailable."""
        return n in self.unavailable_nodes

    def get_edge_penalty(self, u: int, v: int, k: int = 0) -> Tuple[float, bool]:
        """
        Returns (risk_penalty, is_restricted).
        Default for un-overridden edges is (1.0, False).
        """
        override = self.edge_overrides.get((u, v, k))
        if not override:
            return 1.0, False

        state = override.get("state", "OPEN")
        risk_penalty = float(override.get("risk_penalty", 1.0))
        is_restricted = (state == "RESTRICTED")
        return risk_penalty, is_restricted

    def get_edge_state(self, u: int, v: int, k: int = 0) -> Tuple[str, Optional[str]]:
        """
        Returns (state, closure_reason).
        """
        override = self.edge_overrides.get((u, v, k))
        if override:
            return override.get("state", "OPEN"), override.get("closure_reason")
        return "OPEN", None

