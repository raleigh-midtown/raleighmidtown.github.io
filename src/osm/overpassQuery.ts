import { BBOX } from './project.js';

// Overpass query builders. Framework-agnostic (no DOM/localStorage/fetch) so the
// browser fetch path, the Node build-time script, and tests can all share them.

// Combined query: buildings + drivable highways + parks/grass/meadow/wood for the
// scene's bounding box. The resulting GeoJSON feeds every scene builder via mapData.
export function buildOverpassQuery(): string {
  const { south, west, north, east } = BBOX;
  return `[out:json][timeout:90];
(
  way["building"](${south},${west},${north},${east});
  relation["building"](${south},${west},${north},${east});
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|living_street)$"](${south},${west},${north},${east});
  way["leisure"="park"](${south},${west},${north},${east});
  way["landuse"~"^(grass|recreation_ground|park|garden|meadow)$"](${south},${west},${north},${east});
  way["natural"~"^(wood|grassland)$"](${south},${west},${north},${east});
);
out body;
>;
out skel qt;`;
}

// Roads-only query (drivable highways). Kept for reuse; the combined query above
// already includes highways, so the scene does not call this at runtime today.
export function buildRoadsQuery(): string {
  const { south, west, north, east } = BBOX;
  // Only drivable + residential roads; skip footways/paths to keep payload small
  return `[out:json][timeout:25];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|living_street)$"](${south},${west},${north},${east});
);
out body;
>;
out skel qt;`;
}