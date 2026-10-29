import React, { useMemo, useState } from 'react';
import type {
  ActivePanelTab,
  ClickAction,
  EmergencyFacility,
  Hazard,
  RoadOverride,
  RouteComparisonResponse,
  RouteResponse,
  RoutingAlgorithm,
  RoutingOptimization,
  Scenario,
  SelectedRoadInfo,
} from '../types';

interface ContextPanelsProps {
  activeTab: ActivePanelTab;
  onClose: () => void;
  isSidebarOpen?: boolean;

  // Navigate props
  startCoords: [number, number] | null;
  destCoords: [number, number] | null;
  clickAction: ClickAction;
  onClickActionChange: (action: ClickAction) => void;
  onUseLiveLocationAsStart: () => void;
  onSwapPoints: () => void;
  onClearPoints: () => void;
  algorithm: RoutingAlgorithm;
  onAlgorithmChange: (algo: RoutingAlgorithm) => void;
  optimization: RoutingOptimization;
  onOptimizationChange: (opt: RoutingOptimization) => void;
  onCalculateRoute: () => void;
  isCalculating: boolean;
  routeResult: RouteResponse | null;
  routeComparison: RouteComparisonResponse | null;
  destinationName?: string;
  onStartJourney: () => void;
  isNavigating: boolean;

  // Emergency Facilities props
  facilities: EmergencyFacility[];
  selectedCategoryFilter: string | null;
  onSelectCategoryFilter: (category: string | null) => void;
  onRouteToFacility: (facility: EmergencyFacility) => void;
  isLoadingFacilities: boolean;

  // Disaster Simulation props
  appMode: 'routing' | 'disaster';
  onAppModeToggle: () => void;
  scenarios: Scenario[];
  activeScenario: Scenario | null;
  onSelectScenario: (scenarioId: string) => void;
  onCreateScenario: (name: string) => Promise<void>;
  onDuplicateScenario: (scenarioId: string) => Promise<void>;
  onResetScenario: (scenarioId: string) => Promise<void>;
  onDeleteScenario: (scenarioId: string) => Promise<void>;
  selectedRoad: SelectedRoadInfo | null;
  onApplyRoadCondition: (params: {
    edge_u: number;
    edge_v: number;
    edge_key: number;
    way_id?: number | null;
    scope: 'edge' | 'both_directions' | 'entire_way';
    state: 'OPEN' | 'RESTRICTED' | 'BLOCKED' | 'HIGH_RISK';
    closure_reason: string;
    risk_penalty: number;
  }) => Promise<void>;

  // Closures props
  closures: RoadOverride[];
  onReopenRoad: (overrideId: string) => Promise<void>;
  onReopenRoadGroup?: (overrideIds: string[]) => Promise<void>;
  onReopenAllRoads?: () => Promise<void>;

  // Hazards props
  hazards: Hazard[];
  onOpenAddHazard: () => void;
  onDeleteHazard: (hazardId: string) => Promise<void>;
}

export const ContextPanels: React.FC<ContextPanelsProps> = ({
  activeTab,
  onClose,
  isSidebarOpen = true,
  startCoords,
  destCoords,
  clickAction,
  onClickActionChange,
  onUseLiveLocationAsStart,
  onSwapPoints,
  onClearPoints,
  algorithm,
  onAlgorithmChange,
  optimization,
  onOptimizationChange,
  onCalculateRoute,
  isCalculating,
  routeResult,
  routeComparison,
  destinationName,
  onStartJourney,
  isNavigating,
  facilities,
  selectedCategoryFilter,
  onSelectCategoryFilter,
  onRouteToFacility,
  isLoadingFacilities,
  appMode,
  onAppModeToggle,
  scenarios,
  activeScenario,
  onSelectScenario,
  onCreateScenario,
  onDuplicateScenario,
  onResetScenario,
  onDeleteScenario,
  selectedRoad,
  onApplyRoadCondition,
  closures,
  hazards,
  onReopenRoad,
  onReopenRoadGroup,
  onReopenAllRoads,
  onOpenAddHazard,
  onDeleteHazard,
}) => {
  // Road condition form state for simulation tab
  const [closureScope, setClosureScope] = useState<'edge' | 'both_directions' | 'entire_way'>('both_directions');
  const [closureState, setClosureState] = useState<'OPEN' | 'RESTRICTED' | 'BLOCKED' | 'HIGH_RISK'>('BLOCKED');
  const [closureReason, setClosureReason] = useState<string>('flooding');
  const [riskPenalty, setRiskPenalty] = useState<number>(3.0);
  const [isApplyingCondition, setIsApplyingCondition] = useState<boolean>(false);

  // New scenario state
  const [newScenarioName, setNewScenarioName] = useState<string>('');
  const [showNewScenarioRow, setShowNewScenarioRow] = useState<boolean>(false);
  const [showInstructionsList, setShowInstructionsList] = useState<boolean>(true);

  // Facility category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      hospital: 0,
      fire_station: 0,
      police: 0,
      shelter: 0,
      warehouse: 0,
    };
    for (const f of facilities) {
      if (counts[f.category] !== undefined) {
        counts[f.category]++;
      }
    }
    return counts;
  }, [facilities]);

  const filteredFacilities = useMemo(() => {
    if (!selectedCategoryFilter) return facilities;
    return facilities.filter((f) => f.category === selectedCategoryFilter);
  }, [facilities, selectedCategoryFilter]);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'hospital':
        return '🏥';
      case 'fire_station':
        return '🚒';
      case 'police':
        return '🚓';
      case 'shelter':
        return '⛺';
      case 'warehouse':
        return '📦';
      default:
        return '📍';
    }
  };

  const handleApplyConditionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoad) return;
    setIsApplyingCondition(true);
    try {
      await onApplyRoadCondition({
        edge_u: selectedRoad.u,
        edge_v: selectedRoad.v,
        edge_key: selectedRoad.key,
        way_id: selectedRoad.way_id,
        scope: closureScope,
        state: closureState,
        closure_reason: closureState === 'OPEN' ? 'none' : closureReason,
        risk_penalty: closureState === 'HIGH_RISK' ? riskPenalty : 1.0,
        notes: selectedRoad.name || undefined,
      } as any);
    } finally {
      setIsApplyingCondition(false);
    }
  };

  // Group multiple raw directed segment overrides by road name or way_id into a single closure item
  const groupedClosures = useMemo(() => {
    const groupsMap = new Map<
      string,
      {
        groupKey: string;
        roadName: string;
        wayId?: number | null;
        state: 'OPEN' | 'RESTRICTED' | 'BLOCKED' | 'HIGH_RISK' | 'UNKNOWN';
        closureReason: string;
        riskPenalty: number;
        segmentCount: number;
        overrideIds: string[];
        createdAt: string;
      }
    >();

    for (const c of closures) {
      const validNotes = c.notes && c.notes.trim() && c.notes !== 'undefined' && c.notes !== 'nan';
      const key = c.way_id
        ? `way_${c.way_id}`
        : validNotes
        ? `name_${c.notes!.trim().toLowerCase()}`
        : `edge_${Math.min(c.edge_u, c.edge_v)}_${Math.max(c.edge_u, c.edge_v)}`;

      const roadName = validNotes
        ? c.notes!.trim()
        : c.way_id
        ? `Road (OSM Way #${c.way_id})`
        : `Road Segment (${c.edge_u} ↔ ${c.edge_v})`;

      const existing = groupsMap.get(key);
      if (!existing) {
        groupsMap.set(key, {
          groupKey: key,
          roadName,
          wayId: c.way_id,
          state: c.state,
          closureReason: c.closure_reason,
          riskPenalty: c.risk_penalty,
          segmentCount: 1,
          overrideIds: [c.id],
          createdAt: c.created_at,
        });
      } else {
        existing.overrideIds.push(c.id);
        existing.segmentCount++;
        if (c.state === 'BLOCKED') existing.state = 'BLOCKED';
      }
    }

    return Array.from(groupsMap.values());
  }, [closures]);

  const handleCreateScenarioSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScenarioName.trim()) return;
    await onCreateScenario(newScenarioName.trim());
    setNewScenarioName('');
    setShowNewScenarioRow(false);
  };

  if (activeTab === 'none') {
    return null;
  }

  return (
    <div className={`floating-context-panel ${!isSidebarOpen ? 'sidebar-hidden' : ''}`}>
      {/* Panel Top Header */}
      <div className="panel-top-bar">
        <div className="panel-tab-title">
          {activeTab === 'navigate' && '🧭 Navigate & Directions'}
          {activeTab === 'facilities' && `🏥 Emergency Facilities (${facilities.length})`}
          {activeTab === 'simulation' && '⚠️ Disaster Road Simulation'}
          {activeTab === 'closures' && `🚧 Road Closures (${groupedClosures.length})`}
          {activeTab === 'hazards' && `🔴 Hazard Zones (${hazards.length})`}
        </div>
        <button
          type="button"
          className="panel-close-x-btn"
          onClick={onClose}
          title="Close Panel"
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>

      <div className="panel-scroll-content">
        {/* ========================================================= */}
        {/* TAB 1: NAVIGATE & ROUTE PLANNING                          */}
        {/* ========================================================= */}
        {activeTab === 'navigate' && (
          <div className="panel-section-group">
            {/* Google Maps Style A/B Direction Inputs */}
            <div className="google-directions-box">
              <div className="directions-dot-track">
                <span className="dot-start" title="Origin" />
                <span className="dot-line" />
                <span className="dot-dest" title="Destination" />
              </div>

              <div className="directions-inputs-column">
                {/* Start input row (Live location by default) */}
                <div className={`dir-input-row ${clickAction === 'set_start' ? 'picking-active' : ''}`}>
                  <input
                    type="text"
                    readOnly
                    className="dir-text-input"
                    value={
                      startCoords
                        ? `Live Location (${startCoords[1].toFixed(4)}°, ${startCoords[0].toFixed(4)}°)`
                        : 'Detecting live location...'
                    }
                    title="Origin: Live device location"
                  />
                  <button
                    type="button"
                    className={`dir-point-btn ${clickAction === 'set_start' ? 'picking' : ''}`}
                    onClick={() =>
                      onClickActionChange(clickAction === 'set_start' ? 'none' : 'set_start')
                    }
                    title={clickAction === 'set_start' ? 'Cancel map picking' : 'Pick start point on map'}
                    aria-label="Pick start on map"
                  >
                    <svg viewBox="0 0 24 24" className="btn-svg-icon" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="10" r="3" />
                      <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z" />
                    </svg>
                  </button>
                </div>

                {/* Destination input row */}
                <div className={`dir-input-row ${clickAction === 'set_dest' ? 'picking-active' : ''}`}>
                  <input
                    type="text"
                    readOnly
                    className="dir-text-input clickable-dest-input"
                    value={
                      destinationName
                        ? destinationName
                        : destCoords
                        ? `Destination: (${destCoords[1].toFixed(4)}°, ${destCoords[0].toFixed(4)}°)`
                        : ''
                    }
                    placeholder="Search place above or click map..."
                    onClick={() => {
                      const topInput = document.querySelector<HTMLInputElement>('.search-input');
                      if (topInput) {
                        topInput.focus();
                        topInput.select();
                      }
                    }}
                    title="Click to search in top search bar"
                  />
                  <button
                    type="button"
                    className={`dir-point-btn ${clickAction === 'set_dest' ? 'picking' : ''}`}
                    onClick={() =>
                      onClickActionChange(clickAction === 'set_dest' ? 'none' : 'set_dest')
                    }
                    title={clickAction === 'set_dest' ? 'Cancel map picking' : 'Select destination on map'}
                    aria-label="Pick destination on map"
                  >
                    <svg viewBox="0 0 24 24" className="btn-svg-icon" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="8" />
                      <circle cx="12" cy="12" r="3" />
                      <line x1="12" y1="2" x2="12" y2="4" />
                      <line x1="12" y1="20" x2="12" y2="22" />
                      <line x1="2" y1="12" x2="4" y2="12" />
                      <line x1="20" y1="12" x2="22" y2="12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Swap points button */}
              <button
                type="button"
                className="directions-swap-btn"
                onClick={onSwapPoints}
                title="Reverse Start and Destination"
                aria-label="Reverse direction"
              >
                <svg viewBox="0 0 24 24" className="swap-svg-icon" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M7 16V4m0 0L3 8m4-4l4 4m10 4v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </button>
            </div>

            {/* Quick action bar */}
            <div className="dir-sub-actions">
              <button
                type="button"
                className="dir-sub-btn link-btn"
                onClick={onUseLiveLocationAsStart}
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="4" />
                  <line x1="12" y1="2" x2="12" y2="6" />
                  <line x1="12" y1="18" x2="12" y2="22" />
                  <line x1="2" y1="12" x2="6" y2="12" />
                  <line x1="18" y1="12" x2="22" y2="12" />
                </svg>
                Reset to Live Location
              </button>
              {(startCoords || destCoords || routeResult) && (
                <button
                  type="button"
                  className="dir-sub-btn link-btn text-muted"
                  onClick={onClearPoints}
                >
                  Clear Route
                </button>
              )}
            </div>

            {/* Route Preference Selector (Professional, user-friendly labels) */}
            <div className="form-sub-block">
              <label className="field-label">ROUTE PREFERENCE</label>
              <div className="algorithm-chips-grid">
                {[
                  { id: 'dijkstra', title: 'Recommended', badge: 'Best', desc: 'Optimal balanced route', icon: '⚡' },
                  { id: 'astar', title: 'Fastest Route', badge: 'Express', desc: 'Shortest travel time', icon: '🎯' },
                  { id: 'bfs', title: 'Simpler Turns', badge: 'Direct', desc: 'Fewer intersections', icon: '🔄' },
                ].map((algo) => (
                  <button
                    key={algo.id}
                    type="button"
                    className={`algo-card-btn ${algorithm === algo.id ? 'selected' : ''}`}
                    onClick={() => onAlgorithmChange(algo.id as RoutingAlgorithm)}
                    title={algo.desc}
                  >
                    <div className="algo-card-top-row">
                      <span className="algo-icon">{algo.icon}</span>
                      <span className="algo-title">{algo.title}</span>
                    </div>
                    <div className="algo-card-badge-row">
                      <span className="algo-badge">{algo.badge}</span>
                    </div>
                    <span className="algo-subtitle">{algo.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Optimization Selector */}
            <div className="form-sub-block">
              <label className="field-label">ROUTE PRIORITY</label>
              <div className="toggle-segment-group">
                <button
                  type="button"
                  className={`segment-btn ${optimization === 'distance' ? 'active' : ''}`}
                  onClick={() => onOptimizationChange('distance')}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.3 15.3l-6.6-6.6a2 2 0 00-2.8 0L2.7 17.9a2 2 0 000 2.8l.6.6a2 2 0 002.8 0l9.2-9.2" />
                  </svg>
                  Shortest Distance
                </button>
                <button
                  type="button"
                  className={`segment-btn ${optimization === 'time' ? 'active' : ''}`}
                  onClick={() => onOptimizationChange('time')}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="13" r="8" />
                    <path d="M12 9v4l2.5 2.5M10 2h4" />
                  </svg>
                  Fastest Travel Time
                </button>
              </div>
            </div>

            {/* Calculate / Recalculate Button */}
            <button
              type="button"
              className="primary-google-btn"
              disabled={isCalculating || !destCoords}
              onClick={() => onCalculateRoute()}
            >
              {isCalculating ? (
                <span className="btn-loading-flex">
                  <span className="mini-spinner" /> Computing Optimal Route...
                </span>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" className="calc-btn-svg" fill="currentColor">
                    <path d="M21.71 11.29l-9-9a1 1 0 00-1.42 0l-9 9a1 1 0 000 1.42l9 9a1 1 0 001.42 0l9-9a1 1 0 000-1.42zM14 14.5V12h-4v3H8v-4a1 1 0 011-1h5V7.5l3.5 3.5-3.5 3.5z" />
                  </svg>
                  <span>{destCoords ? 'Calculate Route' : 'Select Destination on Map'}</span>
                </>
              )}
            </button>

            {/* Route Calculation Result Card */}
            {routeResult && (
              <div className="route-result-container">
                {routeResult.status === 'success' ? (
                  <>
                    {/* Primary Google Maps Navigation Action */}
                    <div className="nav-start-action-box">
                      <button
                        type="button"
                        className={`start-journey-btn ${isNavigating ? 'active' : ''}`}
                        onClick={onStartJourney}
                      >
                        {isNavigating ? '🧭 Resume Navigation HUD' : '🚀 Start Journey'}
                      </button>
                    </div>

                    {/* Integrated Detour Comparison Banner if scenario causes reroute */}
                    {routeComparison && routeComparison.is_rerouted && (
                      <div className="detour-alert-box">
                        <div className="detour-alert-title">
                          ⚠️ Disaster Scenario Rerouted Route
                        </div>
                        <div className="detour-alert-detail">
                          Detour: +{(routeComparison.distance_difference_m / 1000).toFixed(2)} km
                          ({routeComparison.percentage_increase.toFixed(1)}% longer) to safely avoid road closures.
                        </div>
                      </div>
                    )}

                    {/* 4-Cell Metric Grid (Professional consumer metrics) */}
                    <div className="metric-grid-4">
                      <div className="metric-cell">
                        <div className="metric-val">
                          {routeResult.total_distance_m < 1000
                            ? `${Math.round(routeResult.total_distance_m)} m`
                            : `${(routeResult.total_distance_m / 1000).toFixed(2)} km`}
                        </div>
                        <div className="metric-label">DISTANCE</div>
                      </div>
                      <div className="metric-cell">
                        <div className="metric-val">
                          {routeResult.total_travel_time_s
                            ? `${Math.round(routeResult.total_travel_time_s / 60)} min`
                            : `${Math.round(routeResult.total_distance_m / (30 * 1000 / 60))} min`}
                        </div>
                        <div className="metric-label">EST. TIME</div>
                      </div>
                      <div className="metric-cell">
                        <div className="metric-val">
                          {routeResult.instructions ? `${routeResult.instructions.length} steps` : 'Direct'}
                        </div>
                        <div className="metric-label">MANEUVERS</div>
                      </div>
                      <div className="metric-cell">
                        <div className="metric-val" style={{ color: routeComparison?.is_rerouted ? '#d97706' : '#16a34a' }}>
                          {routeComparison?.is_rerouted ? '⚠️ Rerouted' : '🟢 Clear Path'}
                        </div>
                        <div className="metric-label">SAFETY STATUS</div>
                      </div>
                    </div>

                    {/* Turn-by-Turn Maneuvers List */}
                    {routeResult.instructions && routeResult.instructions.length > 0 && (
                      <div className="instructions-section">
                        <div
                          className="instructions-toggle-header"
                          onClick={() => setShowInstructionsList(!showInstructionsList)}
                        >
                          <span className="inst-title">
                            Turn-by-Turn Directions ({routeResult.instructions.length} steps)
                          </span>
                          <span className="inst-caret">{showInstructionsList ? '▲' : '▼'}</span>
                        </div>

                        {showInstructionsList && (
                          <div className="instructions-list">
                            {routeResult.instructions.map((step) => (
                              <div key={step.step_index} className="instruction-step-row">
                                <div className="step-num">{step.step_index}</div>
                                <div className="step-info">
                                  <div className="step-text">{step.instruction}</div>
                                  {step.distance_m > 0 && (
                                    <div className="step-dist">
                                      {step.distance_m < 1000
                                        ? `${Math.round(step.distance_m)} m`
                                        : `${(step.distance_m / 1000).toFixed(1)} km`}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="route-error-box">
                    <div className="route-error-icon">⚠️</div>
                    <div className="route-error-title">No Route Available</div>
                    <div className="route-error-msg">{routeResult.message}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: EMERGENCY FACILITIES                               */}
        {/* ========================================================= */}
        {activeTab === 'facilities' && (
          <div className="panel-section-group">
            <p className="section-intro-text">
              Real OpenStreetMap emergency facilities discovered in the active coverage area.
            </p>

            {/* Category Filter Pills */}
            <div className="facilities-filter-chips">
              <button
                type="button"
                className={`filter-chip ${selectedCategoryFilter === null ? 'active' : ''}`}
                onClick={() => onSelectCategoryFilter(null)}
              >
                All ({facilities.length})
              </button>
              <button
                type="button"
                className={`filter-chip ${selectedCategoryFilter === 'hospital' ? 'active' : ''}`}
                onClick={() => onSelectCategoryFilter('hospital')}
              >
                🏥 Hospitals ({categoryCounts.hospital})
              </button>
              <button
                type="button"
                className={`filter-chip ${selectedCategoryFilter === 'fire_station' ? 'active' : ''}`}
                onClick={() => onSelectCategoryFilter('fire_station')}
              >
                🚒 Fire Stations ({categoryCounts.fire_station})
              </button>
              <button
                type="button"
                className={`filter-chip ${selectedCategoryFilter === 'police' ? 'active' : ''}`}
                onClick={() => onSelectCategoryFilter('police')}
              >
                🚓 Police ({categoryCounts.police})
              </button>
              <button
                type="button"
                className={`filter-chip ${selectedCategoryFilter === 'shelter' ? 'active' : ''}`}
                onClick={() => onSelectCategoryFilter('shelter')}
              >
                ⛺ Shelters ({categoryCounts.shelter})
              </button>
              <button
                type="button"
                className={`filter-chip ${selectedCategoryFilter === 'warehouse' ? 'active' : ''}`}
                onClick={() => onSelectCategoryFilter('warehouse')}
              >
                📦 Warehouses ({categoryCounts.warehouse})
              </button>
            </div>

            {/* Facilities List */}
            {isLoadingFacilities ? (
              <div className="loading-state-box">Loading emergency facilities...</div>
            ) : filteredFacilities.length > 0 ? (
              <div className="facilities-list-group">
                {filteredFacilities.map((fac) => (
                  <div key={fac.id} className="facility-card">
                    <div className="facility-card-top">
                      <span className="fac-icon">{getCategoryIcon(fac.category)}</span>
                      <div className="fac-details">
                        <div className="fac-name">{fac.name}</div>
                        <div className="fac-badge-row">
                          <span className={`fac-cat-tag ${fac.category}`}>
                            {fac.category.replace('_', ' ').toUpperCase()}
                          </span>
                          {fac.distance_m !== undefined && fac.distance_m !== null && (
                            <span className="fac-dist-tag">
                              {fac.distance_m < 1000
                                ? `${Math.round(fac.distance_m)} m away`
                                : `${(fac.distance_m / 1000).toFixed(1)} km away`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {fac.address && <div className="fac-meta-line">📍 {fac.address}</div>}
                    {fac.phone && <div className="fac-meta-line">📞 {fac.phone}</div>}

                    <div className="fac-card-actions">
                      <button
                        type="button"
                        className="fac-route-btn"
                        onClick={() => onRouteToFacility(fac)}
                      >
                        🧭 Route to Facility
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state-card">
                <span className="empty-icon">📍</span>
                <div className="empty-title">
                  No {selectedCategoryFilter ? selectedCategoryFilter.replace('_', ' ') : 'emergency'} facilities found
                </div>
                <div className="empty-desc">
                  No genuine OSM {selectedCategoryFilter || 'facilities'} are located within the active road network boundary.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: DISASTER ROAD SIMULATION                           */}
        {/* ========================================================= */}
        {activeTab === 'simulation' && (
          <div className="panel-section-group">
            {/* Mode Switch Card */}
            <div className="sim-mode-toggle-box">
              <div className="sim-mode-left">
                <div className={`sim-hero-badge ${appMode === 'disaster' ? 'active' : ''}`}>
                  ⚠️
                </div>
                <div className="sim-mode-info">
                  <div className="sim-mode-title">Disaster Road Simulation</div>
                  <div className="sim-mode-desc">
                    {appMode === 'disaster'
                      ? 'Interactive mode active. Click any road on map to apply flood or disaster closures.'
                      : 'Simulation mode is off. Enable to inspect Pune & PCMC roads or simulate closures.'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className={`modern-toggle-switch ${appMode === 'disaster' ? 'checked' : ''}`}
                onClick={onAppModeToggle}
                title={appMode === 'disaster' ? 'Disable Simulation Mode' : 'Enable Simulation Mode'}
                aria-label="Toggle Disaster Simulation Mode"
              >
                <span className="toggle-switch-track">
                  <span className="toggle-switch-thumb" />
                </span>
                <span className="toggle-switch-status">
                  {appMode === 'disaster' ? 'ACTIVE' : 'OFF'}
                </span>
              </button>
            </div>

            {/* Active Scenario Selector */}
            <div className="panel-field-block">
              <div className="field-header-row">
                <label className="field-section-label">ACTIVE SCENARIO</label>
                <button
                  type="button"
                  className="new-scenario-btn"
                  onClick={() => setShowNewScenarioRow(!showNewScenarioRow)}
                >
                  <span className="plus-icon">+</span> New Scenario
                </button>
              </div>

              {showNewScenarioRow && (
                <form onSubmit={handleCreateScenarioSubmit} className="inline-add-row">
                  <input
                    type="text"
                    className="inline-text-input"
                    placeholder="Scenario name (e.g. Monsoon Flooding)..."
                    value={newScenarioName}
                    onChange={(e) => setNewScenarioName(e.target.value)}
                    autoFocus
                  />
                  <button type="submit" className="inline-action-btn primary">
                    Create
                  </button>
                  <button
                    type="button"
                    className="inline-action-btn text"
                    onClick={() => setShowNewScenarioRow(false)}
                  >
                    Cancel
                  </button>
                </form>
              )}

              <div className="custom-select-wrapper">
                <select
                  className="select-dropdown modern"
                  value={activeScenario?.id || ''}
                  onChange={(e) => onSelectScenario(e.target.value)}
                >
                  {scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.road_overrides_count} closures, {s.hazards_count} hazards)
                    </option>
                  ))}
                </select>
                <svg className="select-arrow-svg" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>

              {activeScenario && (
                <div className="scenario-quick-actions">
                  <button
                    type="button"
                    className="scenario-chip-btn"
                    onClick={() => onDuplicateScenario(activeScenario.id)}
                    title="Duplicate this scenario"
                  >
                    <svg className="chip-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="scenario-chip-btn amber"
                    onClick={() => onResetScenario(activeScenario.id)}
                    title="Clear all closures and hazards in this scenario"
                  >
                    <svg className="chip-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                    Reset Overrides
                  </button>
                  {scenarios.length > 1 && (
                    <button
                      type="button"
                      className="scenario-chip-btn red"
                      onClick={() => onDeleteScenario(activeScenario.id)}
                      title="Delete scenario"
                    >
                      <svg className="chip-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18m-2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Selected Road Condition Inspector */}
            <div className="panel-field-block">
              <label className="field-section-label">SELECTED ROAD SEGMENT</label>
              {selectedRoad ? (
                <form onSubmit={handleApplyConditionSubmit} className="road-inspector-card">
                  <div className="road-inspector-meta">
                    <div className="road-meta-header">
                      <div className="road-name-title">
                        {selectedRoad.name || 'Unnamed Road Segment'}
                      </div>
                      <span className={`road-state-badge ${selectedRoad.state.toLowerCase()}`}>
                        {selectedRoad.state}
                      </span>
                    </div>
                    <div className="road-attr-tags">
                      <span className="attr-tag highway">🛣️ {selectedRoad.highway || 'road'}</span>
                      <span className="attr-tag length">📏 {Math.round(selectedRoad.length_m)} m</span>
                      {selectedRoad.way_id && (
                        <span className="attr-tag way">OSM #{selectedRoad.way_id}</span>
                      )}
                    </div>
                  </div>

                  {/* Closure State Selector */}
                  <div className="inspector-field">
                    <label className="sub-field-label">Condition to Apply</label>
                    <div className="state-toggle-grid">
                      {(['BLOCKED', 'HIGH_RISK', 'RESTRICTED', 'OPEN'] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          className={`state-btn ${st.toLowerCase()} ${closureState === st ? 'selected' : ''}`}
                          onClick={() => setClosureState(st)}
                        >
                          <span className="state-icon">
                            {st === 'BLOCKED' ? '🚫' : st === 'HIGH_RISK' ? '⚠️' : st === 'RESTRICTED' ? '⛔' : '✅'}
                          </span>
                          <span className="state-label">
                            {st === 'BLOCKED'
                              ? 'Blocked (Closed)'
                              : st === 'HIGH_RISK'
                              ? 'High Risk (Penalize)'
                              : st === 'RESTRICTED'
                              ? 'Restricted Access'
                              : 'Reopen Road'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Scope Selector */}
                  <div className="inspector-field">
                    <label className="sub-field-label">Application Scope</label>
                    <div className="custom-select-wrapper">
                      <select
                        className="select-dropdown modern"
                        value={closureScope}
                        onChange={(e) => setClosureScope(e.target.value as any)}
                      >
                        <option value="both_directions">Both Directions (Bi-directional Closure)</option>
                        <option value="edge">This Direction Only (One-Way / Lane Specific)</option>
                        <option value="entire_way">Entire OSM Road (All Connected Segments)</option>
                      </select>
                      <svg className="select-arrow-svg" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  </div>

                  {/* Reason Dropdown (if not OPEN) */}
                  {closureState !== 'OPEN' && (
                    <div className="inspector-field">
                      <label className="sub-field-label">Disaster / Closure Reason</label>
                      <div className="custom-select-wrapper">
                        <select
                          className="select-dropdown modern"
                          value={closureReason}
                          onChange={(e) => setClosureReason(e.target.value)}
                        >
                          <option value="flooding">🌊 Flooding / Water Inundation</option>
                          <option value="structural_damage">🏚️ Structural Collapse / Bridge Failure</option>
                          <option value="debris">🚧 Debris / Tree Fall / Blockage</option>
                          <option value="fire">🔥 Active Fire / Smoke Hazard</option>
                          <option value="landslide">⛰️ Landslide / Debris Flow</option>
                          <option value="access_restriction">🛑 Emergency Access Only</option>
                          <option value="other">⚠️ Other Environmental Hazard</option>
                        </select>
                        <svg className="select-arrow-svg" viewBox="0 0 20 20" fill="currentColor">
                          <path
                            fillRule="evenodd"
                            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    </div>
                  )}

                  {/* Risk penalty slider if HIGH_RISK */}
                  {closureState === 'HIGH_RISK' && (
                    <div className="inspector-field">
                      <div className="slider-header-row">
                        <label className="sub-field-label">Risk Cost Penalty Multiplier</label>
                        <span className="slider-badge-val">{riskPenalty.toFixed(1)}x penalty</span>
                      </div>
                      <input
                        type="range"
                        min="1.5"
                        max="10.0"
                        step="0.5"
                        value={riskPenalty}
                        onChange={(e) => setRiskPenalty(parseFloat(e.target.value))}
                        className="modern-range-slider"
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    className="apply-condition-btn modern"
                    disabled={isApplyingCondition}
                  >
                    {isApplyingCondition ? (
                      <span className="btn-loading-flex">
                        <span className="mini-spinner" /> Updating Road Network...
                      </span>
                    ) : (
                      `Apply to ${closureScope === 'entire_way' ? 'Entire Way' : 'Road Segment'}`
                    )}
                  </button>
                </form>
              ) : (
                <div className="road-selection-prompt-card">
                  <div className="prompt-radar-wrapper">
                    <span className="prompt-radar-pulse" />
                    <span className="prompt-icon">🛣️</span>
                  </div>
                  <div className="prompt-content">
                    <div className="prompt-title">Interactive Road Selection</div>
                    <div className="prompt-desc">
                      Click any road segment on the Pune & PCMC map to inspect OSM data, check condition, or simulate disaster closures.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: ROAD CLOSURES LIST                                 */}
        {/* ========================================================= */}
        {activeTab === 'closures' && (
          <div className="panel-section-group">
            <p className="section-intro-text">
              Active road closures in scenario{' '}
              <strong>"{activeScenario?.name || 'Default'}"</strong>. Closed roads are strictly
              avoided in calculated routes.
            </p>

            {groupedClosures.length > 0 ? (
              <>
                <div className="closures-action-bar">
                  <div className="closures-summary-count">
                    <strong>{groupedClosures.length}</strong> closed road{groupedClosures.length > 1 ? 's' : ''}{' '}
                    <span className="segments-total">({closures.length} segments)</span>
                  </div>
                  {onReopenAllRoads && (
                    <button
                      type="button"
                      className="reopen-all-roads-btn"
                      onClick={() => onReopenAllRoads()}
                      title="Reopen all closed roads in this scenario"
                    >
                      ✓ Reopen All
                    </button>
                  )}
                </div>

                <div className="closures-list">
                  {groupedClosures.map((g) => (
                    <div key={g.groupKey} className="closure-card unified-road-closure">
                      <div className="closure-card-info">
                        <div className="closure-card-title-row">
                          <span className="closure-road-name" title={g.roadName}>
                            {g.roadName}
                          </span>
                          <span className={`status-pill ${g.state.toLowerCase()}`}>
                            {g.state === 'BLOCKED' ? 'BLOCKED' : g.state === 'HIGH_RISK' ? 'HIGH RISK' : g.state}
                          </span>
                        </div>
                        <div className="closure-reason-tag">
                          {g.closureReason === 'flooding'
                            ? '🌊 FLOODING / INUNDATION'
                            : g.closureReason === 'structural_damage'
                            ? '🏚️ STRUCTURAL COLLAPSE'
                            : g.closureReason === 'debris'
                            ? '🚧 DEBRIS BLOCKAGE'
                            : g.closureReason === 'fire'
                            ? '🔥 ACTIVE FIRE'
                            : g.closureReason === 'landslide'
                            ? '⛰️ LANDSLIDE'
                            : `⚠️ ${g.closureReason.replace('_', ' ').toUpperCase()}`}
                        </div>
                        <div className="closure-subtext">
                          <span className="segment-scope-pill">
                            {g.segmentCount > 1
                              ? `All Connected Segments (${g.segmentCount})`
                              : 'Single segment'}
                          </span>
                          {g.wayId && <span className="way-id-pill">OSM #{g.wayId}</span>}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="reopen-road-btn modern-reopen"
                        onClick={() => {
                          if (onReopenRoadGroup) {
                            onReopenRoadGroup(g.overrideIds);
                          } else {
                            Promise.all(g.overrideIds.map((id) => onReopenRoad(id)));
                          }
                        }}
                        title={`Reopen road (${g.segmentCount} segments)`}
                      >
                        ✓ Reopen Road
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-state-card">
                <span className="empty-icon">✅</span>
                <div className="empty-title">No Road Closures Active</div>
                <div className="empty-desc">
                  All roads in this scenario are open. Use Disaster Simulation mode to simulate road closures.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: HAZARD ZONES                                       */}
        {/* ========================================================= */}
        {activeTab === 'hazards' && (
          <div className="panel-section-group">
            <div className="hazards-action-bar">
              <button
                type="button"
                className={`action-btn-primary mark-map-btn ${clickAction === 'add_hazard' ? 'active-picking' : ''}`}
                onClick={() => onClickActionChange(clickAction === 'add_hazard' ? 'none' : 'add_hazard')}
                title="Click anywhere on the map to place hazard zone center"
              >
                <span className="action-icon">{clickAction === 'add_hazard' ? '🎯' : '📍'}</span>
                {clickAction === 'add_hazard' ? 'Click Map to Place...' : 'Mark Hazard on Map'}
              </button>
              <button
                type="button"
                className="action-btn-secondary"
                onClick={onOpenAddHazard}
                title="Open custom hazard definition form"
              >
                <span className="action-icon">+</span> Custom Form
              </button>
            </div>

            {hazards.length > 0 ? (
              <div className="hazards-list">
                {hazards.map((h) => (
                  <div key={h.id} className="hazard-card">
                    <div className="hazard-card-info">
                      <div className="hazard-name-title">🔴 {h.name}</div>
                      <div className="hazard-meta-row">
                        <span className={`hazard-badge ${h.severity.toLowerCase()}`}>
                          {h.severity}
                        </span>
                        <span className="hazard-type-tag">{h.hazard_type}</span>
                        <span className="hazard-impact-tag">{h.impact_mode}</span>
                      </div>
                      {h.geometry?.radius_m && (
                        <div className="hazard-radius-text">
                          Radius: {h.geometry.radius_m}m • {h.affected_edges_count} road segments affected
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="delete-hazard-btn"
                      onClick={() => onDeleteHazard(h.id)}
                      title="Remove hazard zone"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state-card">
                <span className="empty-icon">🛡️</span>
                <div className="empty-title">No Hazard Zones Defined</div>
                <div className="empty-desc">
                  Click <strong>"Mark Hazard on Map"</strong> or <strong>"+ Custom Form"</strong> to define environmental hazard perimeters (flood inundation, smoke zones) and reroute traffic around them.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
export default ContextPanels;
