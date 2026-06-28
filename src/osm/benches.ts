import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FeatureCollection, Feature } from 'geojson';
import { projectLonLat } from './project.js';
import {
  type Pt,
  collectBuildingBoxes,
  isInsideAnyBuilding,
  edgeInwardNormal,
  edgeOutwardNormal,
  getRings,
  pointInRing,
  polygonCentroid,
} from './util/geom.js';

const BENCH_SPACING      = 12;
const BENCH_INSET        = 2.2;   // distance inside the park edge
const STREET_BENCH_INSET = 2.5;   // distance outward from building edge (lands on sidewalk)
const MIN_EDGE_LEN       = 3;     // skip segments too short to fit a bench
const SEAT_W = 1.8;
const SEAT_D = 0.45;
const SEAT_H = 0.08;
const SEAT_Y = 0.45;
const BACK_H = 0.6;
const LEG_W = 0.1;

const MIDTOWN_PARK_NAME = 'Midtown Park';

// Lazy-initialized on first buildBenches() call — avoids import-time GPU allocation.
let WOOD_MAT: THREE.MeshStandardMaterial | undefined;
function getWoodMat(): THREE.MeshStandardMaterial {
  return WOOD_MAT ??= new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.85, metalness: 0 });
}

function makeBench(cx: number, cz: number, yawRad: number): THREE.BufferGeometry[] {
  // Bench oriented along local +X (yaw=0 → seat faces +Z when "front" is +Z).
  const parts: THREE.BufferGeometry[] = [];

  // Seat
  const seat = new THREE.BoxGeometry(SEAT_W, SEAT_H, SEAT_D);
  seat.translate(0, SEAT_Y + SEAT_H / 2, 0);
  parts.push(seat);

  // Backrest (behind, at -Z)
  const back = new THREE.BoxGeometry(SEAT_W, BACK_H, SEAT_H);
  back.translate(0, SEAT_Y + BACK_H / 2, -SEAT_D / 2 + SEAT_H / 2);
  parts.push(back);

  // Four legs
  const legGeo = (x: number, z: number) => {
    const g = new THREE.BoxGeometry(LEG_W, SEAT_Y, LEG_W);
    g.translate(x, SEAT_Y / 2, z);
    return g;
  };
  parts.push(legGeo(-SEAT_W / 2 + 0.1,  SEAT_D / 2 - 0.05));
  parts.push(legGeo( SEAT_W / 2 - 0.1,  SEAT_D / 2 - 0.05));
  parts.push(legGeo(-SEAT_W / 2 + 0.1, -SEAT_D / 2 + 0.05));
  parts.push(legGeo( SEAT_W / 2 - 0.1, -SEAT_D / 2 + 0.05));

  for (const p of parts) {
    p.rotateY(yawRad);
    p.translate(cx, 0, cz);
  }
  return parts;
}

function findMidtownPark(geojson: FeatureCollection): Pt[] | null {
  for (const f of geojson.features as Feature[]) {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    if (String(p['name'] ?? '') !== MIDTOWN_PARK_NAME) continue;
    const rings = getRings(f as Feature);
    if (rings.length === 0) continue;
    return rings[0].map(c => projectLonLat(c[0], c[1]));
  }
  return null;
}

/** Generalises findMidtownPark — finds any named building polygon by its OSM name. */
function findBuildingByName(geojson: FeatureCollection, name: string): Pt[] | null {
  for (const f of geojson.features as Feature[]) {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    if (String(p['name'] ?? '') !== name) continue;
    const rings = getRings(f as Feature);
    if (rings.length === 0) continue;
    return rings[0].map(c => projectLonLat(c[0], c[1]));
  }
  return null;
}

/**
 * Place benches along every viable perimeter segment of Midtown Park, facing
 * inward toward the lawn. Candidates that fall inside an adjacent building
 * footprint (Midtown Green, Park Central, Chuy's, etc.) are dropped so no
 * bench ends up embedded in a wall.
 */
export function buildBenches(geojson: FeatureCollection): THREE.Group {
  const group = new THREE.Group();
  const park = findMidtownPark(geojson);
  if (!park || park.length < 4) return group;

  const [cx, cz] = polygonCentroid(park);
  const buildingBoxes = collectBuildingBoxes(geojson);
  const geos: THREE.BufferGeometry[] = [];

  // Walk every consecutive vertex pair of the closed park ring.
  for (let i = 0; i < park.length - 1; i++) {
    const [ax, az] = park[i];
    const [bx, bz] = park[i + 1];
    const dx = bx - ax, dz = bz - az;
    const L = Math.sqrt(dx * dx + dz * dz);
    if (L < MIN_EDGE_LEN) continue;

    const ux = dx / L, uz = dz / L;
    const [inX, inZ] = edgeInwardNormal(ax, az, bx, bz, cx, cz);
    // Bench yaw rotates the local +Z (front) to the inward normal.
    const yaw = Math.atan2(inX, inZ);

    // Fit floor(L / spacing) benches centered on the edge so the row reads
    // even when L isn't a multiple of spacing.
    const num = Math.max(1, Math.floor(L / BENCH_SPACING));
    for (let k = 0; k < num; k++) {
      const t = (k + 0.5) * (L / num);
      const tx = ax + ux * t + inX * BENCH_INSET;
      const tz = az + uz * t + inZ * BENCH_INSET;
      if (!pointInRing(tx, tz, park)) continue;
      if (isInsideAnyBuilding(tx, tz, buildingBoxes)) continue;
      geos.push(...makeBench(tx, tz, yaw));
    }
  }

  if (geos.length === 0) return group;

  const merged = mergeGeometries(geos, false);
  if (!merged) {
    for (const g of geos) g.dispose();
    return group;
  }
  for (const g of geos) g.dispose();

  const mesh = new THREE.Mesh(merged, getWoodMat());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.name = 'benches';
  group.add(mesh);

  return group;
}

const STREET_BENCH_BUILDINGS = ['Park & Market North Hills', 'The Eastern'] as const;

/**
 * Place bench clusters along the perimeter edges of Park & Market North Hills
 * and The Eastern, facing outward toward the street. Benches are offset
 * STREET_BENCH_INSET metres outward from each edge so they land on the
 * adjacent sidewalk. Candidates that clip an adjacent building footprint are
 * dropped by the isInsideAnyBuilding guard.
 */
export function buildStreetBenches(geojson: FeatureCollection): THREE.Group {
  const group = new THREE.Group();
  // Collect building boxes once — shared across all named buildings.
  const buildingBoxes = collectBuildingBoxes(geojson);
  const geos: THREE.BufferGeometry[] = [];

  for (const name of STREET_BENCH_BUILDINGS) {
    const ring = findBuildingByName(geojson, name);
    if (!ring || ring.length < 4) continue;

    const [cx, cz] = polygonCentroid(ring);

    for (let i = 0; i < ring.length - 1; i++) {
      const [ax, az] = ring[i];
      const [bx, bz] = ring[i + 1];
      const dx = bx - ax, dz = bz - az;
      const L = Math.sqrt(dx * dx + dz * dz);
      if (L < MIN_EDGE_LEN) continue;

      const ux = dx / L, uz = dz / L;
      const [outX, outZ] = edgeOutwardNormal(ax, az, bx, bz, cx, cz);
      // Bench front faces the street (outward from the building).
      const yaw = Math.atan2(outX, outZ);

      const num = Math.max(1, Math.floor(L / BENCH_SPACING));
      for (let k = 0; k < num; k++) {
        const t = (k + 0.5) * (L / num);
        const tx = ax + ux * t + outX * STREET_BENCH_INSET;
        const tz = az + uz * t + outZ * STREET_BENCH_INSET;
        if (isInsideAnyBuilding(tx, tz, buildingBoxes)) continue;
        geos.push(...makeBench(tx, tz, yaw));
      }
    }
  }

  if (geos.length === 0) return group;

  const merged = mergeGeometries(geos, false);
  if (!merged) {
    for (const g of geos) g.dispose();
    return group;
  }
  for (const g of geos) g.dispose();

  const mesh = new THREE.Mesh(merged, getWoodMat());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.name = 'streetBenches';
  group.add(mesh);

  return group;
}
