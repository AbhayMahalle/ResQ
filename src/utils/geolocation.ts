import { GEOLOCATION_OPTIONS } from '../config';
import type { DeviceCoordinates } from '../types';

export function getGeolocationErrorMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Location permission was denied. Please enable location permissions in your browser to center the map on your position.';
    case error.POSITION_UNAVAILABLE:
      return 'Device location is currently unavailable. Please check your network or device GPS settings.';
    case error.TIMEOUT:
      return 'The request to obtain device location timed out. Please try refreshing again.';
    default:
      return error.message || 'An unknown error occurred while retrieving device location.';
  }
}

export function getCurrentDeviceLocation(): Promise<DeviceCoordinates> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          longitude: position.coords.longitude,
          latitude: position.coords.latitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        reject(error);
      },
      GEOLOCATION_OPTIONS,
    );
  });
}

