from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


class NetworkImportRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    place_query: Optional[str] = None
    bbox: Optional[List[float]] = None  # [min_lon, min_lat, max_lon, max_lat]
    point: Optional[List[float]] = None  # [lat, lon]
    distance_m: Optional[float] = 1500.0
    network_type: str = "drive"


class NetworkMetadata(BaseModel):
    id: str
    name: str
    place_or_query: Optional[str] = None
    bbox: Optional[List[float]] = None
    node_count: int
    edge_count: int
    created_at: str


class SnappedPoint(BaseModel):
    original_coords: List[float]  # [lon, lat]
    snapped_coords: List[float]  # [lon, lat]
    node_id: int
    distance_m: float
    accessible: bool


class EdgeDetail(BaseModel):
    u: int
    v: int
    key: int = 0
    way_id: Optional[int] = None
    name: Optional[str] = None
    highway: Optional[str] = None
    length_m: float
    travel_time_s: Optional[float] = None
    oneway: bool = False
    state: str = "OPEN"
    closure_reason: Optional[str] = None


class RouteRequest(BaseModel):
    network_id: str
    scenario_id: Optional[str] = None
    start_coords: List[float]  # [lon, lat]
    destination_coords: List[float]  # [lon, lat]
    algorithm: str = "dijkstra"  # "dijkstra", "astar", "bfs"
    optimization: str = "distance"  # "distance", "time"
    max_snap_distance_m: float = 1500.0

    @field_validator("algorithm")
    @classmethod
    def validate_algorithm(cls, v: str) -> str:
        v_clean = v.strip().lower()
        if v_clean == "dfs":
            raise ValueError("Algorithm 'dfs' has been removed from ResQ. Supported algorithms: 'dijkstra', 'astar', 'bfs'")
        if v_clean not in {"dijkstra", "astar", "bfs"}:
            raise ValueError(f"Unknown algorithm '{v}'. Supported algorithms: 'dijkstra', 'astar', 'bfs'")
        return v_clean


class ManeuverInstruction(BaseModel):
    step_index: int
    instruction: str
    turn_type: str
    road_name: str
    distance_m: float
    duration_s: float
    point: List[float]  # [lon, lat]


class RouteResponse(BaseModel):
    status: str  # "success", "no_path_found", "inaccessible_start", "inaccessible_target", "error"
    message: str
    algorithm: str
    optimization: str
    total_distance_m: float = 0.0
    total_travel_time_s: Optional[float] = None
    visited_nodes_count: int = 0
    execution_time_ms: float = 0.0
    path_nodes: List[int] = []
    path_edges: List[EdgeDetail] = []
    geometry: Optional[Dict[str, Any]] = None  # GeoJSON LineString
    snapped_start: Optional[SnappedPoint] = None
    snapped_destination: Optional[SnappedPoint] = None
    instructions: List[ManeuverInstruction] = []


class RouteComparisonResponse(BaseModel):
    baseline_route: Optional[RouteResponse] = None
    scenario_route: Optional[RouteResponse] = None
    is_rerouted: bool = False
    original_route_valid: bool = True
    distance_difference_m: float = 0.0
    percentage_increase: float = 0.0
    travel_time_difference_s: Optional[float] = None
    summary: str = ""


class ScenarioCreate(BaseModel):
    network_id: str
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = ""


class ScenarioUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ScenarioResponse(BaseModel):
    id: str
    network_id: str
    name: str
    description: Optional[str] = ""
    version: int = 1
    is_active: bool = False
    road_overrides_count: int = 0
    hazards_count: int = 0
    created_at: str
    updated_at: str


class RoadOverrideCreate(BaseModel):
    edge_u: int
    edge_v: int
    edge_key: int = 0
    way_id: Optional[int] = None
    scope: str = "edge"  # "edge", "both_directions", "entire_way"
    state: str = "BLOCKED"  # "OPEN", "RESTRICTED", "BLOCKED", "HIGH_RISK", "UNKNOWN"
    closure_reason: str = "flooding"  # "flooding", "landslide", "structural_damage", "debris", "fire", "access_restriction", "other", "none"
    risk_penalty: float = 2.0
    notes: Optional[str] = None


class RoadOverrideResponse(BaseModel):
    id: str
    scenario_id: str
    edge_u: int
    edge_v: int
    edge_key: int
    way_id: Optional[int] = None
    state: str
    closure_reason: str
    risk_penalty: float
    notes: Optional[str] = None
    created_at: str


class BulkRemoveClosuresRequest(BaseModel):
    override_ids: Optional[List[str]] = None
    way_id: Optional[int] = None
    all_closures: bool = False


class HazardCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    hazard_type: str = "flood"  # "wildfire", "flood", "chemical_spill", "earthquake_damage", "storm_surge", "debris_zone"
    severity: str = "critical"  # "critical", "high", "moderate", "low"
    impact_mode: str = "BLOCK_ALL"  # "BLOCK_ALL", "HIGH_RISK", "RESTRICTED"
    risk_penalty: float = 5.0
    geometry: Dict[str, Any]  # GeoJSON Polygon or Circle dict {type: "Circle", center: [lon, lat], radius_m: 200}


class HazardResponse(BaseModel):
    id: str
    scenario_id: str
    name: str
    hazard_type: str
    severity: str
    impact_mode: str
    risk_penalty: float
    geometry: Dict[str, Any]
    affected_edges_count: int = 0
    affected_nodes_count: int = 0
    created_at: str

