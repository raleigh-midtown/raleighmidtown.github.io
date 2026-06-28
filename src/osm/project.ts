import proj4 from 'proj4';

proj4.defs('EPSG:32617', '+proj=utm +zone=17 +datum=WGS84 +units=m +no_defs');

// Midtown Park / North Hills retail core only
export const BBOX = {
  south: 35.833,
  west:  -78.650,
  north: 35.844,
  east:  -78.630,
};

// Center on the North Hills retail core
const CENTER_LON = -78.640;
const CENTER_LAT = 35.8385;

const [centerEasting, centerNorthing] = proj4('EPSG:4326', 'EPSG:32617', [CENTER_LON, CENTER_LAT]);

/**
 * Project WGS84 [lon, lat] to local meter offsets [x, z] from bbox center.
 * Three.js Y-up: x = east, z = south (negative = north).
 */
export function projectLonLat(lon: number, lat: number): [number, number] {
  const [easting, northing] = proj4('EPSG:4326', 'EPSG:32617', [lon, lat]);
  const x = easting - centerEasting;
  const z = -(northing - centerNorthing);
  return [x, z];
}
