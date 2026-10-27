import React, { useEffect, useMemo, useState } from 'react';
import type { DeviceCoordinates, ManeuverInstruction, RouteResponse } from '../types';

interface NavigationHudProps {
  isNavigating: boolean;
  onEndJourney: () => void;
  route: RouteResponse | null;
  currentCoords: DeviceCoordinates | null;
  destinationName?: string;
  onRecalculateRoute: () => void;
  onRecenter: () => void;
  gpsErrorMessage?: string | null;
}

function calculateDistanceMeters(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function minDistanceToPolylineMeters(point: [number, number], polyline: number[][]): number {
  if (!polyline || polyline.length === 0) return 0;
  let minDist = Infinity;
  for (const pt of polyline) {
    const d = calculateDistanceMeters(point[0], point[1], pt[0], pt[1]);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

export const NavigationHud: React.FC<NavigationHudProps> = ({
  isNavigating,
  onEndJourney,
  route,
  currentCoords,
  destinationName,
  onRecalculateRoute,
  onRecenter,
  gpsErrorMessage,
}) => {
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [offRouteAlert, setOffRouteAlert] = useState<boolean>(false);

  const instructions: ManeuverInstruction[] = useMemo(() => {
    return route?.instructions && route.instructions.length > 0 ? route.instructions : [];
  }, [route]);

  // Reset active step when route changes
  useEffect(() => {
    setActiveStepIndex(0);
    setOffRouteAlert(false);
  }, [route]);

  // Monitor device location relative to active maneuvers and polyline
  useEffect(() => {
    if (!isNavigating || isPaused || !currentCoords || !route) return;

    const userPt: [number, number] = [currentCoords.longitude, currentCoords.latitude];

    // 1. Advance to next maneuver if close to current maneuver point (< 30m)
    if (activeStepIndex < instructions.length - 1) {
      const nextManeuver = instructions[activeStepIndex + 1];
      if (nextManeuver && nextManeuver.point) {
        const distToNext = calculateDistanceMeters(
          userPt[0],
          userPt[1],
          nextManeuver.point[0],
          nextManeuver.point[1],
        );
        if (distToNext < 30) {
          setActiveStepIndex((prev) => Math.min(prev + 1, instructions.length - 1));
        }
      }
    }

    // 2. Off-route detection: check distance from user to route polyline
    const polyline = route.geometry?.coordinates;
    if (polyline && polyline.length > 1) {
      const distFromRoute = minDistanceToPolylineMeters(userPt, polyline);
      if (distFromRoute > 50) {
        setOffRouteAlert(true);
        // Debounce recalculation request
        const timer = setTimeout(() => {
          onRecalculateRoute();
        }, 1200);
        return () => clearTimeout(timer);
      } else {
        setOffRouteAlert(false);
      }
    }
  }, [isNavigating, isPaused, currentCoords, activeStepIndex, instructions, route, onRecalculateRoute]);

  if (!isNavigating || !route) return null;

  const currentStep = instructions[activeStepIndex] || {
    instruction: 'Follow route to destination',
    road_name: destinationName || 'Destination',
    distance_m: route.total_distance_m,
    turn_type: 'straight',
  };

  const nextStep = instructions[activeStepIndex + 1];

  // Calculate remaining distance and time
  let remainingDistanceM = 0;
  let remainingDurationS = 0;
  for (let i = activeStepIndex; i < instructions.length; i++) {
    remainingDistanceM += instructions[i].distance_m || 0;
    remainingDurationS += instructions[i].duration_s || 0;
  }
  if (remainingDistanceM === 0) remainingDistanceM = route.total_distance_m;
  if (remainingDurationS === 0 && route.total_travel_time_s) {
    remainingDurationS = route.total_travel_time_s;
  }

  // Format distance
  const formatDist = (meters: number) => {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  };

  // Format time
  const formatTime = (secs: number) => {
    const mins = Math.max(1, Math.round(secs / 60));
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs} hr ${remMins} min`;
  };

  // Calculate ETA clock time
  const etaDate = new Date(Date.now() + remainingDurationS * 1000);
  const etaString = etaDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Maneuver Turn Icons
  const renderTurnIcon = (type: string) => {
    switch (type) {
      case 'turn_left':
        return (
          <svg className="nav-turn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 10 4 15 9 20" />
            <path d="M20 4v7a4 4 0 0 1-4 4H4" />
          </svg>
        );
      case 'slight_left':
        return (
          <svg className="nav-turn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="6" y1="9" x2="6" y2="4" />
            <line x1="6" y1="4" x2="11" y2="4" />
            <path d="M18 20l-9-9" />
          </svg>
        );
      case 'turn_right':
        return (
          <svg className="nav-turn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 10 20 15 15 20" />
            <path d="M4 4v7a4 4 0 0 0 4 4h12" />
          </svg>
        );
      case 'slight_right':
        return (
          <svg className="nav-turn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="9" x2="18" y2="4" />
            <line x1="18" y1="4" x2="13" y2="4" />
            <path d="M6 20l9-9" />
          </svg>
        );
      case 'uturn':
        return (
          <svg className="nav-turn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="7 14 3 18 7 22" />
            <path d="M21 10a7 7 0 0 0-14 0v8" />
          </svg>
        );
      case 'arrive':
        return (
          <svg className="nav-turn-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z" />
          </svg>
        );
      default:
        return (
          <svg className="nav-turn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        );
    }
  };

  return (
    <div className="navigation-hud-container" role="region" aria-label="Active Navigation">
      {/* 1. TOP GREEN GOOGLE MAPS NAVIGATION BANNER */}
      <div className="nav-top-banner">
        <div className="nav-banner-content">
          <div className="nav-turn-symbol-box">
            {renderTurnIcon(currentStep.turn_type)}
          </div>

          <div className="nav-instruction-text-group">
            <div className="nav-distance-callout">
              {formatDist(currentStep.distance_m)}
            </div>
            <div className="nav-primary-instruction">
              {currentStep.instruction}
            </div>
            {nextStep && (
              <div className="nav-next-step-hint">
                Then {nextStep.instruction.toLowerCase()}
              </div>
            )}
          </div>
        </div>

        {/* Off-Route / GPS warning banner inside HUD */}
        {offRouteAlert && (
          <div className="nav-alert-banner amber">
            <span className="alert-icon">⚠️</span>
            <span>Off route detected — recalculating road-network route...</span>
          </div>
        )}

        {gpsErrorMessage && (
          <div className="nav-alert-banner red">
            <span className="alert-icon">📡</span>
            <span>GPS: {gpsErrorMessage}</span>
          </div>
        )}
      </div>

      {/* 2. BOTTOM FLOATING NAVIGATION BAR */}
      <div className="nav-bottom-bar">
        <div className="nav-metrics-left">
          <div className="nav-remaining-time">{formatTime(remainingDurationS)}</div>
          <div className="nav-remaining-subtext">
            <span>{formatDist(remainingDistanceM)}</span>
            <span className="dot-divider">•</span>
            <span>ETA {etaString}</span>
          </div>
          {destinationName && (
            <div className="nav-dest-label">To: {destinationName}</div>
          )}
        </div>

        <div className="nav-actions-right">
          {/* Recenter button */}
          <button
            type="button"
            className="nav-control-btn"
            onClick={onRecenter}
            title="Recenter Camera on Current Location"
            aria-label="Recenter"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="7" />
              <line x1="12" y1="2" x2="12" y2="5" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="2" y1="12" x2="5" y2="12" />
              <line x1="19" y1="12" x2="22" y2="12" />
              <circle cx="12" cy="12" r="2" fill="currentColor" />
            </svg>
          </button>

          {/* Pause / Resume */}
          <button
            type="button"
            className={`nav-control-btn ${isPaused ? 'paused' : ''}`}
            onClick={() => setIsPaused(!isPaused)}
            title={isPaused ? 'Resume Navigation' : 'Pause Navigation'}
            aria-label="Pause or Resume"
          >
            {isPaused ? '▶' : '⏸'}
          </button>

          {/* End Journey Button */}
          <button
            type="button"
            className="nav-end-journey-btn"
            onClick={onEndJourney}
            title="End Navigation"
            aria-label="End Journey"
          >
            <span>✕ End Journey</span>
          </button>
        </div>
      </div>
    </div>
  );
};
export default NavigationHud;

