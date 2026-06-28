import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';
import { isUnnamedParkingGarage } from './util/osmPredicates.js';
import { ringToShape } from './util/shapes.js';

/**
 * Classify building type from OSM tags.
 * 0 = residential, 1 = commercial, 2 = unknown
 */
function classifyBuilding(props: Record<string, unknown>): number {
  const building = String(props['building'] ?? '').toLowerCase();
  if (['residential', 'house', 'apartments'].includes(building)) return 0;
  if (['commercial', 'retail', 'office'].includes(building)) return 1;
  return 2;
}

// OSM name → confirmed real-world height (m) for North Hills landmarks
const KNOWN_HEIGHTS: Record<string, number> = {
  'The Eastern':                       115,
  'Captrust Tower':                     79,
  'Advanced Auto Parts Tower':          78,
  'Bank of America Tower':              63,
  'Midtown Plaza':                      55,
  'Park Central North Hills':           56,
  'Hyatt House North Hills':            24,
  'Midtown Green':                      21,
  'Park & Market North Hills':          21,
  'Renaissance Raleigh North Hills Hotel': 35,
  'Landmark Center':                    18,
  'The Lassiter at North Hills':        14,
  'Restoration Hardware':               12,
};

/**
 * Extract height in meters from OSM properties.
 * Priority: known-name lookup → explicit height tag → levels × 3.5 → type default
 */
function extractHeight(props: Record<string, unknown>): number {
  const name = String(props['name'] ?? '');
  if (name && KNOWN_HEIGHTS[name] !== undefined) return KNOWN_HEIGHTS[name];

  const heightRaw = props['height'];
  if (heightRaw !== undefined && heightRaw !== null) {
    const h = parseFloat(String(heightRaw));
    if (!isNaN(h) && h > 0) return h;
  }

  const levelsRaw = props['building:levels'];
  if (levelsRaw !== undefined && levelsRaw !== null) {
    const l = parseFloat(String(levelsRaw));
    if (!isNaN(l) && l > 0) return l * 3.5;
  }

  // Type-based fallback so apartments/offices aren't all 10m boxes
  const building = String(props['building'] ?? '').toLowerCase();
  if (['apartments', 'residential'].includes(building)) return 18;
  if (['commercial', 'office'].includes(building)) return 22;
  if (['retail'].includes(building)) return 8;
  return 10;
}

/**
 * Recompute UV coordinates for wall faces using world-space projection.
 *
 * ExtrudeGeometry UVs are based on the 2D shape footprint; after rotateX(-π/2)
 * the wall face UVs are meaningless for facade texturing. This replaces them
 * with proper wall UVs:
 *   u = distance along wall (metres) / TILE_SIZE
 *   v = height above ground (metres) / TILE_SIZE
 *
 * Cap faces (top/bottom, |normalY| > 0.5) are left unchanged.
 */
const WALL_TILE_SIZE = 10; // 1 texture tile = 10 m of real-world wall

function recomputeWallUVs(geometry: THREE.BufferGeometry): void {
  const pos = geometry.attributes['position'] as THREE.BufferAttribute;
  const nrm = geometry.attributes['normal'] as THREE.BufferAttribute;
  const uv  = geometry.attributes['uv']       as THREE.BufferAttribute;
  if (!nrm || !uv) return;

  for (let i = 0; i < pos.count; i++) {
    // Skip top/bottom cap faces — their normals point mostly up/down
    if (Math.abs(nrm.getY(i)) > 0.5) continue;

    const nx = nrm.getX(i);
    const nz = nrm.getZ(i);
    const x  = pos.getX(i);
    const y  = pos.getY(i);
    const z  = pos.getZ(i);

    // Horizontal tangent along wall surface: perpendicular to normal in XZ plane
    // tangent = (-nz, 0, nx), so dot(pos_xz, tangent) gives distance along wall
    uv.setXY(i,
      (-nz * x + nx * z) / WALL_TILE_SIZE,
      y                   / WALL_TILE_SIZE,
    );
  }
  uv.needsUpdate = true;
}

/**
 * Create an extruded BufferGeometry from a polygon ring set, tagged with buildingType.
 */
function extrudePolygon(
  rings: number[][][],
  height: number,
  buildingType: number
): THREE.BufferGeometry {
  const shape = ringToShape(rings[0]);
  // Add holes
  for (let i = 1; i < rings.length; i++) {
    shape.holes.push(ringToShape(rings[i]) as unknown as THREE.Path);
  }

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: height,
    bevelEnabled: false,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  // Rotate so buildings stand upright: Three.js is Y-up, extrude is along Z
  geometry.rotateX(-Math.PI / 2);

  // Fix wall UV mapping: ExtrudeGeometry UVs don't align with 3D wall faces
  recomputeWallUVs(geometry);

  // Add buildingType attribute
  const vertexCount = geometry.attributes['position'].count;
  const buildingTypeArray = new Int32Array(vertexCount).fill(buildingType);
  geometry.setAttribute('buildingType', new THREE.BufferAttribute(buildingTypeArray, 1));

  return geometry;
}

/**
 * Extrude all building features, grouped by building type.
 * Returns one merged geometry per type (residential, commercial, unknown).
 */
export function extrudeBuildings(geojson: FeatureCollection): THREE.BufferGeometry {
  // Bucket geometries by type: 0=residential, 1=commercial, 2=unknown
  const buckets: THREE.BufferGeometry[][] = [[], [], []];

  for (const feature of geojson.features as Feature[]) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    // Skip features that are not buildings
    if (!props['building'] && !props['building:part']) continue;
    // Unnamed parking garages are rendered as flat surface lots by parkingLots.ts.
    if (isUnnamedParkingGarage(props)) continue;
    const height = extractHeight(props);
    const buildingType = classifyBuilding(props);
    const geomType = feature.geometry?.type;

    if (geomType === 'Polygon') {
      const polygon = feature.geometry as Polygon;
      try {
        buckets[buildingType].push(extrudePolygon(polygon.coordinates as number[][][], height, buildingType));
      } catch { /* skip degenerate */ }
    } else if (geomType === 'MultiPolygon') {
      const multiPolygon = feature.geometry as MultiPolygon;
      for (const rings of multiPolygon.coordinates as number[][][][]) {
        try {
          buckets[buildingType].push(extrudePolygon(rings as number[][][], height, buildingType));
        } catch { /* skip degenerate */ }
      }
    }
  }

  const allGeos: THREE.BufferGeometry[] = buckets.flat();
  if (allGeos.length === 0) throw new Error('No building geometries');

  const merged = mergeGeometries(allGeos, false);
  if (!merged) throw new Error('Failed to merge building geometries');

  for (const g of allGeos) g.dispose();
  return merged;
}

export interface BuildingBucket {
  geometries: THREE.BufferGeometry[];
  maxHeight: number;
  typeIndex: number; // 0=residential, 1=commercial, 2=unknown
  heightBand: number; // 0=low(<12m), 1=mid(12-24m), 2=tall(24-40m), 3=skyscraper(>40m)
}

/**
 * Map a building height to one of four bands that align with the
 * materialForType() thresholds, so each merged mesh gets a material
 * that matches its own height range — not the tallest in its type bucket.
 */
function toHeightBand(h: number): number {
  if (h >= 40) return 3;
  if (h >= 24) return 2;
  if (h >= 12) return 1;
  return 0;
}

/** Representative height used for material selection within each band. */
const BAND_HEIGHT: Record<number, number> = { 0: 8, 1: 18, 2: 32, 3: 60 };

/**
 * Extrude buildings bucketed by (typeIndex × heightBand).
 * Up to 3 types × 4 bands = 12 buckets; each yields one merged mesh
 * with a material tuned to both its OSM type and its height range.
 */
export function extrudeBuildingBuckets(geojson: FeatureCollection): BuildingBucket[] {
  // keyed by `${typeIndex}_${heightBand}`
  const map = new Map<string, BuildingBucket>();

  function getOrCreate(typeIndex: number, band: number): BuildingBucket {
    const key = `${typeIndex}_${band}`;
    if (!map.has(key)) {
      map.set(key, { geometries: [], maxHeight: 0, typeIndex, heightBand: band });
    }
    return map.get(key)!;
  }

  for (const feature of geojson.features as Feature[]) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    // Skip features that are not buildings
    if (!props['building'] && !props['building:part']) continue;
    // Unnamed parking garages are rendered as flat surface lots by parkingLots.ts.
    if (isUnnamedParkingGarage(props)) continue;
    const height = extractHeight(props);
    const buildingType = classifyBuilding(props);
    const band = toHeightBand(height);
    const bucket = getOrCreate(buildingType, band);
    const geomType = feature.geometry?.type;

    if (geomType === 'Polygon') {
      const polygon = feature.geometry as Polygon;
      try {
        bucket.geometries.push(extrudePolygon(polygon.coordinates as number[][][], height, buildingType));
        bucket.maxHeight = Math.max(bucket.maxHeight, height);
      } catch { /* skip degenerate */ }
    } else if (geomType === 'MultiPolygon') {
      const multiPolygon = feature.geometry as MultiPolygon;
      for (const rings of multiPolygon.coordinates as number[][][][]) {
        try {
          bucket.geometries.push(extrudePolygon(rings as number[][][], height, buildingType));
          bucket.maxHeight = Math.max(bucket.maxHeight, height);
        } catch { /* skip degenerate */ }
      }
    }
  }

  return Array.from(map.values());
}

/**
 * Extrude buildings and return one THREE.Group.
 * Materials are applied by the caller via materialForType.
 */
export function extrudeBuildingsGroup(geojson: FeatureCollection): THREE.Group {
  const buckets = extrudeBuildingBuckets(geojson);
  const group = new THREE.Group();

  for (const bucket of buckets) {
    if (bucket.geometries.length === 0) continue;
    const merged = mergeGeometries(bucket.geometries, false);
    if (!merged) continue;
    for (const g of bucket.geometries) g.dispose();
    const mesh = new THREE.Mesh(merged);
    mesh.userData['buildingType'] = bucket.typeIndex;
    // Use band's representative height so materialForType sees a stable,
    // band-appropriate value rather than the accidental max of the bucket.
    mesh.userData['maxHeight'] = BAND_HEIGHT[bucket.heightBand];
    group.add(mesh);
  }

  if (group.children.length === 0) throw new Error('No building geometries');
  return group;
}
