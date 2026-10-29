import React, { useState } from 'react';
import type { SelectedRoadInfo } from '../types';

interface RoadConditionModalProps {
  road: SelectedRoadInfo;
  onApply: (params: {
    edge_u: number;
    edge_v: number;
    edge_key: number;
    way_id?: number | null;
    scope: 'edge' | 'both_directions' | 'entire_way';
    state: 'OPEN' | 'RESTRICTED' | 'BLOCKED' | 'HIGH_RISK';
    closure_reason: string;
    risk_penalty: number;
  }) => void;
  onClose: () => void;
  isApplying?: boolean;
}

export const RoadConditionModal: React.FC<RoadConditionModalProps> = ({
  road,
  onApply,
  onClose,
  isApplying = false,
}) => {
  const [scope, setScope] = useState<'edge' | 'both_directions' | 'entire_way'>('both_directions');
  const [state, setState] = useState<'OPEN' | 'RESTRICTED' | 'BLOCKED' | 'HIGH_RISK'>('BLOCKED');
  const [reason, setReason] = useState<string>('flooding');
  const [riskPenalty, setRiskPenalty] = useState<number>(3.0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isApplying) return;
    onApply({
      edge_u: road.u,
      edge_v: road.v,
      edge_key: road.key,
      way_id: road.way_id,
      scope,
      state,
      closure_reason: state === 'OPEN' ? 'reopened' : reason,
      risk_penalty: state === 'HIGH_RISK' ? riskPenalty : 1.0,
      notes: road.name || undefined,
    } as any);
  };

  const getStatusBadge = (currentState: string) => {
    switch (currentState) {
      case 'BLOCKED':
        return <span className="status-badge-chip badge-blocked">🔴 Blocked</span>;
      case 'HIGH_RISK':
        return <span className="status-badge-chip badge-risk">🟡 High Risk</span>;
      case 'RESTRICTED':
        return <span className="status-badge-chip badge-restricted">🟣 Restricted</span>;
      default:
        return <span className="status-badge-chip badge-open">🟢 Open</span>;
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="road-modal-title">
      <div className="modal-card road-condition-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="road-badge-row">
              <span className="road-badge">🛣️ Road Segment Inspector</span>
              {getStatusBadge(road.state)}
            </div>
            <h3 id="road-modal-title" className="modal-title">
              {road.name && road.name !== 'Unnamed Road' ? road.name : 'Unnamed Road Segment'}
            </h3>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Road Metadata Chips Strip */}
        <div className="road-meta-strip">
          <div className="meta-chip">
            <span className="meta-icon">🏷️</span>
            <span className="meta-label">OSM Way:</span>
            <strong className="meta-val">{road.way_id || 'N/A'}</strong>
          </div>
          <div className="meta-chip">
            <span className="meta-icon">📏</span>
            <span className="meta-label">Length:</span>
            <strong className="meta-val">{Math.round(road.length_m)} m</strong>
          </div>
          <div className="meta-chip">
            <span className="meta-icon">🚦</span>
            <span className="meta-label">Highway:</span>
            <strong className="meta-val">{road.highway || 'road'}</strong>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {/* Condition To Apply Cards */}
          <div className="form-group">
            <label className="form-label">
              <span>Select Condition to Apply</span>
              <span className="label-subtext">Updates routing and GIS overlays immediately</span>
            </label>

            <div className="condition-cards-grid">
              {/* Blocked Card */}
              <label className={`condition-card card-blocked ${state === 'BLOCKED' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="roadState"
                  value="BLOCKED"
                  checked={state === 'BLOCKED'}
                  onChange={() => setState('BLOCKED')}
                  className="sr-only"
                />
                <div className="card-indicator" />
                <div className="card-content">
                  <div className="card-title-row">
                    <span className="card-icon">🚫</span>
                    <strong className="card-title">Blocked</strong>
                  </div>
                  <span className="card-desc">Fully closed to all traffic</span>
                </div>
              </label>

              {/* High Risk Card */}
              <label className={`condition-card card-risk ${state === 'HIGH_RISK' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="roadState"
                  value="HIGH_RISK"
                  checked={state === 'HIGH_RISK'}
                  onChange={() => setState('HIGH_RISK')}
                  className="sr-only"
                />
                <div className="card-indicator" />
                <div className="card-content">
                  <div className="card-title-row">
                    <span className="card-icon">⚠️</span>
                    <strong className="card-title">High Risk</strong>
                  </div>
                  <span className="card-desc">Penalized; detours preferred</span>
                </div>
              </label>

              {/* Restricted Card */}
              <label className={`condition-card card-restricted ${state === 'RESTRICTED' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="roadState"
                  value="RESTRICTED"
                  checked={state === 'RESTRICTED'}
                  onChange={() => setState('RESTRICTED')}
                  className="sr-only"
                />
                <div className="card-indicator" />
                <div className="card-content">
                  <div className="card-title-row">
                    <span className="card-icon">🔒</span>
                    <strong className="card-title">Restricted</strong>
                  </div>
                  <span className="card-desc">Emergency responders only</span>
                </div>
              </label>

              {/* Reopen Card */}
              <label className={`condition-card card-open ${state === 'OPEN' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="roadState"
                  value="OPEN"
                  checked={state === 'OPEN'}
                  onChange={() => setState('OPEN')}
                  className="sr-only"
                />
                <div className="card-indicator" />
                <div className="card-content">
                  <div className="card-title-row">
                    <span className="card-icon">✅</span>
                    <strong className="card-title">Reopen Road</strong>
                  </div>
                  <span className="card-desc">Clear restrictions & open</span>
                </div>
              </label>
            </div>
          </div>

          {/* Disaster Reason Dropdown */}
          {state !== 'OPEN' && (
            <div className="form-group">
              <label className="form-label" htmlFor="closure-reason-select">
                <span>Disaster / Closure Reason</span>
              </label>
              <div className="select-wrapper">
                <select
                  id="closure-reason-select"
                  className="form-select modern-select"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                >
                  <option value="flooding">🌊 Flooding / Water Inundation</option>
                  <option value="landslide">🪨 Landslide / Mudslide / Rockfall</option>
                  <option value="structural_damage">🏗️ Structural Damage / Bridge Hazard</option>
                  <option value="debris">🌲 Debris / Fallen Trees / Power Lines</option>
                  <option value="fire">🔥 Fire / Smoke / Thermal Hazard</option>
                  <option value="access_restriction">🛑 Police Barricade / Emergency Checkpoint</option>
                  <option value="other">⚠️ Other Severe Hazard</option>
                </select>
                <div className="select-arrow">▼</div>
              </div>
            </div>
          )}

          {/* Risk Detour Penalty Slider */}
          {state === 'HIGH_RISK' && (
            <div className="form-group risk-penalty-box">
              <div className="risk-slider-header">
                <label className="form-label" htmlFor="risk-range-input">
                  Risk Detour Multiplier
                </label>
                <span className="penalty-badge">{riskPenalty.toFixed(1)}x Cost Multiplier</span>
              </div>
              <input
                id="risk-range-input"
                type="range"
                className="form-range modern-range"
                min="1.5"
                max="10.0"
                step="0.5"
                value={riskPenalty}
                onChange={(e) => setRiskPenalty(parseFloat(e.target.value))}
              />
              <span className="form-hint">
                Higher values force the routing engine to divert around this segment unless impassable.
              </span>
            </div>
          )}

          {/* Application Scope */}
          <div className="form-group">
            <label className="form-label">
              <span>Application Scope</span>
            </label>
            <div className="scope-cards-list">
              <label className={`scope-radio-card ${scope === 'both_directions' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="scope"
                  value="both_directions"
                  checked={scope === 'both_directions'}
                  onChange={() => setScope('both_directions')}
                />
                <div className="scope-radio-text">
                  <strong>Both Directions (Bi-directional Closure)</strong>
                  <span className="scope-desc">Recommended — blocks or penalizes both forward and reverse lanes</span>
                </div>
              </label>

              <label className={`scope-radio-card ${scope === 'edge' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="scope"
                  value="edge"
                  checked={scope === 'edge'}
                  onChange={() => setScope('edge')}
                />
                <div className="scope-radio-text">
                  <strong>This Direction Only (One-Way / Lane-Specific)</strong>
                  <span className="scope-desc">Affects only this exact directed segment</span>
                </div>
              </label>

              {road.way_id && (
                <label className={`scope-radio-card ${scope === 'entire_way' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="scope"
                    value="entire_way"
                    checked={scope === 'entire_way'}
                    onChange={() => setScope('entire_way')}
                  />
                  <div className="scope-radio-text">
                    <strong>Entire OSM Road Corridor (All Connected Segments)</strong>
                    <span className="scope-desc">Applies condition across all segments of OSM way #{road.way_id}</span>
                  </div>
                </label>
              )}
            </div>
          </div>

          {/* Modal Actions */}
          <div className="modal-actions road-modal-actions">
            <button
              type="button"
              className="btn-modal-cancel"
              onClick={onClose}
              disabled={isApplying}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`btn-modal-apply ${
                state === 'BLOCKED'
                  ? 'apply-blocked'
                  : state === 'HIGH_RISK'
                  ? 'apply-risk'
                  : state === 'RESTRICTED'
                  ? 'apply-restricted'
                  : 'apply-open'
              }`}
              disabled={isApplying}
            >
              {isApplying ? (
                <>
                  <span className="spinner-sm" />
                  <span>Applying...</span>
                </>
              ) : state === 'BLOCKED' ? (
                <>
                  <span>🚫</span>
                  <span>Block Road Segment</span>
                </>
              ) : state === 'HIGH_RISK' ? (
                <>
                  <span>⚠️</span>
                  <span>Apply Risk Penalty</span>
                </>
              ) : state === 'RESTRICTED' ? (
                <>
                  <span>🔒</span>
                  <span>Restrict Access</span>
                </>
              ) : (
                <>
                  <span>✅</span>
                  <span>Reopen Road</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
