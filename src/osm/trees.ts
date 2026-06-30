import * as THREE from 'three';
import type { FeatureCollection, Feature, Polygon } from 'geojson';
import { projectLonLat } from './project.js';
import { getSharedTreePrototypes, buildTreeInstances, type TreePrototype } from '../scene/treeFactory.js';
import type { Pt } from './util/geom.js';

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

// Midtown Park border trees — two sparse rows lining the long edges of the lawn
// strip between Midtown Green (south face z≈225) and Park Central (north face
// z≈236). Spacing 16 m → ~7 trees per row, ~14 total. Short ends (west strip,
// east edge) are left open per the "long edges only" intent.
//
// Coordinates are hand-tuned to the building faces rather than derived from the
// OSM park polygon: the park polygon overlaps the adjacent apartment buildings
// (its north edge runs z=201→234, well north of Midtown Green's z=225 face), so
// lining the polygon edge would place trees inside the buildings. The building
// faces are the real, visible lawn boundary.
export function midtownParkRows(): [number, number][] {
  const positions: [number, number][] = [];
  positions.push(...treeRow(241, 227, 346, 227, 16, 1.0, 303)); // north long edge (along Midtown Green)
  positions.push(...treeRow(241, 233, 346, 233, 16, 1.0, 404)); // south long edge (along Park Central)
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

  // ── Midtown Park — sparse rows along the two long edges only ───────────────
  // See midtownParkRows: rows follow the building faces (the visible lawn
  // boundary), not the OSM park polygon (which overlaps the buildings).
  positions.push(...midtownParkRows());

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
