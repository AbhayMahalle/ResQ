import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  activateScenario,
  applyClosure,
  bulkRemoveClosures,
  calculateRoute,
  compareRoutes,
  createHazard,
  createScenario,
  deleteHazard,
  deleteScenario,
  duplicateScenario,
  fetchClosures,
  fetchFacilities,
  fetchHazards,
  fetchNetworkGeoJSON,
  fetchNetworks,
  fetchScenarioClosuresGeoJSON,
  fetchScenarios,
  removeClosure,
  resetScenario,
} from './api';
import { getCurrentDeviceLocation, getGeolocationErrorMessage } from './utils/geolocation';
import { InteractiveMap } from './components/InteractiveMap';
import { TopSearchBar } from './components/TopSearchBar';
import { QuickActionChips } from './components/QuickActionChips';
import { SidebarDock } from './components/SidebarDock';
import { ContextPanels } from './components/ContextPanels';
import { MapControlsFab } from './components/MapControlsFab';
import { PickingBanner } from './components/PickingBanner';
import { StatusBanner } from './components/StatusBanner';
import { RoadConditionModal } from './components/RoadConditionModal';
import { AddHazardModal } from './components/AddHazardModal';
import { NavigationHud } from './components/NavigationHud';
import { GLOBAL_FALLBACK_CENTER } from './config';
import type {
  ActivePanelTab,
  AppMode,
  ClickAction,
  DeviceCoordinates,
  EmergencyFacility,
  FlyToCommand,
  Hazard,
  NetworkMetadata,
  RoadOverride,
  RouteComparisonResponse,
  RouteResponse,
  RoutingAlgorithm,
  RoutingOptimization,
  Scenario,
  SearchResultItem,
  SelectedRoadInfo,
} from './types';
import './App.css';

export const App: React.FC = () => {
  // Live location & map state
  const [coordinates, setCoordinates] = useState<DeviceCoordinates | null>(null);
  const [isInitialLocating, setIsInitialLocating] = useState<boolean>(true);
  const [isRefreshingLocation, setIsRefreshingLocation] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [gpsErrorMessage, setGpsErrorMessage] = useState<string | null>(null);
  const [initialResolved, setInitialResolved] = useState<boolean>(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>(GLOBAL_FALLBACK_CENTER);
  const [flyToCommand, setFlyToCommand] = useState<FlyToCommand | null>(null);
  const [mapCommand, setMapCommand] = useState<{
    type: 'zoom_in' | 'zoom_out' | 'reset_north';
    id: number;
  } | null>(null);

  // Layout & active panel state
  const [activeTab, setActiveTab] = useState<ActivePanelTab>('navigate');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // App & click interaction modes
  const [appMode, setAppMode] = useState<AppMode>('routing');
  const [clickAction, setClickAction] = useState<ClickAction>('none');

  // Network state
  const [networks, setNetworks] = useState<NetworkMetadata[]>([]);
  const [activeNetwork, setActiveNetwork] = useState<NetworkMetadata | null>(null);
  const [networkGeoJSON, setNetworkGeoJSON] = useState<any>(null);
  const [showCoveredRoads, setShowCoveredRoads] = useState<boolean>(true);

  // Scenario state
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null);
  const [closures, setClosures] = useState<RoadOverride[]>([]);
  const [closuresGeoJSON, setClosuresGeoJSON] = useState<any>(null);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [isApplyingRoadCondition, setIsApplyingRoadCondition] = useState<boolean>(false);

  // Emergency Facilities state
  const [facilities, setFacilities] = useState<EmergencyFacility[]>([]);
  const [facilitiesGeoJSON, setFacilitiesGeoJSON] = useState<any>(null);
  const [isLoadingFacilities, setIsLoadingFacilities] = useState<boolean>(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);

  // Routing state
  const [startCoords, setStartCoords] = useState<[number, number] | null>(null);
  const [destCoords, setDestCoords] = useState<[number, number] | null>(null);
  const [destinationName, setDestinationName] = useState<string>('');
  const [algorithm, setAlgorithm] = useState<RoutingAlgorithm>('dijkstra');
  const [optimization, setOptimization] = useState<RoutingOptimization>('distance');
  const [isCalculatingRoute, setIsCalculatingRoute] = useState<boolean>(false);
  const [routeResult, setRouteResult] = useState<RouteResponse | null>(null);
  const [routeComparison, setRouteComparison] = useState<RouteComparisonResponse | null>(null);

  // Active Turn-by-Turn Navigation State
  const [isNavigating, setIsNavigating] = useState<boolean>(false);

  // Modals state
  const [selectedRoad, setSelectedRoad] = useState<SelectedRoadInfo | null>(null);
  const [isAddHazardOpen, setIsAddHazardOpen] = useState<boolean>(false);
  const [hazardModalCenter, setHazardModalCenter] = useState<[number, number] | null>(null);
  const [hazardPreviewRadius, setHazardPreviewRadius] = useState<number>(300);

  useEffect(() => {
    const handleSelectRoadEvent = (e: any) => {
      if (e.detail) {
        setSelectedRoad(e.detail);
      }
    };
    window.addEventListener('resq:select_road', handleSelectRoadEvent);
    return () => window.removeEventListener('resq:select_road', handleSelectRoadEvent);
  }, []);

  const isMountedRef = useRef<boolean>(true);
  const loadedNetworkIdRef = useRef<string | null>(null);

  // Unified count of unique closed roads
  const closedRoadsCount = React.useMemo(() => {
    const roadKeys = new Set<string>();
    for (const c of closures) {
      const validNotes = c.notes && c.notes.trim() && c.notes !== 'undefined' && c.notes !== 'nan';
      const key = c.way_id
        ? `way_${c.way_id}`
        : validNotes
        ? `name_${c.notes!.trim().toLowerCase()}`
        : `edge_${Math.min(c.edge_u, c.edge_v)}_${Math.max(c.edge_u, c.edge_v)}`;
      roadKeys.add(key);
    }
    return roadKeys.size;
  }, [closures]);

  // 1. Initial live location detection
  useEffect(() => {
    isMountedRef.current = true;

    getCurrentDeviceLocation()
      .then((coords: DeviceCoordinates) => {
        if (!isMountedRef.current) return;
        setCoordinates(coords);
        setGpsErrorMessage(null);
        setErrorMessage(null);
        setMapCenter([coords.longitude, coords.latitude]);
        // Set live location as default route start
        setStartCoords([coords.longitude, coords.latitude]);
        setFlyToCommand({
          center: [coords.longitude, coords.latitude],
          zoom: 14,
          id: Date.now(),
        });
      })
      .catch((err: any) => {
        if (!isMountedRef.current) return;
        const msg =
          err instanceof GeolocationPositionError
            ? getGeolocationErrorMessage(err)
            : err?.message || 'Unable to retrieve live device location.';
        setGpsErrorMessage(msg);
        setErrorMessage(msg);
        // Fallback default route origin to Pune Central Station area: [73.8567, 18.5204]
        setStartCoords((prev) => prev || [73.8567, 18.5204]);
        setMapCenter((prev) => (prev[0] === 0 && prev[1] === 20 ? [73.8567, 18.5204] : prev));
      })
      .finally(() => {
        if (isMountedRef.current) {
          setIsInitialLocating(false);
          setInitialResolved(true);
        }
      });

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 2. Continuous watchPosition tracking when navigating
  useEffect(() => {
    if (!isNavigating) return;

    if (!navigator.geolocation) {
      setErrorMessage('Geolocation is not supported on this device.');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!isMountedRef.current) return;
        const newCoords: DeviceCoordinates = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
        };
        setCoordinates(newCoords);
        setGpsErrorMessage(null);
        setStartCoords([newCoords.longitude, newCoords.latitude]);
      },
      (err) => {
        console.warn('Geolocation watch error:', err.message);
        if (isMountedRef.current) setGpsErrorMessage(err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isNavigating]);

  // 3. Refresh device location
  const handleRefreshLocation = useCallback(() => {
    setIsRefreshingLocation(true);
    setErrorMessage(null);
    setGpsErrorMessage(null);

    getCurrentDeviceLocation()
      .then((coords: DeviceCoordinates) => {
        if (!isMountedRef.current) return;
        setCoordinates(coords);
        setGpsErrorMessage(null);
        setErrorMessage(null);
        setMapCenter([coords.longitude, coords.latitude]);
        // Always update route origin when user refreshes location
        setStartCoords([coords.longitude, coords.latitude]);
        setFlyToCommand({
          center: [coords.longitude, coords.latitude],
          zoom: 14,
          id: Date.now(),
        });
      })
      .catch((err: any) => {
        if (!isMountedRef.current) return;
        const msg =
          err instanceof GeolocationPositionError
            ? getGeolocationErrorMessage(err)
            : err?.message || 'Unable to retrieve live device location.';
        setGpsErrorMessage(msg);
        setErrorMessage(msg);
        // Fallback default route origin to Pune Central Station area: [73.8567, 18.5204]
        setStartCoords((prev) => prev || [73.8567, 18.5204]);
        setMapCenter((prev) => (prev[0] === 0 && prev[1] === 20 ? [73.8567, 18.5204] : prev));
      })
      .finally(() => {
        if (isMountedRef.current) {
          setIsRefreshingLocation(false);
        }
      });
  }, []);

  // 4. Load available road networks from database
  const loadNetworks = useCallback(async () => {
    try {
      const data = await fetchNetworks();
      setNetworks(data);
      if (data.length > 0 && !activeNetwork) {
        setActiveNetwork(data[0]);
        setStartCoords((prev) => prev || [73.8567, 18.5204]);
      }
    } catch (err: any) {
      console.error('Failed to load road networks:', err);
    }
  }, [activeNetwork]);

  useEffect(() => {
    loadNetworks();
  }, [loadNetworks]);

  // 5. Load emergency facilities for active network
  const loadFacilitiesData = useCallback(async (netId: string, filterCat?: string | null) => {
    setIsLoadingFacilities(true);
    try {
      const res = await fetchFacilities({
        network_id: netId,
        category: filterCat || undefined,
        user_lat: coordinates?.latitude,
        user_lon: coordinates?.longitude,
      });
      setFacilities(res.facilities || []);
      setFacilitiesGeoJSON(res.geojson || null);
    } catch (err) {
      console.warn('Failed to load facilities:', err);
    } finally {
      setIsLoadingFacilities(false);
    }
  }, [coordinates?.latitude, coordinates?.longitude]);

  // 6. Refresh scenario data (closures & hazards)
  const refreshScenarioData = useCallback(
    async (netId: string, scenId?: string | null) => {
      try {
        const scens = await fetchScenarios(netId);
        setScenarios(scens);

        // Retrieve previously active scenario from localStorage for persistent state across browser reloads
        const storedScenId = localStorage.getItem(`resq_active_scenario_${netId}`);
        const targetScenId = scenId || storedScenId;

        const currentScen = targetScenId
          ? scens.find((s) => s.id === targetScenId) || scens.find((s) => s.is_active) || scens[0]
          : scens.find((s) => s.is_active) || scens[0];

        setActiveScenario(currentScen || null);

        if (currentScen) {
          localStorage.setItem(`resq_active_scenario_${netId}`, currentScen.id);
          const [cList, hList, cGeo] = await Promise.all([
            fetchClosures(currentScen.id),
            fetchHazards(currentScen.id),
            fetchScenarioClosuresGeoJSON(currentScen.id),
          ]);
          setClosures(cList);
          setHazards(hList);
          setClosuresGeoJSON(cGeo);

          if (loadedNetworkIdRef.current !== netId) {
            loadedNetworkIdRef.current = netId;
            const geoData = await fetchNetworkGeoJSON(netId);
            setNetworkGeoJSON(geoData);
          }
        } else {
          setClosures([]);
          setHazards([]);
          setClosuresGeoJSON(null);
          if (loadedNetworkIdRef.current !== netId) {
            loadedNetworkIdRef.current = netId;
            const geoData = await fetchNetworkGeoJSON(netId);
            setNetworkGeoJSON(geoData);
          }
        }

        // Also fetch facilities for this network
        loadFacilitiesData(netId, selectedCategoryFilter);
      } catch (err: any) {
        console.error('Failed to refresh scenario data:', err);
      }
    },
    [loadFacilitiesData, selectedCategoryFilter]
  );

  const activeNetworkId = activeNetwork?.id;
  const activeScenarioId = activeScenario?.id;

  useEffect(() => {
    if (activeNetworkId) {
      refreshScenarioData(activeNetworkId, activeScenarioId);
    }
  }, [activeNetworkId, activeScenarioId]);

  // Auto-activate network if user's location is inside or near its bounds
  useEffect(() => {
    if (coordinates && networks.length > 0) {
      const userLon = coordinates.longitude;
      const userLat = coordinates.latitude;
      const localNet = networks.find((net: NetworkMetadata) => {
        if (!net.bbox || net.bbox.length !== 4) return false;
        const [minX, minY, maxX, maxY] = net.bbox;
        return (
          userLon >= minX - 0.05 &&
          userLon <= maxX + 0.05 &&
          userLat >= minY - 0.05 &&
          userLat <= maxY + 0.05
        );
      });
      if (localNet && activeNetwork?.id !== localNet.id) {
        setActiveNetwork(localNet);
      }
    }
  }, [coordinates, networks, activeNetwork?.id]);

  // 7. Calculate route
  const calculateCurrentRoute = useCallback(async (overrideStart?: [number, number], overrideDest?: [number, number]) => {
    // Strictly validate that overrideStart and overrideDest are valid numeric [lon, lat] coordinate pairs.
    // This guards against synthetic click events (e.g. from button onClick) which carry DOM HTMLButtonElement circular structures.
    const validStart =
      Array.isArray(overrideStart) &&
      overrideStart.length === 2 &&
      typeof overrideStart[0] === 'number' &&
      !isNaN(overrideStart[0]) &&
      typeof overrideStart[1] === 'number' &&
      !isNaN(overrideStart[1])
        ? (overrideStart as [number, number])
        : null;

    const validDest =
      Array.isArray(overrideDest) &&
      overrideDest.length === 2 &&
      typeof overrideDest[0] === 'number' &&
      !isNaN(overrideDest[0]) &&
      typeof overrideDest[1] === 'number' &&
      !isNaN(overrideDest[1])
        ? (overrideDest as [number, number])
        : null;

    const currentNet = activeNetwork || (networks.length > 0 ? networks[0] : null);
    const defaultCenter: [number, number] =
      currentNet?.bbox && currentNet.bbox.length === 4
        ? [(currentNet.bbox[0] + currentNet.bbox[2]) / 2, (currentNet.bbox[1] + currentNet.bbox[3]) / 2]
        : [73.8567, 18.5204];

    const start =
      validStart ||
      startCoords ||
      (coordinates ? [coordinates.longitude, coordinates.latitude] : null) ||
      defaultCenter;

    const dest = validDest || destCoords;

    console.log('[ResQ] calculateCurrentRoute called', { start, dest, activeNetwork: currentNet?.id });
    if (!currentNet || !start || !dest) {
      console.warn('[ResQ] calculateCurrentRoute skipped - missing params', { hasNet: Boolean(currentNet), hasStart: Boolean(start), hasDest: Boolean(dest) });
      return;
    }

    // Ensure startCoords state stays in sync if it was previously unset
    if (!startCoords) {
      setStartCoords(start);
    }

    setIsCalculatingRoute(true);

    try {
      console.log('[ResQ] calling calculateRoute API...');
      const res = await calculateRoute({
        network_id: currentNet.id,
        scenario_id: activeScenario?.id,
        start_coords: start,
        destination_coords: dest,
        algorithm,
        optimization,
      });
      console.log('[ResQ] calculateRoute API returned status:', res?.status, 'distance:', res?.total_distance_m);

      if (!isMountedRef.current) return;
      setRouteResult(res);

      // Asynchronously fetch scenario detour comparison without blocking route preview
      if (activeScenario?.id) {
        compareRoutes({
          network_id: currentNet.id,
          scenario_id: activeScenario.id,
          start_coords: start,
          destination_coords: dest,
          algorithm,
          optimization,
        })
          .then((comp) => {
            if (isMountedRef.current) setRouteComparison(comp);
          })
          .catch(() => {});
      } else {
        setRouteComparison(null);
      }

      if (res.status !== 'success') {
        setErrorMessage(res.message);
      } else if (res.geometry?.coordinates && res.geometry.coordinates.length > 0) {
        const coords = res.geometry.coordinates as [number, number][];
        let minX = coords[0][0], maxX = coords[0][0];
        let minY = coords[0][1], maxY = coords[0][1];
        for (const [x, y] of coords) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        // Expand slightly if points are extremely close
        const spanX = Math.max(maxX - minX, 0.006);
        const spanY = Math.max(maxY - minY, 0.006);
        const midX = (minX + maxX) / 2;
        const midY = (minY + maxY) / 2;
        setFlyToCommand({
          center: [midX, midY],
          bbox: [midX - spanX / 2 - 0.002, midY - spanY / 2 - 0.002, midX + spanX / 2 + 0.002, midY + spanY / 2 + 0.002],
          id: Date.now(),
        });
      }
    } catch (err: any) {
      console.error('[ResQ] calculateRoute exception:', err);
      if (!isMountedRef.current) return;
      setErrorMessage(err.message || 'Route calculation failed.');
    } finally {
      if (isMountedRef.current) setIsCalculatingRoute(false);
    }
  }, [activeNetwork, networks, startCoords, destCoords, coordinates, activeScenario, algorithm, optimization]);

  // Recalculate route whenever scenario changes or endpoints change
  useEffect(() => {
    if (startCoords && destCoords) {
      void calculateCurrentRoute();
    }
  }, [startCoords, destCoords, algorithm, optimization, activeScenario?.id, calculateCurrentRoute]);

  // 8. Place Selection Handler (from Autocomplete search bar)
  const handleSelectPlace = useCallback(
    (place: SearchResultItem) => {
      console.log('[ResQ] handleSelectPlace called with place:', place.name, place.lon, place.lat);
      const targetCoords: [number, number] = [place.lon, place.lat];
      setDestCoords(targetCoords);
      setDestinationName(place.name);

      const currentNet = activeNetwork || (networks.length > 0 ? networks[0] : null);
      const defaultCenter: [number, number] =
        currentNet?.bbox && currentNet.bbox.length === 4
          ? [(currentNet.bbox[0] + currentNet.bbox[2]) / 2, (currentNet.bbox[1] + currentNet.bbox[3]) / 2]
          : [73.8567, 18.5204];

      const effectiveStart: [number, number] =
        startCoords ||
        (coordinates ? [coordinates.longitude, coordinates.latitude] : null) ||
        defaultCenter;

      setStartCoords(effectiveStart);

      // Open sidebar and switch to Navigate panel so user sees route metrics & Start Journey button
      setIsSidebarOpen(true);
      setActiveTab('navigate');

      // Instantly compute and preview the route on the map
      void calculateCurrentRoute(effectiveStart, targetCoords);
    },
    [startCoords, coordinates, activeNetwork, networks, calculateCurrentRoute]
  );

  // 9. Route to Emergency Facility Handler
  const handleRouteToFacility = useCallback(
    (facility: { id: string; name: string; category: string; lat: number; lon: number }) => {
      console.log('[ResQ] handleRouteToFacility called with facility:', facility.name, facility.lon, facility.lat);
      const targetCoords: [number, number] = [facility.lon, facility.lat];
      setDestCoords(targetCoords);
      setDestinationName(facility.name);

      const currentNet = activeNetwork || (networks.length > 0 ? networks[0] : null);
      const defaultCenter: [number, number] =
        currentNet?.bbox && currentNet.bbox.length === 4
          ? [(currentNet.bbox[0] + currentNet.bbox[2]) / 2, (currentNet.bbox[1] + currentNet.bbox[3]) / 2]
          : [73.8567, 18.5204];

      const effectiveStart: [number, number] =
        startCoords ||
        (coordinates ? [coordinates.longitude, coordinates.latitude] : null) ||
        defaultCenter;

      setStartCoords(effectiveStart);
      setActiveTab('navigate');

      // Instantly compute and preview the route on the map
      void calculateCurrentRoute(effectiveStart, targetCoords);
    },
    [startCoords, coordinates, activeNetwork, networks, calculateCurrentRoute]
  );

  // 10. Start / End Navigation Journey
  const handleStartJourney = useCallback(() => {
    if (!routeResult || routeResult.status !== 'success') return;
    setIsNavigating(true);
    // Collapse sidebar context panel so navigation HUD takes focus
    setActiveTab('none');

    // Smoothly tilt and center on live location
    if (coordinates) {
      setFlyToCommand({
        center: [coordinates.longitude, coordinates.latitude],
        zoom: 16.5,
        id: Date.now(),
      });
    }
  }, [routeResult, coordinates]);

  const handleEndJourney = useCallback(() => {
    setIsNavigating(false);
    setActiveTab('navigate');
  }, []);

  const handleRecenterNavigation = useCallback(() => {
    if (coordinates) {
      setFlyToCommand({
        center: [coordinates.longitude, coordinates.latitude],
        zoom: 16.5,
        id: Date.now(),
      });
    }
  }, [coordinates]);

  // 11. Map Click Interaction
  const handleMapClickPoint = useCallback(
    (coords: [number, number]) => {
      if (clickAction === 'set_start') {
        setStartCoords(coords);
        setClickAction('none');
      } else if (clickAction === 'set_dest') {
        setDestCoords(coords);
        setDestinationName(`Point (${coords[1].toFixed(4)}°, ${coords[0].toFixed(4)}°)`);
        setClickAction('none');
      } else if (clickAction === 'add_hazard') {
        setHazardModalCenter(coords);
        setIsAddHazardOpen(true);
        setActiveTab('hazards');
        setClickAction('none');
      }
    },
    [clickAction]
  );

  // Reset to live location as origin
  const handleUseLiveLocationAsStart = useCallback(() => {
    if (coordinates) {
      setStartCoords([coordinates.longitude, coordinates.latitude]);
      setFlyToCommand({
        center: [coordinates.longitude, coordinates.latitude],
        zoom: 14,
        id: Date.now(),
      });
    } else {
      handleRefreshLocation();
    }
  }, [coordinates, handleRefreshLocation]);

  const handleSwapPoints = useCallback(() => {
    setStartCoords(destCoords);
    setDestCoords(startCoords);
    setDestinationName(startCoords ? `Point (${startCoords[1].toFixed(4)}°, ${startCoords[0].toFixed(4)}°)` : '');
  }, [startCoords, destCoords]);

  const handleClearPoints = useCallback(() => {
    setDestCoords(null);
    setDestinationName('');
    setRouteResult(null);
    setRouteComparison(null);
    setIsNavigating(false);
    // Keep live location as startCoords
    if (coordinates) {
      setStartCoords([coordinates.longitude, coordinates.latitude]);
    }
  }, [coordinates]);

  // Scenario operations (Persisted to SQLite database and localStorage)
  const handleSelectScenario = useCallback(
    async (scenId: string) => {
      if (activeNetwork) {
        localStorage.setItem(`resq_active_scenario_${activeNetwork.id}`, scenId);
        try {
          await activateScenario(scenId);
        } catch (e) {
          console.warn('Failed to activate scenario in DB:', e);
        }
        await refreshScenarioData(activeNetwork.id, scenId);
      }
    },
    [activeNetwork, refreshScenarioData]
  );

  const handleCreateScenario = useCallback(
    async (name: string) => {
      if (!activeNetwork) return;
      try {
        const created = await createScenario({ network_id: activeNetwork.id, name });
        try {
          await activateScenario(created.id);
        } catch (e) {
          console.warn('Failed to activate new scenario in DB:', e);
        }
        localStorage.setItem(`resq_active_scenario_${activeNetwork.id}`, created.id);
        await refreshScenarioData(activeNetwork.id, created.id);
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to create scenario.');
      }
    },
    [activeNetwork, refreshScenarioData]
  );

  const handleDuplicateScenario = useCallback(
    async (scenId: string) => {
      if (!activeNetwork) return;
      try {
        const dup = await duplicateScenario(scenId);
        try {
          await activateScenario(dup.id);
        } catch (e) {
          console.warn('Failed to activate duplicated scenario in DB:', e);
        }
        localStorage.setItem(`resq_active_scenario_${activeNetwork.id}`, dup.id);
        await refreshScenarioData(activeNetwork.id, dup.id);
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to duplicate scenario.');
      }
    },
    [activeNetwork, refreshScenarioData]
  );

  const handleResetScenario = useCallback(
    async (scenId: string) => {
      if (!activeNetwork) return;
      try {
        await resetScenario(scenId);
        await refreshScenarioData(activeNetwork.id, scenId);
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to reset scenario.');
      }
    },
    [activeNetwork, refreshScenarioData]
  );

  const handleDeleteScenario = useCallback(
    async (scenId: string) => {
      if (!activeNetwork) return;
      try {
        localStorage.removeItem(`resq_active_scenario_${activeNetwork.id}`);
        await deleteScenario(scenId);
        await refreshScenarioData(activeNetwork.id, null);
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to delete scenario.');
      }
    },
    [activeNetwork, refreshScenarioData]
  );

  const handleApplyRoadCondition = useCallback(
    async (params: any) => {
      if (!activeScenario || !activeNetwork) return;
      try {
        setIsApplyingRoadCondition(true);
        await applyClosure(activeScenario.id, params);
        const [cList, cGeo] = await Promise.all([
          fetchClosures(activeScenario.id),
          fetchScenarioClosuresGeoJSON(activeScenario.id),
        ]);
        setClosures(cList);
        setClosuresGeoJSON(cGeo);
        setSelectedRoad(null);

        // Immediately recalculate route if active
        if (startCoords && destCoords) {
          calculateCurrentRoute();
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to apply road condition.');
      } finally {
        setIsApplyingRoadCondition(false);
      }
    },
    [activeScenario, activeNetwork, startCoords, destCoords, calculateCurrentRoute]
  );

  const handleReopenRoad = useCallback(
    async (overrideId: string) => {
      if (!activeScenario || !activeNetwork) return;
      try {
        await removeClosure(activeScenario.id, overrideId);
        const [cList, cGeo] = await Promise.all([
          fetchClosures(activeScenario.id),
          fetchScenarioClosuresGeoJSON(activeScenario.id),
        ]);
        setClosures(cList);
        setClosuresGeoJSON(cGeo);

        // Immediately recalculate route if active
        if (startCoords && destCoords) {
          calculateCurrentRoute();
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to reopen road.');
      }
    },
    [activeScenario, activeNetwork, startCoords, destCoords, calculateCurrentRoute]
  );

  const handleReopenRoadGroup = useCallback(
    async (overrideIds: string[]) => {
      if (!activeScenario || !activeNetwork) return;
      try {
        await bulkRemoveClosures(activeScenario.id, { override_ids: overrideIds });
        const [cList, cGeo] = await Promise.all([
          fetchClosures(activeScenario.id),
          fetchScenarioClosuresGeoJSON(activeScenario.id),
        ]);
        setClosures(cList);
        setClosuresGeoJSON(cGeo);

        if (startCoords && destCoords) {
          calculateCurrentRoute();
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to reopen road.');
      }
    },
    [activeScenario, activeNetwork, startCoords, destCoords, calculateCurrentRoute]
  );

  const handleReopenAllClosures = useCallback(
    async () => {
      if (!activeScenario || !activeNetwork) return;
      try {
        await bulkRemoveClosures(activeScenario.id, { all_closures: true });
        const [cList, cGeo] = await Promise.all([
          fetchClosures(activeScenario.id),
          fetchScenarioClosuresGeoJSON(activeScenario.id),
        ]);
        setClosures(cList);
        setClosuresGeoJSON(cGeo);

        if (startCoords && destCoords) {
          calculateCurrentRoute();
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to reopen all roads.');
      }
    },
    [activeScenario, activeNetwork, startCoords, destCoords, calculateCurrentRoute]
  );

  const handleCreateHazard = useCallback(
    async (data: any) => {
      if (!activeScenario || !activeNetwork) return;
      try {
        await createHazard(activeScenario.id, data);
        await refreshScenarioData(activeNetwork.id, activeScenario.id);
        setIsAddHazardOpen(false);
        setHazardModalCenter(null);

        // Recalculate route if active
        if (startCoords && destCoords) {
          calculateCurrentRoute();
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to create hazard.');
      }
    },
    [activeScenario, activeNetwork, refreshScenarioData, startCoords, destCoords, calculateCurrentRoute]
  );

  const handleDeleteHazard = useCallback(
    async (hazardId: string) => {
      if (!activeScenario || !activeNetwork) return;
      try {
        await deleteHazard(activeScenario.id, hazardId);
        await refreshScenarioData(activeNetwork.id, activeScenario.id);

        // Recalculate route if active
        if (startCoords && destCoords) {
          calculateCurrentRoute();
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to delete hazard.');
      }
    },
    [activeScenario, activeNetwork, refreshScenarioData, startCoords, destCoords, calculateCurrentRoute]
  );

  const handleFlyToActiveNetwork = useCallback(() => {
    if (activeNetwork && activeNetwork.bbox && activeNetwork.bbox.length === 4) {
      const [min_lon, min_lat, max_lon, max_lat] = activeNetwork.bbox;
      const cLon = (min_lon + max_lon) / 2;
      const cLat = (min_lat + max_lat) / 2;
      setMapCenter([cLon, cLat]);
      setFlyToCommand({
        center: [cLon, cLat],
        bbox: activeNetwork.bbox,
        id: Date.now(),
      });
    }
  }, [activeNetwork]);

  return (
    <div className="resq-app-container">
      {/* 1. Immersive Full-Screen Map */}
      <InteractiveMap
        coordinates={coordinates}
        initialResolved={initialResolved}
        onMapError={(msg) => setErrorMessage(msg)}
        startCoords={startCoords}
        destCoords={destCoords}
        clickAction={clickAction}
        onMapClickPoint={handleMapClickPoint}
        routeResult={routeResult}
        routeComparison={routeComparison}
        appMode={appMode}
        networkGeoJSON={networkGeoJSON}
        activeNetwork={activeNetwork}
        hazards={hazards}
        onSelectRoad={(road) => setSelectedRoad(road)}
        onCenterChange={setMapCenter}
        flyToCommand={flyToCommand}
        mapCommand={mapCommand}
        facilitiesGeoJSON={facilitiesGeoJSON}
        onSelectFacility={handleRouteToFacility}
        isNavigating={isNavigating}
        showCoveredRoads={showCoveredRoads}
        closuresGeoJSON={closuresGeoJSON}
        hazardPreviewCircle={
          isAddHazardOpen
            ? { center: hazardModalCenter || mapCenter, radius_m: hazardPreviewRadius }
            : null
        }
      />

      {/* 2. Top-Level Floating Chrome Workspace */}
      <main className="map-floating-overlay" aria-label="Interactive Controls">
        {/* Top Google Maps Floating Search Bar */}
        {!isNavigating && (
          <TopSearchBar
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            onSelectPlace={handleSelectPlace}
            activeNetwork={activeNetwork}
            networks={networks}
            onSelectNetwork={(id) => {
              const found = networks.find((n: NetworkMetadata) => n.id === id);
              if (found) {
                setActiveNetwork(found);
                if (found.bbox && found.bbox.length === 4) {
                  const [min_lon, min_lat, max_lon, max_lat] = found.bbox;
                  const cLon = (min_lon + max_lon) / 2;
                  const cLat = (min_lat + max_lat) / 2;
                  setMapCenter([cLon, cLat]);
                  setFlyToCommand({
                    center: [cLon, cLat],
                    bbox: found.bbox,
                    id: Date.now(),
                  });
                }
              }
            }}
            onFlyToNetwork={handleFlyToActiveNetwork}
            isLocating={isRefreshingLocation || isInitialLocating}
            onLocateUser={handleRefreshLocation}
            onToggleDirections={() =>
              setActiveTab((prev: ActivePanelTab) => (prev === 'navigate' ? 'none' : 'navigate'))
            }
            isDirectionsActive={activeTab === 'navigate'}
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            isSidebarOpen={isSidebarOpen}
            userCoords={coordinates ? [coordinates.longitude, coordinates.latitude] : null}
          />
        )}

        {/* Turn-by-Turn Navigation HUD (Active during journey) */}
        <NavigationHud
          isNavigating={isNavigating}
          onEndJourney={handleEndJourney}
          route={routeResult}
          currentCoords={coordinates}
          destinationName={destinationName}
          onRecalculateRoute={() => void calculateCurrentRoute()}
          onRecenter={handleRecenterNavigation}
          gpsErrorMessage={gpsErrorMessage}
        />

        {/* Contextual Quick Action Category Chips */}
        {!isNavigating && (
          <QuickActionChips
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            facilitiesCount={facilities.length}
            closuresCount={closedRoadsCount}
            hazardsCount={hazards.length}
            isRerouted={Boolean(routeComparison?.is_rerouted)}
            appMode={appMode}
            onAppModeToggle={() =>
              setAppMode((prev: AppMode) => (prev === 'routing' ? 'disaster' : 'routing'))
            }
          />
        )}

        {/* Slim Google Maps Left Navigation Dock */}
        {!isNavigating && (
          <SidebarDock
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            isOpen={isSidebarOpen}
            facilitiesCount={facilities.length}
            closuresCount={closedRoadsCount}
            hazardsCount={hazards.length}
          />
        )}

        {/* Floating Context Panels (Strictly one active at a time) */}
        {!isNavigating && (
          <ContextPanels
            activeTab={activeTab}
            onClose={() => setActiveTab('none')}
            startCoords={startCoords}
            destCoords={destCoords}
            clickAction={clickAction}
            onClickActionChange={setClickAction}
            onUseLiveLocationAsStart={handleUseLiveLocationAsStart}
            onSwapPoints={handleSwapPoints}
            onClearPoints={handleClearPoints}
            algorithm={algorithm}
            onAlgorithmChange={setAlgorithm}
            optimization={optimization}
            onOptimizationChange={setOptimization}
            onCalculateRoute={() => void calculateCurrentRoute()}
            isCalculating={isCalculatingRoute}
            routeResult={routeResult}
            routeComparison={routeComparison}
            destinationName={destinationName}
            onStartJourney={handleStartJourney}
            isNavigating={isNavigating}
            facilities={facilities}
            selectedCategoryFilter={selectedCategoryFilter}
            onSelectCategoryFilter={(cat) => {
              setSelectedCategoryFilter(cat);
              if (activeNetwork) loadFacilitiesData(activeNetwork.id, cat);
            }}
            onRouteToFacility={handleRouteToFacility}
            isLoadingFacilities={isLoadingFacilities}
            appMode={appMode}
            onAppModeToggle={() =>
              setAppMode((prev: AppMode) => (prev === 'routing' ? 'disaster' : 'routing'))
            }
            scenarios={scenarios}
            activeScenario={activeScenario}
            onSelectScenario={handleSelectScenario}
            onCreateScenario={handleCreateScenario}
            onDuplicateScenario={handleDuplicateScenario}
            onResetScenario={handleResetScenario}
            onDeleteScenario={handleDeleteScenario}
            selectedRoad={selectedRoad}
            onApplyRoadCondition={handleApplyRoadCondition}
            closures={closures}
            hazards={hazards}
            onReopenRoad={handleReopenRoad}
            onReopenRoadGroup={handleReopenRoadGroup}
            onReopenAllRoads={handleReopenAllClosures}
            onOpenAddHazard={() => setIsAddHazardOpen(true)}
            onDeleteHazard={handleDeleteHazard}
            isSidebarOpen={isSidebarOpen}
          />
        )}

        {/* Floating Bottom-Right Map Controls (FAB) */}
        {!isNavigating && (
          <MapControlsFab
            onZoomIn={() => setMapCommand({ type: 'zoom_in', id: Date.now() })}
            onZoomOut={() => setMapCommand({ type: 'zoom_out', id: Date.now() })}
            onResetNorth={() => setMapCommand({ type: 'reset_north', id: Date.now() })}
            onLocateUser={handleRefreshLocation}
            isLocating={isRefreshingLocation || isInitialLocating}
            onToggleLegend={() => {}}
            isLegendActive={false}
            onFitCoverage={handleFlyToActiveNetwork}
            showCoveredRoads={showCoveredRoads}
            onToggleCoveredRoads={() => setShowCoveredRoads((prev) => !prev)}
          />
        )}

        {/* Top-Center Picking Mode Banner */}
        <PickingBanner clickAction={clickAction} onCancel={() => setClickAction('none')} />

        {/* Error / Status Toast */}
        {errorMessage && (
          <StatusBanner
            message={errorMessage}
            onDismiss={() => setErrorMessage(null)}
            onRetry={handleRefreshLocation}
          />
        )}

        {/* Modal for detailed road condition inspection if triggered */}
        {selectedRoad && activeTab !== 'simulation' && (
          <RoadConditionModal
            road={selectedRoad}
            onApply={handleApplyRoadCondition}
            onClose={() => setSelectedRoad(null)}
            isApplying={isApplyingRoadCondition}
          />
        )}

        {/* Add Hazard Modal */}
        {isAddHazardOpen && (
          <AddHazardModal
            mapCenter={mapCenter}
            hazardCenter={hazardModalCenter}
            onPickOnMap={() => {
              setIsAddHazardOpen(false);
              setClickAction('add_hazard');
            }}
            onRadiusChange={setHazardPreviewRadius}
            onCreate={handleCreateHazard}
            onClose={() => {
              setIsAddHazardOpen(false);
              setHazardModalCenter(null);
            }}
          />
        )}
      </main>
    </div>
  );
};

export default App;
