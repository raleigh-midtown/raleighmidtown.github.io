import * as THREE from 'three';
import type { FeatureCollection, Feature, Polygon } from 'geojson';
import { projectLonLat } from './project.js';
import { getSharedTreePrototypes, buildTreeInstances, type TreePrototype } from '../scene/treeFactory.js';
import {
  type Pt, type BBox,
  polygonCentroid, edgeInwardNormal, pointInRing,
  collectBuildingBoxes, isInsideAnyBuilding,
} from './util/geom.js';

function seededRng(seed: number) {
  let s = seed >>> 0;
  return () => { s = Math.imul(s ^ (s >>> 15), s | 1); s ^= s + Math.imul(s ^ (s >>> 7), s | 61); return ((s ^ (s >>> 14)) >>> 0) / 0xffffffff; };
}

function scatter(cx: number, cz: number, count: number, radius: number, seed: number): [number, number][] {
  const rng = seededRng(seed); const pts: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * radius;
    pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return pts;
}

// Street-tree row with slight random jitter so the line looks natural, not robotic
function treeRow(
  x0: number, z0: number, x1: number, z1: number,
  spacing: number, jitter = 1.2, seed = 1337
): [number, number][] {
  const rng = seededRng(seed);
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.sqrt(dx * dx + dz * dz);
  const count = Math.floor(len / spacing);
  // load-bearing: prevents NaN positions from zero-length edges (duplicate OSM vertices)
  if (count === 0) return [];
  const udx = dx / len, udz = dz / len;
  // Perpendicular direction for lateral jitter
  const px = -udz, pz = udx;
  const pts: [number, number][] = [];
  for (let i = 0; i <= count; i++) {
    const t = i * spacing;
    const jx = (rng() - 0.5) * jitter * 2;
    const jz = (rng() - 0.5) * jitter * 2;
    pts.push([x0 + udx * t + px * jx + jx * 0.3, z0 + udz * t + pz * jz + jz * 0.3]);
  }
  return pts;
}

// Midtown Park border trees — placed the same way as benches (buildBenches):
// along the park polygon's two longest edges, centered on each edge, inset
// inward toward the lawn, and dropped where a candidate falls inside an adjacent
// building footprint (isInsideAnyBuilding). This makes the trees trace the
// park's actual diagonal long edges east-to-west, matching the bench rows,
// instead of cutting straight across at a fixed z.
//
// The OSM park polygon overlaps the adjacent apartment buildings, so lining the
// raw edge would land some trees inside them — the per-candidate building guard
// (the same one benches use) drops those, leaving trees only on the clear lawn.
export function parkLongEdgeTreeRows(
  park: Pt[], boxes: BBox[], spacing: number, inset: number,
): [number, number][] {
  if (park.length < 4) return [];
  const [cx, cz] = polygonCentroid(park);
  type Edge = { ax: number; az: number; bx: number; bz: number; L: number };
  const edges: Edge[] = [];
  let maxLen = 0;
  for (let i = 0; i < park.length - 1; i++) {
    const [ax, az] = park[i];
    const [bx, bz] = park[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 3) continue;
    if (L > maxLen) maxLen = L;
    edges.push({ ax, az, bx, bz, L });
  }
  // The two longest edges = the long sides of the park (east-to-west).
  const longEdges = edges.filter(e => e.L >= maxLen * 0.6).slice(0, 2);
  const positions: [number, number][] = [];
  for (const e of longEdges) {
    const ux = (e.bx - e.ax) / e.L, uz = (e.bz - e.az) / e.L;
    const [inX, inZ] = edgeInwardNormal(e.ax, e.az, e.bx, e.bz, cx, cz);
    // Centered placement (t = (k+0.5)/num) keeps trees off the corners.
    const num = Math.max(1, Math.floor(e.L / spacing));
    for (let k = 0; k < num; k++) {
      const t = (k + 0.5) * (e.L / num);
      const tx = e.ax + ux * t + inX * inset;
      const tz = e.az + uz * t + inZ * inset;
      if (!pointInRing(tx, tz, park)) continue;
      if (isInsideAnyBuilding(tx, tz, boxes)) continue;
      positions.push([tx, tz]);
    }
  }
  return positions;
}

// Road center z interpolated along St Albans Drive path (100,-200)→(250,-180)→(400,-150).
// (see midtownScene.ts ROADS array for the source of these waypoints)
function stAlbansRoadZ(x: number): number {
  x = Math.max(100, Math.min(400, x));
  if (x <= 250) return -200 + (x - 100) / 150 * 20;
  return -180 + (x - 250) / 150 * 30;
}

// Find OSM greenspace polygon edges inside the St Albans corridor and build tree
// rows along the inner boundary (the edges closest to the road on each side).
// Returns an empty array if no in-corridor greenspace features exist — the caller
// falls back to fixed-offset rows so the scene always has St Albans trees.
export function stAlbansGreenspaceEdgeRows(
  geojson: FeatureCollection,
  spacing: number,
  seedBase: number
): [number, number][] {
  // Corridor bounding box (scene meters from center), with 20-unit margin.
  const X_MIN = 60, X_MAX = 440, Z_MIN = -250, Z_MAX = -90;
  // Max plausible distance a greenspace edge can sit from road center (either side).
  const MAX_SIDE_DIST = 60;

  type Edge = { x0: number; z0: number; x1: number; z1: number; dist: number };

  const southEdges: Edge[] = [];
  const northEdges: Edge[] = [];

  for (const feature of geojson.features as Feature[]) {
    const p = (feature.properties ?? {}) as Record<string, unknown>;
    const isGreen =
      p['leisure'] === 'park' ||
      ['grass', 'recreation_ground', 'meadow'].includes(String(p['landuse'] ?? ''));
    if (!isGreen || feature.geometry?.type !== 'Polygon') continue;

    const raw = (feature.geometry as Polygon).coordinates[0] as number[][];
    const ring: Pt[] = raw.map(c => projectLonLat(c[0], c[1]));

    // Keep the ring only if at least one vertex falls inside the corridor.
    if (!ring.some(([x, z]) => x >= X_MIN && x <= X_MAX && z >= Z_MIN && z <= Z_MAX)) continue;

    for (let i = 0; i < ring.length - 1; i++) {
      const [x0, z0] = ring[i];
      const [x1, z1] = ring[i + 1];
      const midX = (x0 + x1) / 2;
      const midZ = (z0 + z1) / 2;

      // Edge midpoint must be inside corridor.
      if (midX < X_MIN || midX > X_MAX || midZ < Z_MIN || midZ > Z_MAX) continue;

      const rcZ = stAlbansRoadZ(Math.max(100, Math.min(400, midX)));
      const dz = midZ - rcZ; // positive = south of road center, negative = north

      if (dz > 0 && dz < MAX_SIDE_DIST) {
        southEdges.push({ x0, z0, x1, z1, dist: dz });
      } else if (dz < 0 && dz > -MAX_SIDE_DIST) {
        northEdges.push({ x0, z0, x1, z1, dist: -dz });
      }
    }
  }

  if (southEdges.length === 0 && northEdges.length === 0) return [];

  const positions: [number, number][] = [];

  // Build rows along the innermost edges on each side.
  // "Inner" = minimum dz distance from road center = boundary closest to road.
  const addEdgeRows = (edges: Edge[], seedOffset: number) => {
    if (edges.length === 0) return;
    edges.sort((a, b) => a.dist - b.dist);
    const minDist = edges[0].dist;
    // Accept all edges within 15 units of the minimum (captures parallel polygon faces).
    const inner = edges.filter(e => e.dist <= minDist + 15);
    inner.forEach((e, idx) => {
      positions.push(...treeRow(e.x0, e.z0, e.x1, e.z1, spacing, 0.8, seedBase + seedOffset + idx * 7));
    });
  };

  addEdgeRows(southEdges, 0);
  addEdgeRows(northEdges, 4);

  return positions;
}

// `prototypes` is injectable so the placement pipeline stays testable without
// running ez-tree (which needs a DOM). Production callers omit it; it is then
// generated from ez-tree at scene-build time.
export function buildTrees(geojson: FeatureCollection, prototypes?: TreePrototype[]): THREE.Group {
  const group = new THREE.Group();
  const positions: [number, number][] = [];

  // ── Midtown Park — trees along the two long edges, placed like benches ─────
  // Follow the park polygon's diagonal long edges (east-to-west), inset inward,
  // dropping candidates that fall inside adjacent buildings. See
  // parkLongEdgeTreeRows.
  const buildingBoxes = collectBuildingBoxes(geojson);
  for (const feature of geojson.features as Feature[]) {
    const p = (feature.properties ?? {}) as Record<string, unknown>;
    if (String(p['name'] ?? '') !== 'Midtown Park' || feature.geometry?.type !== 'Polygon') continue;
    const raw = (feature.geometry as Polygon).coordinates[0] as number[][];
    if (raw.length < 4) continue;
    const ring = raw.map(c => projectLonLat(c[0], c[1]));
    positions.push(...parkLongEdgeTreeRows(ring, buildingBoxes, 16, 3));
  }

  // ── St Albans Drive — dense screen row beside road sidewalk ───────────────
  // Use OSM greenspace polygon inner boundary when live data is present; fall back
  // to fixed perpendicular offsets from the hand-coded road path when offline.
  const stAlbansTrees = stAlbansGreenspaceEdgeRows(geojson, 8, 511);
  if (stAlbansTrees.length > 0) {
    positions.push(...stAlbansTrees);
  } else {
    // Fallback: fixed ±8 offset from road path (100,-200)→(250,-180)→(400,-150).
    positions.push(...treeRow( 99, -192, 249, -172, 8, 1.0, 511));
    positions.push(...treeRow(248, -172, 398, -142, 8, 1.0, 512));
    positions.push(...treeRow(101, -208, 251, -188, 8, 1.0, 513));
    positions.push(...treeRow(252, -188, 402, -158, 8, 1.0, 514));
  }

  // ── The Commons park ──────────────────────────────────────────────────────
  positions.push(...scatter(-228, 188, 5, 16, 7));

  // ── Street trees north of core (sparse) ───────────────────────────────────
  positions.push(...scatter(-50, -90, 2, 55, 99));

  // ── OSM grass / park polygons ─────────────────────────────────────────────
  const SKIP_NAMES = new Set(['Midtown Park', 'Midtown Green']);
  for (const feature of geojson.features as Feature[]) {
    const p = (feature.properties ?? {}) as Record<string, unknown>;
    if (SKIP_NAMES.has(String(p['name'] ?? ''))) continue;
    const isGreen = p['leisure'] === 'park' ||
      ['grass', 'recreation_ground', 'meadow'].includes(String(p['landuse'] ?? ''));
    if (!isGreen || feature.geometry?.type !== 'Polygon') continue;
    const ring = (feature.geometry as Polygon).coordinates[0] as number[][];
    if (ring.length < 3) continue;
    const projected = ring.map(c => projectLonLat(c[0], c[1]));
    let cx = 0, cz = 0;
    projected.forEach(([x, z]) => { cx += x; cz += z; });
    cx /= projected.length; cz /= projected.length;
    const maxR = projected.reduce((m, [x, z]) => Math.max(m, Math.hypot(x - cx, z - cz)), 0);
    if (maxR < 5) continue;
    const count = Math.min(Math.floor(maxR * 0.15), 4);  // was 0.35 / cap 8 — too dense
    const seed = Math.round(Math.abs(cx * 100 + cz));
    positions.push(...scatter(cx, cz, count, maxR * 0.65, seed));
  }

  const pts = positions.slice(0, 500);
  if (pts.length === 0) return group;

  // ── Procedural ez-tree canopy ─────────────────────────────────────────────
  // Instance a few pre-generated ez-tree prototypes across the placed positions.
  const protos = prototypes ?? getSharedTreePrototypes();
  group.add(buildTreeInstances(protos, pts, 77777));
  return group;
}
