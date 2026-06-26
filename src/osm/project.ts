import proj4 from 'proj4';

proj4.defs('EPSG:32617', '+proj=utm +zone=17 +datum=WGS84 +units=m +no_defs');

// Midtown Raleigh — North Hills district (Bank of America Tower, Captrust Tower, etc.)
export const BBOX = {
  south: 35.830,
  west:  -78.660,
  north: 35.860,
  east:  -78.625,
};

const CENTER_LON = (BBOX.west + BBOX.east) / 2;   // -78.6425
const CENTER_LAT = (BBOX.south + BBOX.north) / 2; // 35.845

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
