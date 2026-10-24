import json
import os
import threading
from typing import Any, Dict, List, Optional
import networkx as nx
import osmnx as ox
from backend.db.database import get_db_connection
from backend.graph.effective_graph import EffectiveGraphView
from backend.graph.geometry_utils import edge_geometry_to_coords


class GraphManager:
    """
    Singleton manager holding immutable base graphs in memory
    and producing dynamic scenario EffectiveGraphViews.
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super(GraphManager, cls).__new__(cls)
                    cls._instance._graphs: Dict[str, nx.MultiDiGraph] = {}
                    cls._instance._street_indexes: Dict[str, List[Dict[str, Any]]] = {}
        return cls._instance

    def register_graph(self, network_id: str, G: nx.MultiDiGraph) -> None:
        """Register a graph directly (useful for tests and newly imported networks)."""
        with self._lock:
            self._graphs[network_id] = G
            self._street_indexes.pop(network_id, None)

    def get_base_graph(self, network_id: str) -> nx.MultiDiGraph:
        """
        Retrieve immutable base graph by network ID.
        Loads from disk if not yet in memory.
        """
        with self._lock:
            if network_id in self._graphs:
                return self._graphs[network_id]

        # Load from disk via SQLite metadata
        with get_db_connection() as conn:
            cur = conn.execute("SELECT file_path FROM networks WHERE id = ?", (network_id,))
            row = cur.fetchone()
            if not row or not os.path.exists(row["file_path"]):
                raise ValueError(f"Network '{network_id}' not found in database or disk cache.")

            file_path = row["file_path"]

        pickle_path = file_path.replace(".graphml", ".pickle")
        if os.path.exists(pickle_path):
            import pickle
            with open(pickle_path, "rb") as f:
                G = pickle.load(f)
        else:
            G = ox.load_graphml(file_path)
            try:
                import pickle
                with open(pickle_path, "wb") as f:
                    pickle.dump(G, f, protocol=pickle.HIGHEST_PROTOCOL)
            except Exception:
                pass

        with self._lock:
            self._graphs[network_id] = G
        return G

    def get_effective_view(self, network_id: str, scenario_id: Optional[str] = None) -> EffectiveGraphView:
        """
        Create a dynamic scenario view without mutating the base graph.
        """
        base_g = self.get_base_graph(network_id)
        return EffectiveGraphView(base_g, scenario_id)

    def get_network_geojson(self, network_id: str, scenario_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Export network edges as a GeoJSON FeatureCollection for MapLibre layer rendering.
        Includes state (OPEN, BLOCKED, HIGH_RISK, RESTRICTED) from the active scenario.
        """
        base_g = self.get_base_graph(network_id)
        view = EffectiveGraphView(base_g, scenario_id)

        features: List[Dict[str, Any]] = []
        for u, v, k, data in base_g.edges(data=True, keys=True):
            u_node = base_g.nodes[u]
            v_node = base_g.nodes[v]
            coords = edge_geometry_to_coords(
                data,
                (float(u_node["x"]), float(u_node["y"])),
                (float(v_node["x"]), float(v_node["y"]))
            )

            state, reason = view.get_edge_state(u, v, k)
            penalty, is_restricted = view.get_edge_penalty(u, v, k)

            way_id = data.get("osmid")
            if isinstance(way_id, list):
                way_id = way_id[0] if way_id else None

            highway_raw = data.get("highway", "road")
            if isinstance(highway_raw, list):
                highway_raw = highway_raw[0] if highway_raw else "road"
            highway_str = str(highway_raw).lower()

            # Classify road hierarchy for distinct, high-clarity GIS map rendering
            if any(h in highway_str for h in ["motorway", "trunk", "primary"]):
                road_tier = "major"
            elif any(h in highway_str for h in ["secondary", "tertiary"]):
                road_tier = "secondary"
            elif any(h in highway_str for h in ["residential", "unclassified"]):
                road_tier = "residential"
            else:
                road_tier = "minor"  # service, living_street, alley, pathway, track, etc.

            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": coords,
                },
                "properties": {
                    "u": u,
                    "v": v,
                    "key": k,
                    "way_id": way_id,
                    "name": str(data.get("name", "Unnamed Road")),
                    "highway": highway_str,
                    "road_tier": road_tier,
                    "is_minor": (road_tier == "minor"),
                    "length_m": round(float(data.get("length", 0.0)), 1),
                    "oneway": bool(data.get("oneway", False)),
                    "state": state,
                    "closure_reason": reason,
                    "risk_penalty": penalty,
                },
            })

        return {
            "type": "FeatureCollection",
            "features": features,
        }

    def get_street_index(self, network_id: str) -> List[Dict[str, Any]]:
        """
        Return cached list of unique named streets in the network for instant autocomplete search (<1ms).
        """
        with self._lock:
            if network_id in self._street_indexes:
                return self._street_indexes[network_id]

        G = self.get_base_graph(network_id)
        streets_map: Dict[str, Dict[str, Any]] = {}

        for u, v, k, data in G.edges(keys=True, data=True):
            name = data.get("name")
            if not name or not isinstance(name, str) or len(name.strip()) < 2:
                continue

            name_clean = name.strip()
            name_key = name_clean.lower()

            if name_key not in streets_map:
                u_node = G.nodes[u]
                hw = data.get("highway", "residential")
                if isinstance(hw, list):
                    hw = hw[0]
                streets_map[name_key] = {
                    "name": name_clean,
                    "lat": float(u_node.get("y", 0.0)),
                    "lon": float(u_node.get("x", 0.0)),
                    "highway": str(hw),
                }

        street_list = list(streets_map.values())
        with self._lock:
            self._street_indexes[network_id] = street_list
        return street_list


graph_manager = GraphManager()

