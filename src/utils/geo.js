/**
 * geo.js — the FAKE GPS for the attendance demo.
 *
 * There is no real geolocation in Part 2 (no navigator.gps, no backend).
 * Instead the worker's phone position is one of two HARDCODED coordinate
 * presets, and the screen simply switches between them:
 *
 *   - "inside"  → a point ~35 m from the factory  → worker can check in
 *   - "outside" → a point ~1.1 km from the factory → worker is too far
 *
 * The factory itself sits at Connaught Place, Delhi with a 150 m geofence
 * (the area inside which a check-in is allowed).
 */

/** The factory geofence: centre + the radius (in metres) workers must be inside. */
export const FACTORY_LOCATION = {
  name: 'SUAB Factory',
  lat: 28.6139, // Connaught Place, New Delhi (demo coordinates)
  lng: 77.209,
  radiusMeters: 150, // check-in allowed within this distance
};

/**
 * Hardcoded worker positions used by the on-screen simulator.
 * (Chosen so the distances are easy to read: ~35 m and ~1.1 km.)
 */
export const WORKER_PRESETS = {
  inside: { lat: 28.61415, lng: 77.20925 }, // ~35 m from the factory gate
  outside: { lat: 28.6239, lng: 77.209 }, // ~1.1 km down the road
};

/** The three situations the attendance screen can be in. */
export const LOCATION_STATES = {
  AT_LOCATION: 'at-location', // GPS on + worker inside the geofence
  NOT_AT_LOCATION: 'not-at-location', // GPS on + worker outside the geofence
  LOCATION_OFF: 'location-off', // GPS switched off (no fix at all)
};

/**
 * Great-circle distance between two { lat, lng } points, in metres.
 * Uses the standard haversine formula — accurate enough for a demo.
 */
export function distanceMeters(a, b) {
  const EARTH_RADIUS = 6371000; // metres
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(h));
}

/**
 * Work out which of the three states the worker is in.
 *  - location off            → LOCATION_OFF (coordinates are irrelevant)
 *  - inside the geofence     → AT_LOCATION
 *  - anywhere else           → NOT_AT_LOCATION
 */
export function resolveLocationState(locationOn, workerCoords) {
  if (!locationOn) return LOCATION_STATES.LOCATION_OFF;
  const distance = distanceMeters(workerCoords, FACTORY_LOCATION);
  return distance <= FACTORY_LOCATION.radiusMeters
    ? LOCATION_STATES.AT_LOCATION
    : LOCATION_STATES.NOT_AT_LOCATION;
}

/** Pretty distance for the status line: 35 -> '35 m', 1100 -> '1.1 km'. */
export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
