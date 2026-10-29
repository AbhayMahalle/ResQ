import React from 'react';
import type { ClickAction } from '../types';

interface PickingBannerProps {
  clickAction: ClickAction;
  onCancel: () => void;
}

export const PickingBanner: React.FC<PickingBannerProps> = ({ clickAction, onCancel }) => {
  if (clickAction === 'none') {
    return null;
  }

  return (
    <div className="picking-banner-wrapper">
      <div className="picking-banner-pill">
        <span className="picking-icon">
          {clickAction === 'set_start' ? '📍' : clickAction === 'set_dest' ? '🎯' : '🔴'}
        </span>
        <span className="picking-text">
          {clickAction === 'set_start'
            ? 'Click anywhere on the road network to set Start Point [A]'
            : clickAction === 'set_dest'
            ? 'Click anywhere on the road network to set Destination [B]'
            : 'Click anywhere on the map to place the Hazard Zone center'}
        </span>
        <button
          type="button"
          className="picking-cancel-btn"
          onClick={onCancel}
          title="Cancel map selection"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

