import React from 'react';
import type { ActivePanelTab } from '../types';

interface QuickActionChipsProps {
  activeTab: ActivePanelTab;
  onSelectTab: (tab: ActivePanelTab) => void;
  facilitiesCount: number;
  closuresCount: number;
  hazardsCount: number;
  isRerouted: boolean;
  appMode: 'routing' | 'disaster';
  onAppModeToggle: () => void;
}

export const QuickActionChips: React.FC<QuickActionChipsProps> = ({
  activeTab,
  onSelectTab,
  facilitiesCount,
  closuresCount,
  hazardsCount,
  isRerouted,
  appMode,
  onAppModeToggle,
}) => {
  const handleChipClick = (tab: ActivePanelTab) => {
    if (activeTab === tab) {
      onSelectTab('none'); // Toggle collapse
    } else {
      onSelectTab(tab);
    }
  };

  return (
    <div className="quick-chips-wrapper">
      <div className="quick-chips-scroll">
        {/* 1. Navigate Chip */}
        <button
          type="button"
          className={`chip-pill ${activeTab === 'navigate' ? 'active-blue' : ''} ${
            isRerouted ? 'pulse-amber' : ''
          }`}
          onClick={() => handleChipClick('navigate')}
        >
          <span className="chip-icon">🧭</span>
          <span className="chip-text">Navigate</span>
          {isRerouted && <span className="chip-count-badge orange">Detour</span>}
        </button>

        {/* 2. Emergency Facilities Chip */}
        <button
          type="button"
          className={`chip-pill ${activeTab === 'facilities' ? 'active-blue' : ''} ${
            facilitiesCount > 0 ? 'has-badge' : ''
          }`}
          onClick={() => handleChipClick('facilities')}
        >
          <span className="chip-icon">🏥</span>
          <span className="chip-text">Emergency Facilities</span>
          {facilitiesCount > 0 && (
            <span className="chip-count-badge blue">{facilitiesCount}</span>
          )}
        </button>

        {/* 3. Disaster Simulation Mode Chip */}
        <button
          type="button"
          className={`chip-pill ${appMode === 'disaster' ? 'active-orange' : ''}`}
          onClick={() => {
            onAppModeToggle();
            if (appMode !== 'disaster') {
              onSelectTab('simulation');
            }
          }}
          title="Toggle interactive disaster road blocking mode"
        >
          <span className="chip-icon">⚠️</span>
          <span className="chip-text">
            Disaster Sim {appMode === 'disaster' ? '(Active)' : ''}
          </span>
        </button>

        {/* 4. Road Closures Chip */}
        <button
          type="button"
          className={`chip-pill ${activeTab === 'closures' ? 'active-red' : ''} ${
            closuresCount > 0 ? 'has-badge' : ''
          }`}
          onClick={() => handleChipClick('closures')}
        >
          <span className="chip-icon">🚧</span>
          <span className="chip-text">Road Closures</span>
          {closuresCount > 0 && <span className="chip-count-badge red">{closuresCount}</span>}
        </button>

        {/* 5. Hazard Zones Chip */}
        <button
          type="button"
          className={`chip-pill ${activeTab === 'hazards' ? 'active-red' : ''} ${
            hazardsCount > 0 ? 'has-badge' : ''
          }`}
          onClick={() => handleChipClick('hazards')}
        >
          <span className="chip-icon">🔴</span>
          <span className="chip-text">Hazard Zones</span>
          {hazardsCount > 0 && <span className="chip-count-badge orange">{hazardsCount}</span>}
        </button>
      </div>
    </div>
  );
};
export default QuickActionChips;
