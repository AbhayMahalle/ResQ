/**
 * Approximates a circle polygon on WGS84 coordinates for GeoJSON rendering.
 */
export function createCirclePolygon(
  centerLon: number,
  centerLat: number,
  radiusMeters: number,
  points: number = 48,
): { type: 'Polygon'; coordinates: number[][][] } {
  const coords: number[][] = [];
  const latR = (centerLat * Math.PI) / 180.0;
  const metersPerDegLat = 111132.954 - 559.822 * Math.cos(2 * latR) + 1.175 * Math.cos(4 * latR);
  const metersPerDegLon = 111412.84 * Math.cos(latR) - 93.5 * Math.cos(3 * latR);

  for (let i = 0; i < points; i++) {
    const theta = (2.0 * Math.PI * i) / points;
    const dx = radiusMeters * Math.cos(theta);
    const dy = radiusMeters * Math.sin(theta);
    const pLon = centerLon + dx / metersPerDegLon;
    const pLat = centerLat + dy / metersPerDegLat;
    coords.push([pLon, pLat]);
  }
  coords.push(coords[0]); // Close ring

  return {
    type: 'Polygon',
    coordinates: [coords],
  };
}

