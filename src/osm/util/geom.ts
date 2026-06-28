import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';
import { projectLonLat } from '../project.js';

export type Pt = [number, number];

/** Extract polygon rings (lon/lat) from a Feature. Handles Polygon and MultiPolygon. */
export function getRings(feature: Feature): number[][][] {
  const g = feature.geometry;
  if (!g) return [];
  if (g.type === 'Polygon') return [(g as Polygon).coordinates[0] as number[][]];
  if (g.type === 'MultiPolygon') return (g as MultiPolygon).coordinates.map(r => r[0] as number[][]);
  return [];
}

/**
 * Centroid of a closed polygon ring (last vertex == first vertex).
 *
 * Uses the shoelace area-weighted formula — robust against vertex clustering
 * along curved corners that would bias a naive vertex average. Falls back to
 * the vertex average when the polygon is degenerate (zero signed area),
 * which keeps the function total for upstream callers.
 */
export function polygonCentroid(ring: Pt[]): Pt {
  const n = ring.length - 1;   // last == first; exclude duplicate
  if (n <= 0) return [0, 0];
  let twiceArea = 0;
  let cx = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    const [x0, z0] = ring[i];
    const [x1, z1] = ring[(i + 1) % n];
    const cross = x0 * z1 - x1 * z0;
    twiceArea += cross;
    cx += (x0 + x1) * cross;
    cz += (z0 + z1) * cross;
  }
  if (Math.abs(twiceArea) < 1e-9) {
    // Degenerate polygon — fall back to vertex average so callers don't get NaN.
    let sx = 0, sz = 0;
    for (let i = 0; i < n; i++) { sx += ring[i][0]; sz += ring[i][1]; }
    return [sx / n, sz / n];
  }
  const sixA = 3 * twiceArea;
  return [cx / sixA, cz / sixA];
}

/**
 * Outward unit normal for edge [a→b] given the polygon centroid.
 * Returns the perpendicular that points AWAY from the centroid (CW/CCW agnostic).
 */
export function edgeOutwardNormal(
  ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number,
): Pt {
  const dx = bx - ax, dz = bz - az;
  const L = Math.sqrt(dx * dx + dz * dz);
  if (L < 1e-9) return [0, 0];
  let nx = -dz / L, nz = dx / L;
  const midX = (ax + bx) / 2, midZ = (az + bz) / 2;
  if (nx * (cx - midX) + nz * (cz - midZ) > 0) { nx = -nx; nz = -nz; }
  return [nx, nz];
}

/**
 * Inward unit normal for edge [a→b] given the polygon centroid.
 * Same math as edgeOutwardNormal but flipped — points TOWARD the centroid.
 */
export function edgeInwardNormal(
  ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number,
): Pt {
  const [nx, nz] = edgeOutwardNormal(ax, az, bx, bz, cx, cz);
  return [-nx, -nz];
}

  /** Ray-cast (in +X direction) odd-even test for point-in-polygon (XZ plane).
   * Boundary behavior (point exactly on edge/vertex) is implementation-defined
   * and intentionally unpinned — callers must not rely on it.
   */
export function pointInRing(px: number, pz: number, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length - 1; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    // The (zi > pz) !== (zj > pz) check guarantees zi ≠ zj when true,
    // so the denominator (zj - zi) is never zero here.
    if (((zi > pz) !== (zj > pz)) &&
        (px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

export interface BBox { minX: number; maxX: number; minZ: number; maxZ: number; ring: Pt[]; }

/** True when (x, z) sits inside any building's footprint. Bbox prefilter → ring test. */
export function isInsideAnyBuilding(x: number, z: number, boxes: BBox[]): boolean {
  for (const b of boxes) {
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    if (pointInRing(x, z, b.ring)) return true;
  }
  return false;
}

/**
 * Collect every building footprint as a projected ring + bbox. Skips features
 * without `building=*` and features tagged `building=roof` (decorative, not a
 * volume to exclude).
 */
export function collectBuildingBoxes(geojson: FeatureCollection): BBox[] {
  const boxes: BBox[] = [];
  for (const feature of geojson.features as Feature[]) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    if (!props['building'] || props['building'] === 'roof') continue;
    for (const ringLL of getRings(feature)) {
      if (ringLL.length < 4) continue;
      const ring: Pt[] = ringLL.map(c => projectLonLat(c[0], c[1]));
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [x, z] of ring) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      boxes.push({ minX, maxX, minZ, maxZ, ring });
    }
  }
  return boxes;
}
