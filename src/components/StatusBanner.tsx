import React from 'react';

interface StatusBannerProps {
  message: string;
  onDismiss: () => void;
  onRetry?: () => void;
}

export const StatusBanner: React.FC<StatusBannerProps> = ({
  message,
  onDismiss,
  onRetry,
}) => {
  return (
    <div className="status-banner" role="alert">
      <div className="status-banner-content">
        <svg
          className="warning-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span className="status-message">{message}</span>
        {onRetry && (
          <button type="button" className="retry-inline-button" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>

      <button
        type="button"
        className="dismiss-button"
        onClick={onDismiss}
        aria-label="Dismiss message"
        title="Dismiss message"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
};

