import L from 'leaflet';
import * as turf from '@turf/turf';
import { Feature, Polygon, MultiPolygon } from '@turf/helpers'; // Correct import for Turf.js types

export const MIN_CLAIM_AREA_SQ_METERS = 100; // Minimum area in square meters for a valid territory claim

/**
 * Helper function to convert Turf.js Polygon/MultiPolygon Feature to L.LatLngExpression[][]
 * @param feature A Turf.js Polygon or MultiPolygon feature.
 * @returns An array of arrays of Leaflet LatLngExpressions.
 */
export const turfFeatureToLatLngExpression = (feature: Feature<Polygon | MultiPolygon> | null): L.LatLngExpression[][] => {
  if (!feature) return [];
  const result: L.LatLngExpression[][] = [];
  if (feature.geometry.type === 'Polygon') {
    const coords = feature.geometry.coordinates[0].map(c => [c[1], c[0]] as L.LatLngExpression);
    if (coords.length >= 3) result.push(coords);
  } else if (feature.geometry.type === 'MultiPolygon') {
    feature.geometry.coordinates.forEach(poly => {
      const coords = poly[0].map(c => [c[1], c[0]] as L.LatLngExpression);
      if (coords.length >= 3) result.push(coords);
    });
  }
  return result;
};

/**
 * Calculates the score based on the total area of all claimed polygons.
 * @param territory An array of arrays of Leaflet LatLngExpressions representing the territory polygons.
 * @returns The calculated score in thousands of square meters.
 */
export const calculateScore = (territory: L.LatLngExpression[][]): number => {
  let totalArea = 0;
  territory.forEach(polygonCoords => {
    const geoJsonCoords = polygonCoords.map(coord => {
      const lat = typeof coord[0] === 'number' ? coord[0] : coord.lat;
      const lng = typeof coord[1] === 'number' ? coord[1] : coord.lng;
      return [lng, lat]; // Turf expects [longitude, latitude]
    });

    // Ensure the polygon is closed
    if (geoJsonCoords.length > 0 && (geoJsonCoords[0][0] !== geoJsonCoords[geoJsonCoords.length - 1][0] || geoJsonCoords[0][1] !== geoJsonCoords[geoJsonCoords.length - 1][1])) {
      geoJsonCoords.push(geoJsonCoords[0]);
    }

    if (geoJsonCoords.length >= 4) { // A valid polygon needs at least 3 unique points + closing point
      try {
        const polygon = turf.polygon([geoJsonCoords]);
        totalArea += turf.area(polygon); // area in square meters
      } catch (e) {
        console.error("Error calculating area for polygon:", e, polygonCoords);
      }
    }
  });
  return Math.round(totalArea / 1000); // Return area in thousands of square meters for a more manageable score
};