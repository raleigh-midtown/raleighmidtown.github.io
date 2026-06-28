import * as THREE from 'three';
import type { FeatureCollection } from 'geojson';
import {
  type Pt,
  collectBuildingBoxes,
  findBuildingByName,
  isInsideAnyBuilding,
  edgeOutwardNormal,
  polygonCentroid,
} from './util/geom.js';
import { makeStallTexture } from './util/stallTexture.js';
import { makeCarGeometry, colorForIndex } from './parkedCars.js';

const BUILDING_NAME = 'Park & Market North Hills';

const PARKING_Y     = 0.08;          // shared parking-surface layer (CONCEPTS.md Y-stack)
const PARKING_COLOR = 0x2a2826;      // dark asphalt, matches parkingLots.ts
const STALL_WIDTH   = 2.5;           // shared stripe cadence — car centres coincide with stripes
const STALL_DEPTH   = 5.0;

const SIDEWALK_GAP  = 3.0;           // walking space between building edge and apron
const APRON_DEPTH   = 5.5;           // one perpendicular stall row deep
const MIN_EDGE_LEN  = 6;             // need room for ~2+ stalls
const FRONTAGE_Z_MIN = 0.5;          // outward normal must point +Z (toward The Eastern / the road)

/**
 * ShapeGeometry from scene-metre corners, using the same (x,-z)/rotateX/translate
 * recipe as util/shapes.ts ringsToGeometry. ShapeGeometry stores the raw shape
 * coordinates as UVs (world metres, not [0,1]), so a stall texture with
 * repeat=(1/STALL_WIDTH, 1/STALL_DEPTH) tiles one stall per stall-size metres —
 * a raw PlaneGeometry with [0,1] UVs would smear a single stripe instead.
 */
function apronGeometry(corners: Pt[]): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(corners[0][0], -corners[0][1]);
  for (let i = 1; i < corners.length; i++) shape.lineTo(corners[i][0], -corners[i][1]);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, PARKING_Y, 0);
  return geo;
}

/**
 * Build the road-level parking treatment along Park & Market North Hills'
 * street-facing frontage (the edge facing The Eastern / the road): an asphalt
 * apron with painted stall stripes plus a perpendicular row of parked cars,
 * offset outward to leave a sidewalk gap and clear the road.
 *
 * Placement mirrors buildStreetBenches (perimeter walk + outward normals +
 * isInsideAnyBuilding guard); the apron material recipe mirrors buildParkingLots.
 * Cars are decorative — the InstancedMesh is never added to the BVH.
 */
export function buildRoadParking(geojson: FeatureCollection): THREE.Group {
  const group = new THREE.Group();
  group.name = 'roadParking';

  const ring = findBuildingByName(geojson, BUILDING_NAME);
  if (!ring || ring.length < 4) {
    if (!ring) console.warn(`buildRoadParking: building "${BUILDING_NAME}" not found in OSM data`);
    return group;
  }

  const [cx, cz] = polygonCentroid(ring);
  const boxes = collectBuildingBoxes(geojson);

  // Select the single longest frontage edge: outward normal pointing +Z
  // (toward The Eastern) and its apron band clear of adjacent buildings.
  let best: { ax: number; az: number; ux: number; uz: number; outX: number; outZ: number; L: number } | null = null;
  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[i + 1];
    const dx = bx - ax, dz = bz - az;
    const L = Math.sqrt(dx * dx + dz * dz);
    if (L < MIN_EDGE_LEN) continue;

    const ux = dx / L, uz = dz / L;
    const [outX, outZ] = edgeOutwardNormal(ax, az, bx, bz, cx, cz);
    if (outZ < FRONTAGE_Z_MIN) continue;            // not a +Z-facing frontage

    // Band-clear test: sample mid-band points along the edge; reject if any
    // lands inside an adjacent building footprint.
    const midOut = SIDEWALK_GAP + APRON_DEPTH / 2;
    let clear = true;
    for (const f of [0.2, 0.5, 0.8]) {
      const sx = ax + ux * (L * f) + outX * midOut;
      const sz = az + uz * (L * f) + outZ * midOut;
      if (isInsideAnyBuilding(sx, sz, boxes)) { clear = false; break; }
    }
    if (!clear) continue;

    if (!best || L > best.L) best = { ax, az, ux, uz, outX, outZ, L };
  }

  if (!best) return group;

  // Apron: a quad offset SIDEWALK_GAP outward, APRON_DEPTH deep.
  const { ax, az, ux, uz, outX, outZ, L } = best;
  const innerOff = SIDEWALK_GAP, outerOff = SIDEWALK_GAP + APRON_DEPTH;
  const bx = ax + ux * L, bz = az + uz * L;
  const corners: Pt[] = [
    [ax + outX * innerOff, az + outZ * innerOff],
    [bx + outX * innerOff, bz + outZ * innerOff],
    [bx + outX * outerOff, bz + outZ * outerOff],
    [ax + outX * outerOff, az + outZ * outerOff],
  ];

  const apronGeo = apronGeometry(corners);
  let map: THREE.CanvasTexture | null = makeStallTexture();
  if (map) {
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(1 / STALL_WIDTH, 1 / STALL_DEPTH);
    map.needsUpdate = true;
  }
  const apronMat = new THREE.MeshStandardMaterial({
    color: PARKING_COLOR,
    roughness: 0.95,
    metalness: 0,
    ...(map ? { map } : {}),
  });
  const apron = new THREE.Mesh(apronGeo, apronMat);
  apron.receiveShadow = true;
  apron.renderOrder = 1;
  group.add(apron);

  // Stall transforms: perpendicular row, nose toward the building (inward).
  const yaw = Math.atan2(-outX, -outZ);
  const midOut = SIDEWALK_GAP + APRON_DEPTH / 2;
  const num = Math.max(1, Math.floor(L / STALL_WIDTH));
  const positions: THREE.Vector3[] = [];
  for (let k = 0; k < num; k++) {
    const t = (k + 0.5) * (L / num);
    const px = ax + ux * t + outX * midOut;
    const pz = az + uz * t + outZ * midOut;
    if (isInsideAnyBuilding(px, pz, boxes)) continue;
    positions.push(new THREE.Vector3(px, PARKING_Y, pz));
  }

  // Zero-survivor guard: apron-only group, no zero-count InstancedMesh.
  if (positions.length === 0) return group;

  const carGeo = makeCarGeometry();
  // White base colour so per-instance setColorAt renders the palette untinted.
  const carMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.15 });
  const cars = new THREE.InstancedMesh(carGeo, carMat, positions.length);
  cars.name = 'roadParkingCars';
  cars.castShadow = true;
  cars.receiveShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const scale = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < positions.length; i++) {
    m.compose(positions[i], q, scale);
    cars.setMatrixAt(i, m);
    cars.setColorAt(i, colorForIndex(i));
  }
  cars.instanceMatrix.needsUpdate = true;
  if (cars.instanceColor) cars.instanceColor.needsUpdate = true;

  group.add(cars);
  return group;
}
