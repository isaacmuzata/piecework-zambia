'use strict';
/**
 * Geography helpers for 2911 Jobs.
 *
 * Jobs are matched by DISTANCE IN KILOMETRES. Every job and every user can
 * carry precise coordinates (lat/lng). When they don't, we fall back to the
 * approximate centre of their city so distance matching still works.
 */

// Approximate city centres (decimal degrees). 'Other' intentionally has none.
const CITY_COORDS = {
  'Lusaka':      { lat: -15.3875, lng: 28.3228 },
  'Kitwe':       { lat: -12.8024, lng: 28.2132 },
  'Ndola':       { lat: -12.9584, lng: 28.6366 },
  'Kabwe':       { lat: -14.4469, lng: 28.4464 },
  'Chipata':     { lat: -13.6333, lng: 32.6333 },
  'Livingstone': { lat: -17.8419, lng: 25.8543 },
  'Chingola':    { lat: -12.5250, lng: 27.8686 },
  'Luanshya':    { lat: -13.1333, lng: 28.4000 },
  'Kasama':      { lat: -10.2117, lng: 31.1789 },
  'Solwezi':     { lat: -12.1833, lng: 26.4000 },
  'Mongu':       { lat: -15.2544, lng: 23.1278 },
  'Choma':       { lat: -16.8063, lng: 26.9917 },
};

/** Great-circle distance in kilometres (Haversine). */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in km
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function isValidLat(lat) {
  return typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90;
}
function isValidLng(lng) {
  return typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

/**
 * Parse lat/lng from a request body or query object.
 * Returns { lat, lng } when both are present and valid,
 *         null when neither is present,
 *         { error: 'message' } when present but invalid.
 */
function parseLatLng(src) {
  const rawLat = src.lat;
  const rawLng = src.lng;
  const hasLat = rawLat !== undefined && rawLat !== null && rawLat !== '';
  const hasLng = rawLng !== undefined && rawLng !== null && rawLng !== '';
  if (!hasLat && !hasLng) return null;
  const lat = typeof rawLat === 'number' ? rawLat : parseFloat(rawLat);
  const lng = typeof rawLng === 'number' ? rawLng : parseFloat(rawLng);
  if (!isValidLat(lat) || !isValidLng(lng)) {
    return { error: 'Location coordinates are invalid.' };
  }
  if (!hasLat || !hasLng) {
    return { error: 'Both latitude and longitude are needed for a location.' };
  }
  return { lat, lng };
}

/**
 * Effective coordinates for a user or job row: precise lat/lng when stored,
 * otherwise the approximate centre of its city. Returns null when neither
 * is available (e.g. city 'Other' with no coordinates).
 */
function resolveCoords(row) {
  if (row && row.lat != null && row.lng != null) {
    return { lat: Number(row.lat), lng: Number(row.lng) };
  }
  const c = row && CITY_COORDS[row.city];
  return c ? { lat: c.lat, lng: c.lng } : null;
}

module.exports = { CITY_COORDS, haversineKm, parseLatLng, resolveCoords, isValidLat, isValidLng };
