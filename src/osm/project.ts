import proj4 from 'proj4';

// Inline EPSG:32617 definition to avoid network dependency
proj4.defs('EPSG:32617', '+proj=utm +zone=17 +datum=WGS84 +units=m +no_defs');

// Midtown Raleigh bounding box
export const BBOX = {
  south: 35.785,
  west: -78.700,
  north: 35.810,
  east: -78.665,
};

// Center of bounding box in WGS84
const CENTER_LON = (BBOX.west + BBOX.east) / 2;   // -78.6825
const CENTER_LAT = (BBOX.south + BBOX.north) / 2; // 35.7975

// Project center to UTM to use as origin
const [centerEasting, centerNorthing] = proj4('EPSG:4326', 'EPSG:32617', [CENTER_LON, CENTER_LAT]);

/**
 * Project a WGS84 [lon, lat] coordinate to local meter offsets [x, z]
 * relative to the bounding box center.
 * Three.js is Y-up: x = east offset, z = -north offset (south is positive z).
 */
export function projectLonLat(lon: number, lat: number): [number, number] {
  const [easting, northing] = proj4('EPSG:4326', 'EPSG:32617', [lon, lat]);
  const x = easting - centerEasting;
  const z = -(northing - centerNorthing); // negate so north is negative z
  return [x, z];
}
