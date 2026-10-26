export interface DeviceCoordinates {
  longitude: number;
  latitude: number;
  accuracy?: number;
  heading?: number | null;
  speed?: number | null;
}

export interface FlyToCommand {
  center: [number, number];
  zoom?: number;
  bbox?: number[] | null;
  id: number;
}

export type GeolocationStatus = 'idle' | 'requesting' | 'acquired' | 'failed';

export interface LocationState {
  coordinates: DeviceCoordinates | null;
  status: GeolocationStatus;
  errorMessage: string | null;
}

export interface NetworkMetadata {
  id: string;
  name: string;
  place_or_query?: string | null;
  bbox?: number[] | null;
  node_count: number;
  edge_count: number;
  created_at: string;
}

export interface Scenario {
  id: string;
  network_id: string;
  name: string;
  description?: string;
  version: number;
  is_active: boolean;
  road_overrides_count: number;
  hazards_count: number;
  created_at: string;
  updated_at: string;
}

export interface RoadOverride {
  id: string;
  scenario_id: string;
  edge_u: number;
  edge_v: number;
  edge_key: number;
  way_id?: number | null;
  state: 'OPEN' | 'RESTRICTED' | 'BLOCKED' | 'HIGH_RISK' | 'UNKNOWN';
  closure_reason: string;
  risk_penalty: number;
  notes?: string | null;
  created_at: string;
}

export interface Hazard {
  id: string;
  scenario_id: string;
  name: string;
  hazard_type: string;
  severity: string;
  impact_mode: 'BLOCK_ALL' | 'HIGH_RISK' | 'RESTRICTED';
  risk_penalty: number;
  geometry: {
    type: string;
    coordinates?: any;
    center?: [number, number];
    radius_m?: number;
  };
  affected_edges_count: number;
  created_at: string;
}

export interface SnappedPoint {
  original_coords: [number, number];
  snapped_coords: [number, number];
  node_id: number;
  distance_m: number;
  accessible: boolean;
}

export interface EdgeDetail {
  u: number;
  v: number;
  key: number;
  way_id?: number | null;
  name?: string | null;
  highway?: string | null;
  length_m: number;
  travel_time_s?: number | null;
  oneway: boolean;
  state: string;
  closure_reason?: string | null;
}

export interface ManeuverInstruction {
  step_index: number;
  instruction: string;
  turn_type:
    | 'start'
    | 'straight'
    | 'slight_right'
    | 'turn_right'
    | 'sharp_right'
    | 'slight_left'
    | 'turn_left'
    | 'sharp_left'
    | 'uturn'
    | 'arrive';
  road_name: string;
  distance_m: number;
  duration_s: number;
  point: [number, number];
}

export interface RouteResponse {
  status: 'success' | 'no_path_found' | 'inaccessible_start' | 'inaccessible_target' | 'error';
  message: string;
  algorithm: string;
  optimization: string;
  total_distance_m: number;
  total_travel_time_s?: number | null;
  visited_nodes_count: number;
  execution_time_ms: number;
  path_nodes: number[];
  path_edges: EdgeDetail[];
  geometry?: {
    type: string;
    coordinates: number[][];
  } | null;
  snapped_start?: SnappedPoint | null;
  snapped_destination?: SnappedPoint | null;
  instructions?: ManeuverInstruction[];
}

export interface EmergencyFacility {
  id: string;
  network_id: string;
  osm_id: number;
  name: string;
  category: 'hospital' | 'fire_station' | 'police' | 'shelter' | 'warehouse';
  subcategory?: string;
  lat: number;
  lon: number;
  address?: string | null;
  phone?: string | null;
  distance_m?: number | null;
}

export interface SearchResultItem {
  id: string;
  name: string;
  category: string;
  type: string;
  location_context: string;
  lat: number;
  lon: number;
  distance_m?: number | null;
  is_facility: boolean;
}

export interface RouteComparisonResponse {
  baseline_route?: RouteResponse | null;
  scenario_route?: RouteResponse | null;
  is_rerouted: boolean;
  original_route_valid: boolean;
  distance_difference_m: number;
  percentage_increase: number;
  travel_time_difference_s?: number | null;
  summary: string;
}

export interface SelectedRoadInfo {
  u: number;
  v: number;
  key: number;
  way_id?: number | null;
  name?: string | null;
  highway?: string | null;
  length_m: number;
  state: string;
  closure_reason?: string | null;
  risk_penalty: number;
}

export type RoutingAlgorithm = 'dijkstra' | 'astar' | 'bfs';
export type RoutingOptimization = 'distance' | 'time';
export type AppMode = 'routing' | 'disaster';
export type ClickAction = 'none' | 'set_start' | 'set_dest' | 'add_hazard';
export type ActivePanelTab = 'navigate' | 'facilities' | 'simulation' | 'closures' | 'hazards' | 'none';
