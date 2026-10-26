import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

/**
 * OpenFreeMap Bright style URL
 * Configured in one central place as required.
 */
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/bright';

/**
 * Bulletproof OpenStreetMap Standard Raster Tiles Fallback Style
 * Automatically activated if third-party vector tile services encounter network blocks or CORS errors.
 */
export const FALLBACK_MAP_STYLE: any = {
  version: 8,
  sources: {
    'osm-raster-tiles': {
      type: 'raster',
      tiles: [
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors'
    }
  },
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster',
      source: 'osm-raster-tiles',
      minzoom: 0,
      maxzoom: 19
    }
  ]
};

/**
 * Zoom level used when centering on the user's live device location
 */
export const USER_LOCATION_ZOOM = 14;

/**
 * Neutral global zoom level when live location fails or is unavailable.
 * Shows the whole world without substituting any hardcoded city or guessed location.
 */
export const GLOBAL_FALLBACK_ZOOM = 1.5;

/**
 * Neutral world center [lng, lat] (0, 0) used when no live location is available.
 */
export const GLOBAL_FALLBACK_CENTER: [number, number] = [0, 20];

/**
 * High-accuracy geolocation options with reasonable timeout
 */
export const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 12000,
  maximumAge: 0,
};

/**
 * Configures the MapLibre web worker for Vite bundling.
 * Must be executed prior to map instantiation.
 */
export function configureMapLibreWorker(): void {
  setWorkerUrl(workerUrl);
}
