import React, { useEffect, useState } from 'react';

interface AddHazardModalProps {
  mapCenter: [number, number]; // [lon, lat]
  hazardCenter?: [number, number] | null;
  onPickOnMap?: () => void;
  onRadiusChange?: (radiusM: number) => void;
  onCreate: (params: {
    name: string;
    hazard_type: string;
    severity: string;
    impact_mode: 'BLOCK_ALL' | 'HIGH_RISK' | 'RESTRICTED';
    risk_penalty: number;
    geometry: {
      type: 'Circle';
      center: [number, number];
      radius_m: number;
    };
  }) => void;
  onClose: () => void;
}

export const AddHazardModal: React.FC<AddHazardModalProps> = ({
  mapCenter,
  hazardCenter,
  onPickOnMap,
  onRadiusChange,
  onCreate,
  onClose,
}) => {
  const effectiveCenter = hazardCenter || mapCenter;
  const [name, setName] = useState('Flash Flood Zone');
  const [hazardType, setHazardType] = useState('flood');
  const [severity, setSeverity] = useState('critical');
  const [impactMode, setImpactMode] = useState<'BLOCK_ALL' | 'HIGH_RISK' | 'RESTRICTED'>('BLOCK_ALL');
  const [radiusM, setRadiusM] = useState(300);
  const [riskPenalty, setRiskPenalty] = useState(5.0);

  useEffect(() => {
    onRadiusChange?.(radiusM);
  }, [radiusM, onRadiusChange]);

  const handleRadiusChange = (newRad: number) => {
    setRadiusM(newRad);
    onRadiusChange?.(newRad);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({
      name,
      hazard_type: hazardType,
      severity,
      impact_mode: impactMode,
      risk_penalty: riskPenalty,
      geometry: {
        type: 'Circle',
        center: effectiveCenter,
        radius_m: radiusM,
      },
    });
  };

  const setPreset = (t: string, defName: string, mode: 'BLOCK_ALL' | 'HIGH_RISK', rad: number) => {
    setHazardType(t);
    setName(defName);
    setImpactMode(mode);
    handleRadiusChange(rad);
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card hazard-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-icon-title">
            <span className="modal-title-icon">🔴</span>
            <div>
              <h3 className="modal-title">Define Hazard Zone</h3>
              <p className="modal-subtitle">Geographic risk zone affecting road routing</p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {/* Interactive Location Picker Section */}
        <div className="hazard-location-card">
          <div className="location-header-row">
            <div className="loc-label-flex">
              <span className="loc-marker-icon">📍</span>
              <span className="loc-label">Hazard Center Location</span>
            </div>
            {hazardCenter ? (
              <span className="loc-badge-picked">✓ Selected on Map</span>
            ) : (
              <span className="loc-badge-default">Map View Center</span>
            )}
          </div>
          <div className="location-actions-row">
            <div className="loc-coords-display">
              <span className="coord-val">{effectiveCenter[1].toFixed(5)}° N</span>,{' '}
              <span className="coord-val">{effectiveCenter[0].toFixed(5)}° E</span>
            </div>
            {onPickOnMap && (
              <button
                type="button"
                className="btn-pick-map-action"
                onClick={onPickOnMap}
                title="Click anywhere on the map to set location"
              >
                <span className="pick-icon">🎯</span> Pick on Map
              </button>
            )}
          </div>
        </div>

        {/* Quick Presets */}
        <div className="hazard-presets">
          <span className="preset-label">Templates:</span>
          <button
            type="button"
            className={`preset-btn ${hazardType === 'flood' ? 'active' : ''}`}
            onClick={() => setPreset('flood', 'Flood Inundation Area', 'BLOCK_ALL', 300)}
          >
            🌊 Flood
          </button>
          <button
            type="button"
            className={`preset-btn ${hazardType === 'wildfire' ? 'active' : ''}`}
            onClick={() => setPreset('wildfire', 'Wildfire Smoke Zone', 'HIGH_RISK', 400)}
          >
            🔥 Fire Risk
          </button>
          <button
            type="button"
            className={`preset-btn ${hazardType === 'chemical_spill' ? 'active' : ''}`}
            onClick={() => setPreset('chemical_spill', 'Chemical Hazard Perimeter', 'BLOCK_ALL', 200)}
          >
            ☣️ Chemical
          </button>
          <button
            type="button"
            className={`preset-btn ${hazardType === 'debris_zone' ? 'active' : ''}`}
            onClick={() => setPreset('debris_zone', 'Debris / Landslide Zone', 'BLOCK_ALL', 250)}
          >
            ⛰️ Landslide
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label className="form-label">Zone Name</label>
            <input
              type="text"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Aundh River Flood Zone"
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Hazard Type</label>
              <select
                className="form-select"
                value={hazardType}
                onChange={(e) => setHazardType(e.target.value)}
              >
                <option value="flood">🌊 Flood Inundation</option>
                <option value="wildfire">🔥 Wildfire / Smoke</option>
                <option value="chemical_spill">☣️ Chemical / Toxic Spill</option>
                <option value="earthquake_damage">🏚️ Earthquake / Debris</option>
                <option value="storm_surge">🌪️ Storm Surge</option>
                <option value="debris_zone">🚧 Blocked Debris Zone</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Severity</label>
              <select
                className="form-select"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="moderate">Moderate</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Routing Impact on Intersecting Roads</label>
            <div className="radio-group">
              <label className={`radio-pill ${impactMode === 'BLOCK_ALL' ? 'active-blocked' : ''}`}>
                <input
                  type="radio"
                  name="impactMode"
                  value="BLOCK_ALL"
                  checked={impactMode === 'BLOCK_ALL'}
                  onChange={() => setImpactMode('BLOCK_ALL')}
                />
                Block All Roads
              </label>

              <label className={`radio-pill ${impactMode === 'HIGH_RISK' ? 'active-risk' : ''}`}>
                <input
                  type="radio"
                  name="impactMode"
                  value="HIGH_RISK"
                  checked={impactMode === 'HIGH_RISK'}
                  onChange={() => setImpactMode('HIGH_RISK')}
                />
                High Risk (Penalize)
              </label>

              <label className={`radio-pill ${impactMode === 'RESTRICTED' ? 'active-restricted' : ''}`}>
                <input
                  type="radio"
                  name="impactMode"
                  value="RESTRICTED"
                  checked={impactMode === 'RESTRICTED'}
                  onChange={() => setImpactMode('RESTRICTED')}
                />
                Restricted Access
              </label>
            </div>
          </div>

          {impactMode === 'HIGH_RISK' && (
            <div className="form-group">
              <div className="slider-header-flex">
                <label className="form-label">Risk Cost Penalty Multiplier</label>
                <span className="slider-value-pill">{riskPenalty}x penalty</span>
              </div>
              <input
                type="range"
                className="form-range"
                min="2.0"
                max="10.0"
                step="0.5"
                value={riskPenalty}
                onChange={(e) => setRiskPenalty(parseFloat(e.target.value))}
              />
            </div>
          )}

          <div className="form-group">
            <div className="slider-header-flex">
              <label className="form-label">Hazard Zone Radius</label>
              <span className="slider-value-pill bold">{radiusM} meters</span>
            </div>
            <input
              type="range"
              className="form-range"
              min="50"
              max="1500"
              step="25"
              value={radiusM}
              onChange={(e) => handleRadiusChange(parseInt(e.target.value, 10))}
            />
            <div className="radius-presets-row">
              {[100, 250, 500, 1000].map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`radius-preset-pill ${radiusM === r ? 'active' : ''}`}
                  onClick={() => handleRadiusChange(r)}
                >
                  {r}m
                </button>
              ))}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Create Hazard Zone
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default AddHazardModal;
