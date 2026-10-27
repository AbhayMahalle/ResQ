import React from 'react';
import type { ActivePanelTab } from '../types';

interface SidebarDockProps {
  activeTab: ActivePanelTab;
  onSelectTab: (tab: ActivePanelTab) => void;
  isOpen: boolean;
  facilitiesCount: number;
  closuresCount: number;
  hazardsCount: number;
}

export const SidebarDock: React.FC<SidebarDockProps> = ({
  activeTab,
  onSelectTab,
  isOpen,
  facilitiesCount,
  closuresCount,
  hazardsCount,
}) => {
  const navItems: Array<{
    id: ActivePanelTab;
    label: string;
    icon: string;
    badge?: number;
    badgeColor?: string;
  }> = [
    { id: 'navigate', label: 'Navigate & Routing', icon: '🧭' },
    {
      id: 'facilities',
      label: 'Emergency Facilities',
      icon: '🏥',
      badge: facilitiesCount,
      badgeColor: 'blue',
    },
    { id: 'simulation', label: 'Disaster Simulation', icon: '⚠️' },
    {
      id: 'closures',
      label: 'Road Closures',
      icon: '🚧',
      badge: closuresCount,
      badgeColor: 'red',
    },
    {
      id: 'hazards',
      label: 'Hazard Zones',
      icon: '🔴',
      badge: hazardsCount,
      badgeColor: 'orange',
    },
  ];

  if (!isOpen) return null;

  return (
    <aside className="sidebar-dock" aria-label="Quick Navigation">
      <nav className="dock-nav-list">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`dock-item-btn ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(isActive ? 'none' : item.id)}
              title={item.label}
              aria-label={item.label}
            >
              <span className="dock-icon">{item.icon}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className={`dock-badge ${item.badgeColor || 'gray'}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
};
export default SidebarDock;
