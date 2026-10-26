import type {
  Hazard,
  NetworkMetadata,
  RoadOverride,
  RouteComparisonResponse,
  RouteResponse,
  RoutingAlgorithm,
  RoutingOptimization,
  Scenario,
} from './types';

const API_BASE = '/api';

export async function fetchNetworks(): Promise<NetworkMetadata[]> {
  const res = await fetch(`${API_BASE}/networks`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchNetwork(networkId: string): Promise<NetworkMetadata> {
  const res = await fetch(`${API_BASE}/networks/${networkId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function importNetwork(payload: {
  name: string;
  place_query?: string;
  bbox?: number[];
  point?: [number, number];
  distance_m?: number;
  network_type?: string;
}): Promise<NetworkMetadata> {
  const res = await fetch(`${API_BASE}/networks/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Import failed' }));
    throw new Error(err.detail || 'Import failed');
  }
  return res.json();
}

export async function fetchNetworkGeoJSON(
  networkId: string,
  scenarioId?: string | null,
): Promise<any> {
  const url = scenarioId
    ? `${API_BASE}/networks/${networkId}/geojson?scenario_id=${scenarioId}`
    : `${API_BASE}/networks/${networkId}/geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchScenarios(networkId: string): Promise<Scenario[]> {
  const res = await fetch(`${API_BASE}/scenarios?network_id=${networkId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createScenario(payload: {
  network_id: string;
  name: string;
  description?: string;
}): Promise<Scenario> {
  const res = await fetch(`${API_BASE}/scenarios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function activateScenario(scenarioId: string): Promise<Scenario> {
  const res = await fetch(`${API_BASE}/scenarios/${scenarioId}/activate`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function duplicateScenario(
  scenarioId: string,
  newName?: string,
): Promise<Scenario> {
  const url = newName
    ? `${API_BASE}/scenarios/${scenarioId}/duplicate?new_name=${encodeURIComponent(newName)}`
    : `${API_BASE}/scenarios/${scenarioId}/duplicate`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function resetScenario(scenarioId: string): Promise<Scenario> {
  const res = await fetch(`${API_BASE}/scenarios/${scenarioId}/reset`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteScenario(scenarioId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/scenarios/${scenarioId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to delete' }));
    throw new Error(err.detail || 'Failed to delete');
  }
}

export async function fetchClosures(scenarioId: string): Promise<RoadOverride[]> {
  const res = await fetch(`${API_BASE}/scenarios/${scenarioId}/closures`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchScenarioClosuresGeoJSON(scenarioId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/scenarios/${scenarioId}/closures/geojson`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function applyClosure(
  scenarioId: string,
  payload: {
    edge_u: number;
    edge_v: number;
    edge_key?: number;
    way_id?: number | null;
    scope: 'edge' | 'both_directions' | 'entire_way';
    state: 'OPEN' | 'RESTRICTED' | 'BLOCKED' | 'HIGH_RISK';
    closure_reason: string;
    risk_penalty?: number;
    notes?: string;
  },
): Promise<RoadOverride[]> {
  const res = await fetch(`${API_BASE}/scenarios/${scenarioId}/closures`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function removeClosure(
  scenarioId: string,
  overrideId: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/scenarios/${scenarioId}/closures/${overrideId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function bulkRemoveClosures(
  scenarioId: string,
  payload: { override_ids?: string[]; way_id?: number; all_closures?: boolean },
): Promise<{ reopened_count: number }> {
  const res = await fetch(`${API_BASE}/scenarios/${scenarioId}/closures/bulk-remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchHazards(scenarioId: string): Promise<Hazard[]> {
  const res = await fetch(`${API_BASE}/scenarios/${scenarioId}/hazards`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createHazard(
  scenarioId: string,
  payload: {
    name: string;
    hazard_type: string;
    severity: string;
    impact_mode: 'BLOCK_ALL' | 'HIGH_RISK' | 'RESTRICTED';
    risk_penalty?: number;
    geometry: any;
  },
): Promise<Hazard> {
  const res = await fetch(`${API_BASE}/scenarios/${scenarioId}/hazards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteHazard(
  scenarioId: string,
  hazardId: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/scenarios/${scenarioId}/hazards/${hazardId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function calculateRoute(payload: {
  network_id: string;
  scenario_id?: string | null;
  start_coords: [number, number];
  destination_coords: [number, number];
  algorithm: RoutingAlgorithm;
  optimization: RoutingOptimization;
  max_snap_distance_m?: number;
}): Promise<RouteResponse> {
  const sanitizedPayload = {
    network_id: String(payload.network_id),
    scenario_id: payload.scenario_id || undefined,
    start_coords: [Number(payload.start_coords?.[0]), Number(payload.start_coords?.[1])],
    destination_coords: [Number(payload.destination_coords?.[0]), Number(payload.destination_coords?.[1])],
    algorithm: payload.algorithm,
    optimization: payload.optimization,
    max_snap_distance_m: payload.max_snap_distance_m,
  };
  const res = await fetch(`${API_BASE}/routes/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sanitizedPayload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function compareRoutes(payload: {
  network_id: string;
  scenario_id?: string | null;
  start_coords: [number, number];
  destination_coords: [number, number];
  algorithm: RoutingAlgorithm;
  optimization: RoutingOptimization;
  max_snap_distance_m?: number;
}): Promise<RouteComparisonResponse> {
  const sanitizedPayload = {
    network_id: String(payload.network_id),
    scenario_id: payload.scenario_id || undefined,
    start_coords: [Number(payload.start_coords?.[0]), Number(payload.start_coords?.[1])],
    destination_coords: [Number(payload.destination_coords?.[0]), Number(payload.destination_coords?.[1])],
    algorithm: payload.algorithm,
    optimization: payload.optimization,
    max_snap_distance_m: payload.max_snap_distance_m,
  };
  const res = await fetch(`${API_BASE}/routes/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sanitizedPayload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchFacilities(params: {
  network_id?: string;
  category?: string;
  user_lat?: number;
  user_lon?: number;
}): Promise<{
  facilities: import('./types').EmergencyFacility[];
  geojson: any;
  total_count: number;
}> {
  const query = new URLSearchParams();
  if (params.network_id) query.append('network_id', params.network_id);
  if (params.category) query.append('category', params.category);
  if (params.user_lat !== undefined) query.append('user_lat', params.user_lat.toString());
  if (params.user_lon !== undefined) query.append('user_lon', params.user_lon.toString());

  const res = await fetch(`${API_BASE}/facilities?${query.toString()}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function importFacilities(networkId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/facilities/import?network_id=${encodeURIComponent(networkId)}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function searchPlaces(
  q: string,
  params?: {
    network_id?: string;
    lat?: number;
    lon?: number;
  },
): Promise<import('./types').SearchResultItem[]> {
  const query = new URLSearchParams({ q });
  if (params?.network_id) query.append('network_id', params.network_id);
  if (params?.lat !== undefined) query.append('lat', params.lat.toString());
  if (params?.lon !== undefined) query.append('lon', params.lon.toString());

  const res = await fetch(`${API_BASE}/search?${query.toString()}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
