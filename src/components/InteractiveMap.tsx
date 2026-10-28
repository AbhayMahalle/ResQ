import React, { useEffect, useRef, useState } from 'react';
import {
  Map as MapLibreMap,
  Marker,
  Popup,
  type ErrorEvent,
  type MapMouseEvent,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  MAP_STYLE_URL,
  FALLBACK_MAP_STYLE,
  USER_LOCATION_ZOOM,
  GLOBAL_FALLBACK_CENTER,
  GLOBAL_FALLBACK_ZOOM,
  configureMapLibreWorker,
} from '../config';
import type {
  AppMode,
  ClickAction,
  DeviceCoordinates,
  FlyToCommand,
  Hazard,
  NetworkMetadata,
  RouteComparisonResponse,
  RouteResponse,
  SelectedRoadInfo,
} from '../types';
import { createCirclePolygon } from './mapHelpers';

interface InteractiveMapProps {
  coordinates: DeviceCoordinates | null;
  initialResolved: boolean;
  onMapError?: (errorMessage: string) => void;
  // Routing Points & Layers
  startCoords: [number, number] | null;
  destCoords: [number, number] | null;
  clickAction: ClickAction;
  onMapClickPoint: (coords: [number, number]) => void;
  routeResult: RouteResponse | null;
  routeComparison: RouteComparisonResponse | null;
  // Road Network & Disaster Mode
  appMode: AppMode;
  networkGeoJSON: any;
  activeNetwork?: NetworkMetadata | null;
  hazards: Hazard[];
  onSelectRoad: (road: SelectedRoadInfo) => void;
  onCenterChange?: (center: [number, number]) => void;
  flyToCommand?: FlyToCommand | null;
  mapCommand?: { type: 'zoom_in' | 'zoom_out' | 'reset_north'; id: number } | null;
  facilitiesGeoJSON?: any;
  onSelectFacility?: (facility: { id: string; name: string; category: string; lat: number; lon: number }) => void;
  isNavigating?: boolean;
  showCoveredRoads?: boolean;
  closuresGeoJSON?: any;
  hazardPreviewCircle?: { center: [number, number]; radius_m: number } | null;
}

function calculateBearing(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

function createLiveMarkerElement(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'live-location-marker';
  container.setAttribute('role', 'img');
  container.setAttribute('aria-label', 'Your current location');

  // Browsing Mode: Radar pulse & blue dot
  const pulse = document.createElement('div');
  pulse.className = 'live-location-pulse';

  const dot = document.createElement('div');
  dot.className = 'live-location-dot';

  // Navigation Journey Mode: Google Maps 3D Arrow Puck with Directional Cone
  const navPuck = document.createElement('div');
  navPuck.className = 'google-nav-arrow-puck';
  navPuck.innerHTML = `
    <div class="nav-arrow-cone"></div>
    <div class="nav-arrow-disk">
      <svg class="nav-arrow-chevron" viewBox="0 0 24 24">
        <polygon points="12,3 21,20 12,16 3,20" fill="#ffffff" stroke="#1557b0" stroke-width="0.8" />
      </svg>
    </div>
  `;

  container.appendChild(pulse);
  container.appendChild(dot);
  container.appendChild(navPuck);
  return container;
}

function createPointMarkerElement(label: string, colorClass: string): HTMLElement {
  const el = document.createElement('div');
  el.className = `routing-point-marker ${colorClass}`;
  el.textContent = label;
  return el;
}

function createPopupHTML(coords: DeviceCoordinates): string {
  const accuracyInfo = coords.accuracy
    ? `<div class="popup-accuracy">Accuracy: ±${Math.round(coords.accuracy)}m</div>`
    : '';

  return `
    <div class="location-popup-content">
      <div class="popup-title">Current Location</div>
      <div class="popup-coords">${coords.latitude.toFixed(5)}°, ${coords.longitude.toFixed(5)}°</div>
      ${accuracyInfo}
    </div>
  `;
}

function createPopupContent(coords: DeviceCoordinates): Popup {
  return new Popup({
    offset: 14,
    closeButton: false,
    className: 'custom-location-popup',
    maxWidth: '220px',
  }).setHTML(createPopupHTML(coords));
}

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  coordinates,
  initialResolved,
  onMapError,
  startCoords,
  destCoords,
  clickAction,
  onMapClickPoint,
  routeResult,
  routeComparison,
  appMode,
  networkGeoJSON,
  hazards,
  onSelectRoad,
  onCenterChange,
  flyToCommand,
  mapCommand,
  facilitiesGeoJSON,
  onSelectFacility,
  isNavigating,
  showCoveredRoads = true,
  closuresGeoJSON,
  hazardPreviewCircle,
}) => {
  const [isMapLoaded, setIsMapLoaded] = useState<boolean>(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<MapLibreMap | null>(null);
  const liveMarkerRef = useRef<Marker | null>(null);
  const startMarkerRef = useRef<Marker | null>(null);
  const destMarkerRef = useRef<Marker | null>(null);
  const roadTooltipRef = useRef<Popup | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const onMapErrorRef = useRef(onMapError);
  const onCenterChangeRef = useRef(onCenterChange);
  const onSelectFacilityRef = useRef(onSelectFacility);
  const showCoveredRoadsRef = useRef<boolean>(showCoveredRoads);

  useEffect(() => {
    showCoveredRoadsRef.current = showCoveredRoads;
  }, [showCoveredRoads]);

  useEffect(() => {
    onSelectFacilityRef.current = onSelectFacility;
  }, [onSelectFacility]);

  useEffect(() => {
    onMapErrorRef.current = onMapError;
  }, [onMapError]);

  useEffect(() => {
    onCenterChangeRef.current = onCenterChange;
  }, [onCenterChange]);

  // Initialize MapLibre Worker
  useEffect(() => {
    configureMapLibreWorker();
  }, []);

  // Initialize map once initial location check has resolved and container is ready
  useEffect(() => {
    if (!initialResolved || !mapContainerRef.current) {
      return;
    }

    if (mapInstanceRef.current) {
      return;
    }

    const initialCenter: [number, number] = coordinates
      ? [coordinates.longitude, coordinates.latitude]
      : GLOBAL_FALLBACK_CENTER;

    const initialZoom = coordinates ? USER_LOCATION_ZOOM : GLOBAL_FALLBACK_ZOOM;

    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: MAP_STYLE_URL,
      center: initialCenter,
      zoom: initialZoom,
      minZoom: 1,
      maxZoom: 20,
      dragPan: {
        linearity: 0.3,
        maxSpeed: 1400,
        deceleration: 2500,
      },
      scrollZoom: true,
      boxZoom: true,
      dragRotate: true,
      keyboard: true,
      doubleClickZoom: true,
      touchZoomRotate: true,
      trackResize: true,
      attributionControl: {
        compact: false,
      },
    });

    // Make mouse wheel zoom smooth and responsive
    map.scrollZoom.setWheelZoomRate(1 / 350);

    const hasFallenBackRef = { current: false };

    map.on('error', (event: ErrorEvent) => {
      if (event.error) {
        const msg = typeof event.error.message === 'string' ? event.error.message : '';
        console.warn('MapLibre event warning/error:', msg);

        // Auto-fallback if primary vector tile server failed, was blocked by adblocker/firewall
        if (
          !hasFallenBackRef.current &&
          (msg.includes('openfreemap') || msg.includes('planet') || msg.includes('Failed to fetch'))
        ) {
          hasFallenBackRef.current = true;
          console.warn('[ResQ] Switching to high-reliability OpenStreetMap tiles...');
          try {
            map.setStyle(FALLBACK_MAP_STYLE);
          } catch (e) {
            console.error('Failed to set fallback style:', e);
          }
          return;
        }

        // Do not surface routine background tile drops, cancellations or status 0 aborts as UI error banners
        if (
          msg.includes('abort') ||
          msg.includes('cancelled') ||
          msg.includes('Failed to fetch') ||
          msg.includes('status: 0')
        ) {
          return;
        }

        if (onMapErrorRef.current && msg) {
          onMapErrorRef.current(`Map error: ${msg}`);
        }
      }
    });

    const markMapReady = () => {
      console.log('[ResQ Map] markMapReady called! style:', Boolean(map.getStyle()));
      if (map.getStyle()) {
        setIsMapLoaded(true);
      }
    };

    map.on('load', markMapReady);
    map.on('style.load', markMapReady);
    map.on('styledata', markMapReady);

    // Track map center movement for network import & hazard centering
    map.on('moveend', () => {
      const c = map.getCenter();
      onCenterChangeRef.current?.([c.lng, c.lat]);
    });

    // Responsive container resizing
    if (window.ResizeObserver && mapContainerRef.current) {
      const observer = new ResizeObserver(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.resize();
        }
      });
      observer.observe(mapContainerRef.current);
      resizeObserverRef.current = observer;
    }

    mapInstanceRef.current = map;
    (window as any).__resq_map = map;

    return () => {
      (window as any).__resq_map = null;
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (liveMarkerRef.current) {
        liveMarkerRef.current.remove();
        liveMarkerRef.current = null;
      }
      if (startMarkerRef.current) {
        startMarkerRef.current.remove();
        startMarkerRef.current = null;
      }
      if (destMarkerRef.current) {
        destMarkerRef.current.remove();
        destMarkerRef.current = null;
      }
      if (roadTooltipRef.current) {
        roadTooltipRef.current.remove();
        roadTooltipRef.current = null;
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      setIsMapLoaded(false);
    };
  }, [initialResolved]);

  // Synchronize Live Location Marker position, arrow styling, and rotation
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !coordinates) return;

    if (!liveMarkerRef.current) {
      const markerEl = createLiveMarkerElement();
      const popup = createPopupContent(coordinates);
      const marker = new Marker({
        element: markerEl,
        anchor: 'center',
        rotationAlignment: 'map',
        pitchAlignment: 'map',
      })
        .setLngLat([coordinates.longitude, coordinates.latitude])
        .setPopup(popup)
        .addTo(map);

      liveMarkerRef.current = marker;
    } else {
      liveMarkerRef.current.setLngLat([coordinates.longitude, coordinates.latitude]);
      const popup = liveMarkerRef.current.getPopup();
      if (popup) {
        popup.setHTML(createPopupHTML(coordinates));
      }
    }

    const markerEl = liveMarkerRef.current.getElement();
    if (markerEl) {
      if (isNavigating) {
        markerEl.classList.add('is-navigating');
        // Determine forward navigation heading/bearing
        let forwardHeading = coordinates.heading;
        if (forwardHeading === null || forwardHeading === undefined || isNaN(forwardHeading)) {
          // Compute forward heading from route geometry
          if (routeResult?.geometry?.coordinates && routeResult.geometry.coordinates.length > 1) {
            const coords = routeResult.geometry.coordinates;
            // Find closest coordinate point
            let bestIdx = 0;
            let bestDist = Infinity;
            for (let i = 0; i < coords.length; i++) {
              const d = Math.hypot(coords[i][0] - coordinates.longitude, coords[i][1] - coordinates.latitude);
              if (d < bestDist) {
                bestDist = d;
                bestIdx = i;
              }
            }
            const nextIdx = Math.min(bestIdx + 1, coords.length - 1);
            if (nextIdx !== bestIdx) {
              forwardHeading = calculateBearing(
                coords[bestIdx][0],
                coords[bestIdx][1],
                coords[nextIdx][0],
                coords[nextIdx][1]
              );
            } else if (bestIdx > 0) {
              forwardHeading = calculateBearing(
                coords[bestIdx - 1][0],
                coords[bestIdx - 1][1],
                coords[bestIdx][0],
                coords[bestIdx][1]
              );
            } else {
              forwardHeading = 0;
            }
          } else {
            forwardHeading = 0;
          }
        }

        const navPuck = markerEl.querySelector('.google-nav-arrow-puck') as HTMLElement | null;
        if (navPuck) {
          navPuck.style.transform = `rotate(${forwardHeading}deg)`;
        }
      } else {
        markerEl.classList.remove('is-navigating');
        const navPuck = markerEl.querySelector('.google-nav-arrow-puck') as HTMLElement | null;
        if (navPuck) {
          navPuck.style.transform = 'none';
        }
      }
    }
  }, [coordinates, isNavigating, routeResult]);

  // Handle programmatic flyTo commands (e.g. centering on location or network bounds)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !flyToCommand) return;

    if (flyToCommand.bbox && flyToCommand.bbox.length === 4) {
      const [minX, minY, maxX, maxY] = flyToCommand.bbox;
      map.fitBounds(
        [
          [minX, minY],
          [maxX, maxY],
        ],
        {
          padding: {
            top: 70,
            bottom: 70,
            left: window.innerWidth > 768 ? 420 : 50,
            right: 70,
          },
          maxZoom: 16,
          essential: true,
        }
      );
    } else if (flyToCommand.center) {
      map.flyTo({
        center: flyToCommand.center,
        zoom: flyToCommand.zoom ?? Math.max(map.getZoom(), 13),
        essential: true,
      });
    }
  }, [flyToCommand]);

  // Handle zoom and orientation actions from FAB controls
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapCommand) return;
    if (mapCommand.type === 'zoom_in') {
      map.zoomIn({ duration: 250 });
    } else if (mapCommand.type === 'zoom_out') {
      map.zoomOut({ duration: 250 });
    } else if (mapCommand.type === 'reset_north') {
      map.resetNorthPitch({ duration: 300 });
    }
  }, [mapCommand]);

  // Handle map click events based on active mode and clickAction
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handleMapClick = (e: MapMouseEvent) => {
      const clickedLngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];

      // If user is actively setting Start, Dest point, or Hazard Zone center
      if (clickAction === 'set_start' || clickAction === 'set_dest' || clickAction === 'add_hazard') {
        onMapClickPoint(clickedLngLat);
        return;
      }

      // If in Disaster Simulation mode, query road features under cursor
      if (appMode === 'disaster') {
        const roadLayers = [
          'closure-blocked-core',
          'closure-risk-layer',
          'closure-restricted-layer',
          'road-network-blocked',
          'road-network-risk',
          'road-network-restricted',
          'road-network-normal',
        ].filter((l) => map.getLayer(l));

        if (roadLayers.length > 0) {
          const features = map.queryRenderedFeatures(e.point, { layers: roadLayers });
          if (features && features.length > 0) {
            const feat = features[0];
            const props = feat.properties as any;
            if (props && props.u !== undefined && props.v !== undefined) {
              onSelectRoad({
                u: props.u,
                v: props.v,
                key: props.key || 0,
                way_id: props.way_id,
                name: props.name,
                highway: props.highway,
                length_m: props.length_m || 0,
                state: props.state || 'OPEN',
                closure_reason: props.closure_reason,
                risk_penalty: props.risk_penalty || 1.0,
              });
              return;
            }
          }
        }
      }
    };

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [clickAction, appMode, onMapClickPoint, onSelectRoad]);

  // Dynamic cursor style & Road Inspection Tooltip
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const canvas = map.getCanvas();

    const handleMouseMove = (e: MapMouseEvent) => {
      if (clickAction === 'set_start' || clickAction === 'set_dest' || clickAction === 'add_hazard') {
        canvas.style.cursor = 'crosshair';
        if (roadTooltipRef.current) {
          roadTooltipRef.current.remove();
          roadTooltipRef.current = null;
        }
        return;
      }

      if (appMode !== 'disaster' && !showCoveredRoads) {
        canvas.style.cursor = '';
        if (roadTooltipRef.current) {
          roadTooltipRef.current.remove();
          roadTooltipRef.current = null;
        }
        return;
      }

      const roadLayers = [
        'closure-blocked-core',
        'closure-risk-layer',
        'closure-restricted-layer',
        'road-network-blocked',
        'road-network-risk',
        'road-network-restricted',
        'road-network-normal',
      ].filter((l) => map.getLayer(l));

      if (roadLayers.length === 0) {
        canvas.style.cursor = '';
        if (roadTooltipRef.current) {
          roadTooltipRef.current.remove();
          roadTooltipRef.current = null;
        }
        return;
      }

      const features = map.queryRenderedFeatures(e.point, { layers: roadLayers });
      if (features.length > 0) {
        canvas.style.cursor = 'pointer';

        const feat = features[0];
        const props = (feat.properties || {}) as any;
        const rawName = props.name;
        const hasValidName =
          rawName && rawName !== 'Unnamed Road' && rawName !== 'nan' && rawName !== 'undefined';
        const roadName = hasValidName
          ? rawName
          : props.road_tier === 'minor'
          ? 'Small Local Route'
          : props.road_tier === 'residential'
          ? 'Residential Street'
          : 'Connecting Street';

        const tierBadge =
          props.road_tier === 'minor'
            ? '<span class="road-popup-tier minor">Small Route / Galli</span>'
            : props.road_tier === 'residential'
            ? '<span class="road-popup-tier residential">Residential Street</span>'
            : props.road_tier === 'secondary'
            ? '<span class="road-popup-tier secondary">Secondary Road</span>'
            : '<span class="road-popup-tier major">Major Arterial</span>';

        const state = props.state || 'OPEN';
        const stateColor =
          state === 'BLOCKED'
            ? '#dc2626'
            : state === 'HIGH_RISK'
            ? '#d97706'
            : state === 'RESTRICTED'
            ? '#7c3aed'
            : '#16a34a';
        const stateLabel =
          state === 'BLOCKED'
            ? 'BLOCKED'
            : state === 'HIGH_RISK'
            ? 'HIGH RISK'
            : state === 'RESTRICTED'
            ? 'RESTRICTED'
            : 'OPEN • Navigable';

        const lengthFormatted = props.length_m ? `${Math.round(props.length_m)}m` : '';

        const html = `
          <div class="road-hover-tooltip-content">
            <div class="road-popup-title">${roadName}</div>
            <div class="road-popup-badges">${tierBadge}</div>
            <div class="road-popup-meta">
              ${lengthFormatted ? `<span>Length: ${lengthFormatted}</span>` : ''}
              <span style="color:${stateColor};font-weight:700;">● ${stateLabel}</span>
            </div>
          </div>
        `;

        if (!roadTooltipRef.current) {
          roadTooltipRef.current = new Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 12,
            className: 'custom-road-popup',
          });
        }
        roadTooltipRef.current.setLngLat(e.lngLat).setHTML(html).addTo(map);
      } else {
        canvas.style.cursor = '';
        if (roadTooltipRef.current) {
          roadTooltipRef.current.remove();
          roadTooltipRef.current = null;
        }
      }
    };

    const handleMouseLeave = () => {
      canvas.style.cursor = '';
      if (roadTooltipRef.current) {
        roadTooltipRef.current.remove();
        roadTooltipRef.current = null;
      }
    };

    map.on('mousemove', handleMouseMove);
    map.on('mouseout', handleMouseLeave);

    return () => {
      map.off('mousemove', handleMouseMove);
      map.off('mouseout', handleMouseLeave);
      canvas.style.cursor = '';
      if (roadTooltipRef.current) {
        roadTooltipRef.current.remove();
        roadTooltipRef.current = null;
      }
    };
  }, [clickAction, appMode, showCoveredRoads]);

  // Update Start & Destination Markers on map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Start marker (hidden during active turn-by-turn navigation so 3D arrow puck is unobstructed)
    if (startCoords && !isNavigating) {
      if (startMarkerRef.current) {
        startMarkerRef.current.getElement().style.display = 'flex';
        startMarkerRef.current.setLngLat(startCoords);
      } else {
        const el = createPointMarkerElement('A', 'marker-start');
        startMarkerRef.current = new Marker({ element: el, anchor: 'center' })
          .setLngLat(startCoords)
          .addTo(map);
      }
    } else if (startMarkerRef.current) {
      if (isNavigating) {
        startMarkerRef.current.getElement().style.display = 'none';
      } else {
        startMarkerRef.current.remove();
        startMarkerRef.current = null;
      }
    }

    // Destination marker
    if (destCoords) {
      if (destMarkerRef.current) {
        destMarkerRef.current.setLngLat(destCoords);
      } else {
        const el = createPointMarkerElement('B', 'marker-dest');
        destMarkerRef.current = new Marker({ element: el, anchor: 'center' })
          .setLngLat(destCoords)
          .addTo(map);
      }
    } else if (destMarkerRef.current) {
      destMarkerRef.current.remove();
      destMarkerRef.current = null;
    }
  }, [startCoords, destCoords, isNavigating]);

  // Setup / Update Road Network GeoJSON Source & High-Clarity Multi-Tier Layers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const setupRoadLayers = () => {
      if (!map.getStyle()) return;

      const sourceId = 'road-network-source';
      const emptyGeoJSON = { type: 'FeatureCollection', features: [] };
      const data = networkGeoJSON || emptyGeoJSON;

      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: 'geojson',
          data,
          tolerance: 0.5,
        });

        // 1. Open Roads Layer: Highlighted in clean Emerald Green for coverage inspection
        // Clickable in Disaster Mode when user selects a road to apply closures.
        map.addLayer({
          id: 'road-network-normal',
          type: 'line',
          source: sourceId,
          filter: ['==', ['get', 'state'], 'OPEN'],
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
            'visibility': showCoveredRoadsRef.current ? 'visible' : 'none',
          },
          paint: {
            'line-color': '#059669', // Vivid Emerald Green for coverage inspection
            'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.4, 11, 2.2, 14, 3.5, 18, 6.0],
            'line-opacity': showCoveredRoadsRef.current ? 0.85 : 0,
          },
        });

        // 2. High Risk Roads Layer (Vivid Amber Dashed)
        map.addLayer({
          id: 'road-network-risk',
          type: 'line',
          source: sourceId,
          filter: ['==', ['get', 'state'], 'HIGH_RISK'],
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#d97706',
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 14, 5.0, 18, 8.5],
            'line-dasharray': [3, 1.5],
          },
        });

        // 3. Restricted Roads Layer (Purple)
        map.addLayer({
          id: 'road-network-restricted',
          type: 'line',
          source: sourceId,
          filter: ['==', ['get', 'state'], 'RESTRICTED'],
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#7c3aed',
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 14, 5.0, 18, 8.5],
          },
        });

        // 4. Blocked Roads Layer (Bold Crimson Dashed)
        map.addLayer({
          id: 'road-network-blocked',
          type: 'line',
          source: sourceId,
          filter: ['==', ['get', 'state'], 'BLOCKED'],
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#dc2626',
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3.0, 14, 6.0, 18, 9.5],
            'line-dasharray': [2, 1.5],
          },
        });
      } else {
        const src = map.getSource(sourceId) as any;
        src.setData(data);
      }

      // Synchronize visibility of normal road layer immediately
      if (map.getLayer('road-network-normal')) {
        map.setLayoutProperty(
          'road-network-normal',
          'visibility',
          showCoveredRoadsRef.current ? 'visible' : 'none'
        );
        map.setPaintProperty(
          'road-network-normal',
          'line-opacity',
          showCoveredRoadsRef.current ? 0.85 : 0
        );
      }
    };

    setupRoadLayers();
  }, [networkGeoJSON, isMapLoaded]);

  // Dynamically update road network inspection highlight visibility (instant GPU toggle)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (map.getLayer('road-network-normal')) {
      const targetVis = showCoveredRoads ? 'visible' : 'none';
      const targetOpacity = showCoveredRoads ? 0.85 : 0;
      map.setLayoutProperty('road-network-normal', 'visibility', targetVis);
      map.setPaintProperty('road-network-normal', 'line-opacity', targetOpacity);
    }
  }, [showCoveredRoads]);

  // Setup / Update Active Scenario Closures GeoJSON Source & Layers (Fast real-time overlay)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const setupClosureLayers = () => {
      if (!map.getStyle()) return;

      const sourceId = 'road-closures-source';
      const emptyGeoJSON = { type: 'FeatureCollection', features: [] };
      const data = closuresGeoJSON || emptyGeoJSON;

      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: 'geojson',
          data,
        });

        // 1. Blocked Roads Halo / Glow (Vivid Dark Red Casing)
        map.addLayer({
          id: 'closure-blocked-glow',
          type: 'line',
          source: sourceId,
          filter: ['==', ['get', 'state'], 'BLOCKED'],
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#7f1d1d',
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 6.0, 14, 10.0, 18, 16.0],
            'line-opacity': 0.7,
          },
        });

        // 2. Blocked Roads Core (Bold Crimson Dashed)
        map.addLayer({
          id: 'closure-blocked-core',
          type: 'line',
          source: sourceId,
          filter: ['==', ['get', 'state'], 'BLOCKED'],
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#ef4444',
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3.5, 14, 6.5, 18, 10.5],
            'line-dasharray': [2, 1.5],
          },
        });

        // 3. High Risk Roads (Vivid Amber Dashed)
        map.addLayer({
          id: 'closure-risk-layer',
          type: 'line',
          source: sourceId,
          filter: ['==', ['get', 'state'], 'HIGH_RISK'],
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#f59e0b',
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4.0, 14, 7.0, 18, 11.0],
            'line-dasharray': [3, 1.5],
          },
        });

        // 4. Restricted Roads (Royal Purple Solid)
        map.addLayer({
          id: 'closure-restricted-layer',
          type: 'line',
          source: sourceId,
          filter: ['==', ['get', 'state'], 'RESTRICTED'],
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#8b5cf6',
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3.5, 14, 6.5, 18, 10.0],
          },
        });
      } else {
        const src = map.getSource(sourceId) as any;
        src.setData(data);
      }
    };

    setupClosureLayers();
  }, [closuresGeoJSON, isMapLoaded]);

  // Setup / Update Hazards GeoJSON Source & Layers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const updateHazards = () => {
      if (!map.getStyle()) return;
      console.log('[ResQ Map] updateHazards called. hazards count:', hazards.length, 'preview:', Boolean(hazardPreviewCircle));

      const sourceId = 'hazard-zones-source';
      const features: any[] = [];

      for (const h of hazards) {
        let geom: any = h.geometry;
        let centerPoint: [number, number] | null = null;
        if (geom) {
          if (typeof geom === 'string') {
            try {
              geom = JSON.parse(geom);
            } catch (e) {}
          }
          if (geom.type === 'Circle' && geom.center && geom.radius_m) {
            centerPoint = [geom.center[0], geom.center[1]];
            geom = createCirclePolygon(geom.center[0], geom.center[1], geom.radius_m);
          } else if (geom.type === 'Polygon' && geom.coordinates?.[0]?.[0]) {
            centerPoint = [geom.coordinates[0][0][0], geom.coordinates[0][0][1]];
          }
        }
        if (geom) {
          features.push({
            type: 'Feature',
            geometry: geom,
            properties: {
              id: h.id,
              name: h.name,
              hazard_type: h.hazard_type,
              severity: h.severity,
              impact_mode: h.impact_mode,
              is_center: false,
            },
          });
        }
        if (centerPoint) {
          features.push({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: centerPoint,
            },
            properties: {
              id: `point_${h.id}`,
              name: h.name,
              is_center: true,
            },
          });
        }
      }

      // Dynamic preview of hazard zone being defined
      if (hazardPreviewCircle && hazardPreviewCircle.center && hazardPreviewCircle.radius_m) {
        features.push({
          type: 'Feature',
          geometry: createCirclePolygon(
            hazardPreviewCircle.center[0],
            hazardPreviewCircle.center[1],
            hazardPreviewCircle.radius_m
          ),
          properties: {
            id: 'hazard_preview_circle',
            name: 'Preview Hazard Zone',
            hazard_type: 'preview',
            severity: 'critical',
            impact_mode: 'preview',
            is_center: false,
          },
        });
      }

      const data = { type: 'FeatureCollection', features };

      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: 'geojson',
          data,
        });

        map.addLayer({
          id: 'hazard-zones-fill',
          type: 'fill',
          source: sourceId,
          filter: ['!=', ['get', 'is_center'], true],
          paint: {
            'fill-color': '#ef4444',
            'fill-opacity': 0.35,
          },
        });

        map.addLayer({
          id: 'hazard-zones-line',
          type: 'line',
          source: sourceId,
          filter: ['!=', ['get', 'is_center'], true],
          paint: {
            'line-color': '#b91c1c',
            'line-width': 2.5,
            'line-dasharray': [3, 2],
          },
        });

        map.addLayer({
          id: 'hazard-zones-point',
          type: 'circle',
          source: sourceId,
          filter: ['==', ['get', 'is_center'], true],
          paint: {
            'circle-radius': 7,
            'circle-color': '#dc2626',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2.5,
          },
        });
      } else {
        const src = map.getSource(sourceId) as any;
        src.setData(data);
      }
    };

  updateHazards();
}, [hazards, hazardPreviewCircle, isMapLoaded]);

  // Setup / Update Route Lines (Active & Comparison)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const updateRoutes = () => {
      if (!map.getStyle()) return;

      const sourceId = 'routes-source';
      const features: any[] = [];

      // 1. Baseline comparison route (if rerouted)
      if (
        routeComparison &&
        routeComparison.is_rerouted &&
        routeComparison.baseline_route &&
        routeComparison.baseline_route.geometry
      ) {
        features.push({
          type: 'Feature',
          geometry: routeComparison.baseline_route.geometry,
          properties: {
            route_type: 'baseline_comparison',
          },
        });
      }

      // 2. Active calculated route
      if (routeResult && routeResult.status === 'success' && routeResult.geometry) {
        features.push({
          type: 'Feature',
          geometry: routeResult.geometry,
          properties: {
            route_type: 'active_route',
          },
        });
      }

      const data = { type: 'FeatureCollection', features };

      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: 'geojson',
          data,
        });

        // Baseline comparison route (dashed slate line)
        map.addLayer({
          id: 'route-baseline-line',
          type: 'line',
          source: sourceId,
          filter: ['==', ['get', 'route_type'], 'baseline_comparison'],
          paint: {
            'line-color': '#64748b',
            'line-width': 4,
            'line-dasharray': [2, 2],
            'line-opacity': 0.85,
          },
        });

        // Active route white casing
        map.addLayer({
          id: 'route-active-casing',
          type: 'line',
          source: sourceId,
          filter: ['==', ['get', 'route_type'], 'active_route'],
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#ffffff',
            'line-width': 10,
            'line-opacity': 0.95,
          },
        });

        // Active route primary vibrant blue line
        map.addLayer({
          id: 'route-active-line',
          type: 'line',
          source: sourceId,
          filter: ['==', ['get', 'route_type'], 'active_route'],
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#2563eb',
            'line-width': 6,
            'line-opacity': 1.0,
          },
        });
      } else {
        const src = map.getSource(sourceId) as any;
        src.setData(data);
      }
    };

    updateRoutes();
  }, [routeResult, routeComparison, isMapLoaded]);

  // Setup / Update Emergency Facilities Layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const updateFacilities = () => {
      if (!map.getStyle()) return;

      const sourceId = 'facilities-source';
    const data = facilitiesGeoJSON || { type: 'FeatureCollection', features: [] };

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'geojson',
        data,
      });

      // Circle marker layer with accessible category colors
      map.addLayer({
        id: 'facilities-circles',
        type: 'circle',
        source: sourceId,
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 5,
            14, 8,
            18, 12,
          ],
          'circle-color': [
            'match',
            ['get', 'category'],
            'hospital', '#e53935',
            'fire_station', '#ff5722',
            'police', '#1976d2',
            'shelter', '#2e7d32',
            'warehouse', '#8e24aa',
            /* default */ '#d97706',
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.95,
        },
      });

      // Click facility marker to show popup
      map.on('click', 'facilities-circles', (e: any) => {
        if (!e.features || e.features.length === 0) return;
        const feat = e.features[0];
        const props = feat.properties;
        const coords = (feat.geometry as any).coordinates.slice();

        const catEmoji =
          props.category === 'hospital'
            ? '🏥'
            : props.category === 'fire_station'
            ? '🚒'
            : props.category === 'police'
            ? '🚓'
            : props.category === 'shelter'
            ? '⛺'
            : props.category === 'warehouse'
            ? '📦'
            : '📍';

        const popupNode = document.createElement('div');
        popupNode.className = 'facility-popup-card';
        popupNode.innerHTML = `
          <div class="facility-popup-header">
            <span class="facility-popup-cat-badge">${catEmoji} ${props.category.replace('_', ' ').toUpperCase()}</span>
          </div>
          <div class="facility-popup-title">${props.name}</div>
          ${props.address ? `<div class="facility-popup-meta">📍 ${props.address}</div>` : ''}
          ${props.phone ? `<div class="facility-popup-meta">📞 ${props.phone}</div>` : ''}
          ${props.distance_m ? `<div class="facility-popup-dist">${props.distance_m < 1000 ? Math.round(props.distance_m) + ' m away' : (props.distance_m / 1000).toFixed(1) + ' km away'}</div>` : ''}
          <button type="button" class="facility-popup-route-btn" id="popup-route-btn">
            🧭 Route to Facility
          </button>
        `;

        const popup = new Popup({ offset: 12, closeButton: true })
          .setLngLat(coords)
          .setDOMContent(popupNode)
          .addTo(map);

        const btn = popupNode.querySelector('#popup-route-btn');
        if (btn) {
          btn.addEventListener('click', () => {
            popup.remove();
            if (onSelectFacilityRef.current) {
              onSelectFacilityRef.current({
                id: props.id,
                name: props.name,
                category: props.category,
                lat: coords[1],
                lon: coords[0],
              });
            }
          });
        }
      });

      // Cursor changes on hover
      map.on('mouseenter', 'facilities-circles', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'facilities-circles', () => {
        map.getCanvas().style.cursor = '';
      });
    } else {
      const src = map.getSource(sourceId) as any;
      src.setData(data);
    }
  };

  updateFacilities();
}, [facilitiesGeoJSON, isMapLoaded]);

  // Active Navigation Camera Follow, 3D Perspective Tilt & Bearing Alignment
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (isNavigating && coordinates) {
      let forwardBearing = coordinates.heading || 0;
      const polyCoords = routeResult?.geometry?.coordinates;
      if ((!forwardBearing || isNaN(forwardBearing)) && polyCoords && polyCoords.length > 1) {
        forwardBearing = calculateBearing(polyCoords[0][0], polyCoords[0][1], polyCoords[1][0], polyCoords[1][1]);
      }

      map.easeTo({
        center: [coordinates.longitude, coordinates.latitude],
        zoom: 17,
        pitch: 52,
        bearing: forwardBearing,
        duration: 800,
      });
    } else if (!isNavigating && map.getPitch() > 0) {
      // Smoothly return to top-down 2D map when navigation ends
      map.easeTo({
        pitch: 0,
        bearing: 0,
        duration: 600,
      });
    }
  }, [isNavigating, coordinates, routeResult]);

  return (
    <div className="map-wrapper">
      <div
        ref={mapContainerRef}
        className="map-container"
        id="map"
        aria-label="Interactive Map View"
      />
    </div>
  );
};
