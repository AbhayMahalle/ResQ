import React from 'react';
import type { DeviceCoordinates } from '../types';

interface HeaderProps {
  coordinates: DeviceCoordinates | null;
  isLocating: boolean;
  onRefreshLocation: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  coordinates,
  isLocating,
  onRefreshLocation,
}) => {
  const formatCoord = (num: number, posChar: string, negChar: string): string => {
    const dir = num >= 0 ? posChar : negChar;
    return `${Math.abs(num).toFixed(4)}° ${dir}`;
  };

  return (
    <header className="app-header">
      <div className="header-brand">
        <svg
          className="map-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
          <line x1="8" y1="2" x2="8" y2="18" />
          <line x1="16" y1="6" x2="16" y2="22" />
        </svg>
        <h1 className="header-title">Interactive Map</h1>

        {coordinates && (
          <div className="coordinates-tag" title="Live device coordinates">
            <span className="live-status-indicator" />
            <span className="coordinates-text">
              {formatCoord(coordinates.latitude, 'N', 'S')}, {formatCoord(coordinates.longitude, 'E', 'W')}
            </span>
          </div>
        )}
      </div>

      <div className="header-actions">
        <button
          type="button"
          className="refresh-location-button"
          onClick={onRefreshLocation}
          disabled={isLocating}
          title="Refresh your live location"
          aria-label="Refresh your live location"
        >
          <svg
            className={`refresh-icon ${isLocating ? 'rotating' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span className="button-label">{isLocating ? 'Locating...' : 'Refresh Location'}</span>
        </button>
      </div>
    </header>
  );
};

