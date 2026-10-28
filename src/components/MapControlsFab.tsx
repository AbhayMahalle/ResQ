import React from 'react';

interface MapControlsFabProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetNorth: () => void;
  onLocateUser: () => void;
  isLocating: boolean;
  onToggleLegend: () => void;
  isLegendActive: boolean;
  onFitCoverage?: () => void;
  showCoveredRoads?: boolean;
  onToggleCoveredRoads?: () => void;
}

export const MapControlsFab: React.FC<MapControlsFabProps> = ({
  onZoomIn,
  onZoomOut,
  onResetNorth,
  onLocateUser,
  isLocating,
  onToggleLegend,
  isLegendActive,
  onFitCoverage,
  showCoveredRoads = true,
  onToggleCoveredRoads,
}) => {
  const [isLegendOpen, setIsLegendOpen] = React.useState(false);
  const isEffectiveLegendOpen = isLegendActive || isLegendOpen;

  return (
    <>
      {/* Bottom Left: Map Legend Quick Chip & Popover Card */}
      <div className="bottom-left-controls">
        {isEffectiveLegendOpen && (
          <div className="floating-map-legend-card" role="dialog" aria-label="Road Network Legend">
            <div className="legend-card-header">
              <span className="legend-card-title">Map & Route Legend</span>
              <button
                type="button"
                className="legend-card-close"
                onClick={() => {
                  setIsLegendOpen(false);
                  if (isLegendActive) onToggleLegend();
                }}
                title="Close Legend"
              >
                ✕
              </button>
            </div>
            <div className="legend-items-list">
              <div className="legend-item">
                <span className="legend-swatch line-route" />
                <span className="legend-item-label">Calculated Route</span>
              </div>
              <div className="legend-item">
                <span className="legend-swatch line-blocked" />
                <span className="legend-item-label">Blocked Roads</span>
              </div>
              <div className="legend-item">
                <span className="legend-swatch line-risk" />
                <span className="legend-item-label">High Risk Roads</span>
              </div>
              <div className="legend-item">
                <span className="legend-swatch line-restricted" />
                <span className="legend-item-label">Restricted Roads</span>
              </div>
              {showCoveredRoads && (
                <div className="legend-item">
                  <span className="legend-swatch line-covered-highlight" />
                  <span className="legend-item-label">Covered Roads (Inspection)</span>
                </div>
              )}
            </div>
          </div>
        )}
        <div className="bottom-left-chips-row">
          <button
            type="button"
            className={`legend-chip-btn ${isEffectiveLegendOpen ? 'active' : ''}`}
            onClick={() => {
              setIsLegendOpen((prev) => !prev);
              onToggleLegend();
            }}
            title="Toggle Map Color Legend"
          >
            <span className="legend-chip-icon">🗺️</span>
            <span className="legend-chip-text">Road Legend</span>
          </button>
          {onToggleCoveredRoads && (
            <button
              type="button"
              className={`legend-chip-btn inspection-toggle-btn ${showCoveredRoads ? 'active-emerald' : ''}`}
              onClick={onToggleCoveredRoads}
              title={showCoveredRoads ? 'Hide covered roads highlight' : 'Highlight covered road network for inspection'}
            >
              <span className="legend-chip-icon">{showCoveredRoads ? '🟢' : '⚪'}</span>
              <span className="legend-chip-text">
                {showCoveredRoads ? 'Covered Roads: ON' : 'Covered Roads: OFF'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Bottom Right: Floating Google Maps Style Controls */}
      <div className="bottom-right-controls">
        {/* Fit Network Coverage FAB */}
        {onFitCoverage && (
          <button
            type="button"
            className="fab-circle-btn fit-coverage-fab"
            onClick={onFitCoverage}
            title="Fit Entire Pune Coverage Area (All 11,370 Roads)"
            aria-label="Fit Pune Coverage Area"
          >
            <svg
              className="fab-icon-svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        )}

        {/* Current Location FAB */}
        <button
          type="button"
          className={`fab-circle-btn locate-fab ${isLocating ? 'locating' : ''}`}
          onClick={onLocateUser}
          title="Center on My Location"
          aria-label="Center on my location"
        >
          <svg
            className={`fab-icon-svg ${isLocating ? 'spin-anim' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="7" />
            <line x1="12" y1="1" x2="12" y2="4" />
            <line x1="12" y1="20" x2="12" y2="23" />
            <line x1="1" y1="12" x2="4" y2="12" />
            <line x1="20" y1="12" x2="23" y2="12" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
          </svg>
        </button>

        {/* Zoom & Compass Vertical Pill */}
        <div className="fab-zoom-pill">
          <button
            type="button"
            className="zoom-pill-btn zoom-in"
            onClick={onZoomIn}
            title="Zoom In (+)"
            aria-label="Zoom in"
          >
            +
          </button>
          <div className="zoom-pill-divider" />
          <button
            type="button"
            className="zoom-pill-btn zoom-out"
            onClick={onZoomOut}
            title="Zoom Out (−)"
            aria-label="Zoom out"
          >
            −
          </button>
        </div>

        {/* Compass Reset North FAB */}
        <button
          type="button"
          className="fab-circle-btn compass-fab"
          onClick={onResetNorth}
          title="Reset Map Orientation North"
          aria-label="Reset north"
        >
          <span className="compass-needle">▲</span>
        </button>
      </div>
    </>
  );
};

