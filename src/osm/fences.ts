import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';
import { projectLonLat } from './project.js';
import {
  WALL_WEST_X, WALL_WEST_Z, WALL_UX, WALL_UZ,
  TERRACE_LEN, DECK_ROAD,
} from './parkCentralTerrace.js';

const FENCE_OFFSET = 0.6;   // how far outside the wall the fence sits
const FENCE_HEIGHT = 1.3;
const POST_SPACING = 2.2;
const POST_THICK = 0.10;
const RAIL_THICK = 0.06;
const RAIL_DEPTH = 0.05;
const MIN_EDGE = 1.5;
const MIN_PERIMETER = 18;   // skip tiny buildings (sheds, kiosks)
const Y_BASE = 0.0;

function getRings(feature: Feature): number[][][] {
  const g = feature.geometry;
  if (!g) return [];
  if (g.type === 'Polygon') return [(g as Polygon).coordinates[0] as number[][]];
  if (g.type === 'MultiPolygon') return (g as MultiPolygon).coordinates.map(r => r[0] as number[][]);
  return [];
}

// Outward unit normal for edge [a→b] given polygon centroid
function outwardNormal(
  ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number,
): [number, number] {
  const dx = bx - ax, dz = bz - az;
  const L = Math.sqrt(dx * dx + dz * dz);
  let nx = -dz / L, nz = dx / L;
  const midX = (ax + bx) / 2, midZ = (az + bz) / 2;
  if (nx * (cx - midX) + nz * (cz - midZ) > 0) { nx = -nx; nz = -nz; }
  return [nx, nz];
}

// Box from A→B aligned to (tx,tz), with given thickness across, height in Y, offset above ground.
function railBox(
  ax: number, az: number, bx: number, bz: number,
  height: number, depth: number, yMid: number,
): THREE.BufferGeometry {
  const dx = bx - ax, dz = bz - az;
  const L = Math.sqrt(dx * dx + dz * dz);
  const geo = new THREE.BoxGeometry(L, height, depth);
  geo.translate(L / 2, 0, 0);
  const angle = Math.atan2(dz, dx);
  geo.rotateY(-angle);
  geo.translate(ax, yMid, az);
  return geo;
}

function postBox(x: number, z: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(POST_THICK, FENCE_HEIGHT, POST_THICK);
  geo.translate(x, Y_BASE + FENCE_HEIGHT / 2, z);
  return geo;
}

export function buildFences(geojson: FeatureCollection): THREE.Group {
  const railGeos: THREE.BufferGeometry[] = [];
  const postGeos: THREE.BufferGeometry[] = [];

  // Rail Y centers
  const yTop = Y_BASE + FENCE_HEIGHT - RAIL_THICK / 2;
  const yMid = Y_BASE + FENCE_HEIGHT * 0.55;
  const yBot = Y_BASE + 0.08;

  for (const feature of geojson.features as Feature[]) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    if (!props['building'] || props['building'] === 'roof') continue;

    for (const ring of getRings(feature)) {
      if (ring.length < 4) continue;

      const pts: [number, number][] = ring.map(c => projectLonLat(c[0], c[1]));

      // Centroid
      let cx = 0, cz = 0;
      for (const [x, z] of pts) { cx += x; cz += z; }
      cx /= pts.length; cz /= pts.length;

      // Total perimeter — skip tiny buildings
      let perim = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const dx = pts[i + 1][0] - pts[i][0];
        const dz = pts[i + 1][1] - pts[i][1];
        perim += Math.sqrt(dx * dx + dz * dz);
      }
      if (perim < MIN_PERIMETER) continue;

      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i];
        const [bx, bz] = pts[i + 1];
        const dx = bx - ax, dz = bz - az;
        const L = Math.sqrt(dx * dx + dz * dz);
        if (L < MIN_EDGE) continue;

        const [nx, nz] = outwardNormal(ax, az, bx, bz, cx, cz);
        const oax = ax + nx * FENCE_OFFSET, oaz = az + nz * FENCE_OFFSET;
        const obx = bx + nx * FENCE_OFFSET, obz = bz + nz * FENCE_OFFSET;

        // Suppress fence segments that fall under the Park Central north-wall
        // terrace deck: the deck is a solid ExtrudeGeometry (top at Y=1.8) that
        // would bury the ground-level fence (Y∈[0,1.3]). The deck spans along-wall
        // s ∈ [0, TERRACE_LEN] and outward d ∈ [−DECK_BACK, DECK_ROAD]; the
        // relocated iron railing now marks that edge at deck-top level (see
        // parkCentralTerrace.ts), so the buried segment is skipped here.
        const midX = (oax + obx) / 2, midZ = (oaz + obz) / 2;
        const fs = (midX - WALL_WEST_X) * WALL_UX + (midZ - WALL_WEST_Z) * WALL_UZ;
        const fd = (midX - WALL_WEST_X) * WALL_UZ + (midZ - WALL_WEST_Z) * (-WALL_UX);
        if (fs >= -1 && fs <= TERRACE_LEN + 1 && fd >= -1.5 && fd <= DECK_ROAD + 0.5) {
          continue;
        }

        // Three horizontal rails along the offset edge
        railGeos.push(railBox(oax, oaz, obx, obz, RAIL_THICK, RAIL_DEPTH, yTop));
        railGeos.push(railBox(oax, oaz, obx, obz, RAIL_THICK, RAIL_DEPTH, yMid));
        railGeos.push(railBox(oax, oaz, obx, obz, RAIL_THICK, RAIL_DEPTH, yBot));

        // Posts: start at edge start, then every POST_SPACING, plus final post at edge end
        const numPosts = Math.max(2, Math.floor(L / POST_SPACING) + 1);
        for (let p = 0; p < numPosts; p++) {
          const t = p / (numPosts - 1);
          postGeos.push(postBox(oax + (obx - oax) * t, oaz + (obz - oaz) * t));
        }
      }
    }
  }

  const group = new THREE.Group();

  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1c,
    roughness: 0.55,
    metalness: 0.65,
  });

  const addMerged = (geos: THREE.BufferGeometry[]) => {
    if (geos.length === 0) return;
    const merged = mergeGeometries(geos, false);
    if (!merged) return;
    for (const g of geos) g.dispose();
    const mesh = new THREE.Mesh(merged, ironMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  addMerged(railGeos);
  addMerged(postGeos);

  return group;
}
