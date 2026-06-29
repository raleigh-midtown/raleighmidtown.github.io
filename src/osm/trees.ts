import * as THREE from 'three';
import type { FeatureCollection, Feature, Polygon } from 'geojson';
import { projectLonLat } from './project.js';
import { getSharedTreePrototypes, buildTreeInstances, type TreePrototype } from '../scene/treeFactory.js';

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

// `prototypes` is injectable so the placement pipeline stays testable without
// running ez-tree (which needs a DOM). Production callers omit it; it is then
// generated from ez-tree at scene-build time.
export function buildTrees(geojson: FeatureCollection, prototypes?: TreePrototype[]): THREE.Group {
  const group = new THREE.Group();
  const positions: [number, number][] = [];

  // ── Midtown Park perimeter trees ──────────────────────────────────────────
  // Park bounds: x[241,346] z[201,270]
  // Adjacent buildings (bounding boxes):
  //   Chuy's:        x[209,246] z[193,230]  — NW corner
  //   Midtown Green: x[229,369] z[147,225]  — north side (apartment building)
  //   Park Central:  x[188,324] z[236,327]  — south/west sides
  //
  // Safe zones (rows placed 3 m inside park boundary to stay on the lawn edge):
  //   West edge (x=244): z=238–268 (south of Chuy's z=230 + buffer; north of Park Central z=236)
  //   East edge (x=343): z=227–268
  //   North row (z=227): x=241–346, south of Midtown Green (z≈225) + 2m buffer
  //   South row (z=268): x=241–346, north of Park Central (z≈236) — stays inside lawn
  positions.push(...treeRow(244, 238, 244, 268, 2, 1.0, 101));  // west edge (wider gap)
  positions.push(...treeRow(343, 227, 343, 268, 2, 1.0, 202));  // east edge (wider gap)
  positions.push(...treeRow(241, 227, 346, 227, 6, 1.0, 303));  // north long edge (length-wise)
  positions.push(...treeRow(241, 268, 346, 268, 6, 1.0, 404));  // south long edge (length-wise)

  // ── The Commons park ──────────────────────────────────────────────────────
  // Actual park at x[-237,-217] z[178,198] — scatter trees inside it
  positions.push(...scatter(-228, 188, 12, 16, 7));

  // ── Street trees north of core (sparse) ───────────────────────────────────
  positions.push(...scatter(-50, -90, 6, 55, 99));

  // ── OSM grass / park polygons ─────────────────────────────────────────────
  // Skip Midtown Park (open lawn) and Midtown Green (it's a building, not a park)
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
    const count = Math.min(Math.floor(maxR * 0.35), 8);
    const seed = Math.round(Math.abs(cx * 100 + cz));
    positions.push(...scatter(cx, cz, count, maxR * 0.65, seed));
  }

  const pts = positions.slice(0, 350);
  if (pts.length === 0) return group;

  // ── Procedural ez-tree canopy ─────────────────────────────────────────────
  // Instance a few pre-generated ez-tree prototypes across the placed positions.
  const protos = prototypes ?? getSharedTreePrototypes();
  group.add(buildTreeInstances(protos, pts, 77777));
  return group;
}
