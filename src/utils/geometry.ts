import L from 'leaflet';

/**
 * Checks if a given point (latitude, longitude) is inside a polygon.
 * Uses the ray-casting algorithm.
 *
 * @param point The point to check, as a Leaflet LatLngExpression ([lat, lng] or {lat, lng}).
 * @param polygon An array of Leaflet LatLngExpressions representing the polygon vertices.
 * @returns True if the point is inside the polygon, false otherwise.
 */
export const isPointInPolygon = (point: L.LatLngExpression, polygon: L.LatLngExpression[]): boolean => {
  // Normalize point coordinates
  const px = typeof point[0] === 'number' ? point[0] : point.lat;
  const py = typeof point[1] === 'number' ? point[1] : point.lng;

  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    // Normalize polygon vertex coordinates
    const xi = typeof polygon[i][0] === 'number' ? polygon[i][0] : polygon[i].lat;
    const yi = typeof polygon[i][1] === 'number' ? polygon[i][1] : polygon[i].lng;
    const xj = typeof polygon[j][0] === 'number' ? polygon[j][0] : polygon[j].lat;
    const yj = typeof polygon[j][1] === 'number' ? polygon[j][1] : polygon[j].lng;

    const intersect = ((yi > py) !== (yj > py)) &&
      (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
};