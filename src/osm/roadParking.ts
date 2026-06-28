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
import { sceneRingToShape, shapeToGroundGeometry } from './util/shapes.js';
import { PARKING_Y, PARKING_COLOR, STALL_WIDTH, STALL_DEPTH } from './util/parkingSurface.js';
import { makeCarGeometry, colorForIndex } from './parkedCars.js';

const BUILDING_NAME = 'Park & Market North Hills';

const SIDEWALK_GAP  = 3.0;           // walking space between building edge and apron
const APRON_DEPTH   = 5.5;           // stall row depth (fits an angled car)
const MIN_EDGE_LEN  = 6;             // need room for ~2+ stalls
const FRONTAGE_Z_MIN = 0.5;          // outward normal must point +Z (toward The Eastern / the road)

const CAR_SPACING   = 6.0;           // centre-to-centre along the edge → gaps between cars, fewer cars
const STALL_ANGLE   = Math.PI / 4;   // 45° tilt off perpendicular → angled (diagonal) parking
const OCCUPANCY     = 0.65;          // fraction of stalls that hold a car; the rest stay vacant

/** Deterministic pseudo-random in [0,1) — stable vacancy/colour pattern across reloads. */
function stallNoise(k: number): number {
  const s = Math.sin((k + 1) * 12.9898) * 43758.5453;
  return s - Math.floor(s);
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

  // Apron built via the shared world-metre-UV recipe so the stall texture
  // (repeat = 1/STALL_WIDTH, 1/STALL_DEPTH) tiles correctly across the surface.
  const apronGeo = shapeToGroundGeometry(sceneRingToShape(corners), PARKING_Y);
  const map: THREE.CanvasTexture | null = makeStallTexture();
  if (map) {
    // makeStallTexture already sets wrapS/wrapT to RepeatWrapping.
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

  // Stall transforms: angled row, noses tilted toward the building (inward).
  const yaw = Math.atan2(-outX, -outZ) + STALL_ANGLE;
  const midOut = SIDEWALK_GAP + APRON_DEPTH / 2;
  const num = Math.max(1, Math.floor(L / CAR_SPACING));
  const stalls: { pos: THREE.Vector3; k: number }[] = [];
  for (let k = 0; k < num; k++) {
    if (stallNoise(k) > OCCUPANCY) continue;          // leave this stall vacant
    const t = (k + 0.5) * (L / num);
    const px = ax + ux * t + outX * midOut;
    const pz = az + uz * t + outZ * midOut;
    if (isInsideAnyBuilding(px, pz, boxes)) continue;
    stalls.push({ pos: new THREE.Vector3(px, PARKING_Y, pz), k });
  }

  // Zero-survivor guard: apron-only group, no zero-count InstancedMesh.
  if (stalls.length === 0) return group;

  const carGeo = makeCarGeometry();
  // White base colour + vertexColors so baked black wheels / dark glass survive
  // while per-instance setColorAt tints only the body and roof.
  const carMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.6,
    metalness: 0.15,
  });
  const cars = new THREE.InstancedMesh(carGeo, carMat, stalls.length);
  cars.name = 'roadParkingCars';
  cars.castShadow = true;
  cars.receiveShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const scale = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < stalls.length; i++) {
    m.compose(stalls[i].pos, q, scale);
    cars.setMatrixAt(i, m);
    cars.setColorAt(i, colorForIndex(stalls[i].k));
  }
  cars.instanceMatrix.needsUpdate = true;
  if (cars.instanceColor) cars.instanceColor.needsUpdate = true;

  group.add(cars);
  return group;
}
