/**
 * midtownScene.ts
 * Complete low-poly Midtown Raleigh cityscape builder.
 * All building/road/park/shop geometry is defined inline — no external JSON imports.
 * Exports buildMidtownScene(scene) → THREE.Mesh[] (building meshes only).
 */

import * as THREE from 'three';
import { getSharedTreePrototypes, buildTreeInstances } from './treeFactory.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// Palette materials (shared module-level singletons)
// ---------------------------------------------------------------------------
function stdMat(hex: number, emissive = 0, emissInt = 0, flat = true): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: hex,
    flatShading: flat,
    emissive: emissive,
    emissiveIntensity: emissInt,
  });
}

const MAT_GLASS_TOWER      = stdMat(0x7FA8C9);
const MAT_GLASS_TOWER_DARK = stdMat(0x5C7E99);
const MAT_CONCRETE         = stdMat(0xA8A29A);
const MAT_CONCRETE_DARK    = stdMat(0x8C8780);
const MAT_BRICK            = stdMat(0xB97A56);
const MAT_RETAIL_LIGHT     = stdMat(0xD8CFC0);
const MAT_RETAIL_MID       = stdMat(0xC2B8A3);
const MAT_WINDOW           = stdMat(0x1a1a2a, 0xFFEE88, 0.6);
MAT_WINDOW.side = THREE.DoubleSide;
const MAT_ROAD_DARK        = stdMat(0x2E2E33);
const MAT_ROAD_MID         = stdMat(0x363636);
const MAT_ROAD_LOCAL       = stdMat(0x454540);
const MAT_SIDEWALK         = stdMat(0x6B6560);
const MAT_GRASS            = stdMat(0x6A8F5A);
const MAT_GRASS_DARK       = stdMat(0x4F7040);
const MAT_PAVEMENT         = stdMat(0xB5AE9E);
const MAT_PAVING           = stdMat(0xC8BFB0);
const MAT_PARK_PATH        = stdMat(0xCFC6B5);
const MAT_SIGNAL_RED       = stdMat(0xCC2200, 0xCC2200, 0.8);
const MAT_SIGNAL_YELLOW    = stdMat(0xCCAA00, 0xCCAA00, 0.5);
const MAT_SIGNAL_GREEN     = stdMat(0x00AA44, 0x00AA44, 0.8);
const MAT_SIGN_POLE        = stdMat(0x555550);
const MAT_STOP_SIGN        = stdMat(0xCC0000, 0xCC0000, 0.3);
const MAT_FOUNTAIN         = stdMat(0x6899B8);
const MAT_BALCONY          = stdMat(0x7A6F68);
const MAT_DIVIDER_YELLOW   = stdMat(0xFFDD33);
const MAT_DIVIDER_WHITE    = stdMat(0xEEEEDD);
const MAT_BENCH            = stdMat(0x8B7355);
const MAT_PLANTER          = stdMat(0x7A6B5A);
const MAT_LIGHTS_STR       = stdMat(0xFFFFAA, 0xFFEE88, 1.0);
const MAT_AWNING           = stdMat(0xCC4422);
const MAT_STONE_GLASS      = stdMat(0xD4C8B0);
const MAT_ROOFTOP_RAILING  = stdMat(0x8C8780);

// ---------------------------------------------------------------------------
// Canvas sign texture helpers
// ---------------------------------------------------------------------------
function makeSignTexture(text: string, bgColor = '#2C5F2E'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = bgColor;
  ctx.fillRect(3, 3, 250, 58);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.toUpperCase(), 128, 32);
  return new THREE.CanvasTexture(canvas);
}

function makeShopSignTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1A1A2A';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 32);
  return new THREE.CanvasTexture(canvas);
}

// ---------------------------------------------------------------------------
// Window helpers
// ---------------------------------------------------------------------------
function wCount(fw: number, h: number, spc = 3.5): number {
  return Math.max(1, Math.floor(fw / spc)) * Math.max(1, Math.floor((h - 1.5) / spc));
}
function wBox(w: number, h: number, d: number): number {
  return 2 * wCount(w, h) + 2 * wCount(d, h);
}

// ---------------------------------------------------------------------------
// Helper: rotate a Vector3 around Y
// ---------------------------------------------------------------------------
function applyY(v: THREE.Vector3, angle: number): THREE.Vector3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return new THREE.Vector3(
    v.x * cos - v.z * sin,
    v.y,
    v.x * sin + v.z * cos,
  );
}

// ---------------------------------------------------------------------------
// Single dummy object for instanced window placement (module scope)
// ---------------------------------------------------------------------------
const dummy = new THREE.Object3D();

// ---------------------------------------------------------------------------
// Window placement for one box building
// ---------------------------------------------------------------------------
function placeWindowsForBox(
  inst: THREE.InstancedMesh,
  idx: number,
  bPos: THREE.Vector3,
  rotY: number,
  w: number,
  h: number,
  d: number,
  spc = 3.5,
): number {
  const faces: { localN: THREE.Vector3; localOffset: THREE.Vector3; faceWidth: number }[] = [
    { localN: new THREE.Vector3(0, 0, -1), localOffset: new THREE.Vector3(0, 0, -d / 2), faceWidth: w },
    { localN: new THREE.Vector3(0, 0,  1), localOffset: new THREE.Vector3(0, 0,  d / 2), faceWidth: w },
    { localN: new THREE.Vector3(-1, 0, 0), localOffset: new THREE.Vector3(-w / 2, 0, 0), faceWidth: d },
    { localN: new THREE.Vector3( 1, 0, 0), localOffset: new THREE.Vector3( w / 2, 0, 0), faceWidth: d },
  ];

  for (const face of faces) {
    const worldN = applyY(face.localN, rotY);
    const faceCenter = new THREE.Vector3().copy(bPos).add(applyY(face.localOffset, rotY));
    faceCenter.y = bPos.y;

    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, worldN).normalize();
    if (right.lengthSq() < 0.001) continue;
    const m = new THREE.Matrix4().makeBasis(right, up, worldN);
    const q = new THREE.Quaternion().setFromRotationMatrix(m);

    const fw = face.faceWidth;
    const numCols = Math.max(1, Math.floor(fw / spc));
    const numRows = Math.max(1, Math.floor((h - 1.5) / spc));

    for (let col = 0; col < numCols; col++) {
      for (let row = 0; row < numRows; row++) {
        if (idx >= inst.count) return idx;
        const xOff = (col - (numCols - 1) * 0.5) * spc;
        const yOff = row * spc + 1.5;
        const pos = new THREE.Vector3(
          faceCenter.x + right.x * xOff,
          bPos.y + yOff,
          faceCenter.z + right.z * xOff,
        );
        pos.addScaledVector(worldN, 0.05);

        dummy.position.copy(pos);
        dummy.quaternion.copy(q);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        inst.setMatrixAt(idx++, dummy.matrix);
      }
    }
  }

  return idx;
}

// ---------------------------------------------------------------------------
// Road ribbon helpers
// ---------------------------------------------------------------------------
function roadRibbon(
  path: { x: number; z: number }[],
  halfW: number,
  y = 0.02,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  let vi = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const ax = path[i].x,   az = path[i].z;
    const bx = path[i+1].x, bz = path[i+1].z;
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.001) continue;
    const nx = -dz / len;
    const nz =  dx / len;

    positions.push(
      ax - nx * halfW, y, az - nz * halfW,
      ax + nx * halfW, y, az + nz * halfW,
      bx + nx * halfW, y, bz + nz * halfW,
      bx - nx * halfW, y, bz - nz * halfW,
    );

    indices.push(vi, vi+1, vi+2, vi, vi+2, vi+3);
    vi += 4;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function sidewalkRibbon(
  path: { x: number; z: number }[],
  halfW: number,
  sideSign: 1 | -1,
  y = 0.06,
): THREE.BufferGeometry {
  const sidewalkHalfW = 1.0;
  const offset = (halfW + sidewalkHalfW) * sideSign;
  const oPath: { x: number; z: number }[] = [];

  for (let i = 0; i < path.length; i++) {
    let dx = 0, dz = 0;
    if (i < path.length - 1) { dx += path[i+1].x - path[i].x; dz += path[i+1].z - path[i].z; }
    if (i > 0)               { dx += path[i].x - path[i-1].x; dz += path[i].z - path[i-1].z; }
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.001) { oPath.push(path[i]); continue; }
    const nx = -dz / len;
    const nz =  dx / len;
    oPath.push({ x: path[i].x + nx * offset, z: path[i].z + nz * offset });
  }

  return roadRibbon(oPath, sidewalkHalfW, y);
}

function laneDividerGeometry(
  path: { x: number; z: number }[],
  offsetN = 0,
  dashLen = 3.0,
  gapLen  = 3.0,
  dashHalfW = 0.12,
  y = 0.04,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices:   number[] = [];
  let vi = 0;

  let phase = 0;
  let remain = dashLen;

  for (let i = 0; i < path.length - 1; i++) {
    const ax = path[i].x,   az = path[i].z;
    const bx = path[i+1].x, bz = path[i+1].z;
    const dx = bx - ax, dz = bz - az;
    const segLen = Math.sqrt(dx*dx + dz*dz);
    if (segLen < 0.001) continue;

    const tx = dx / segLen;
    const tz = dz / segLen;
    const nx = -tz;
    const nz =  tx;

    let segOffset = 0;
    let segRemain = segLen;

    while (segRemain > 0.001) {
      const step = Math.min(remain, segRemain);

      if (phase === 0) {
        const x0 = ax + tx * segOffset + nx * offsetN;
        const z0 = az + tz * segOffset + nz * offsetN;
        const x1 = x0 + tx * step;
        const z1 = z0 + tz * step;

        positions.push(
          x0 - nx * dashHalfW, y, z0 - nz * dashHalfW,
          x0 + nx * dashHalfW, y, z0 + nz * dashHalfW,
          x1 + nx * dashHalfW, y, z1 + nz * dashHalfW,
          x1 - nx * dashHalfW, y, z1 - nz * dashHalfW,
        );
        indices.push(vi, vi+1, vi+2, vi, vi+2, vi+3);
        vi += 4;
      }

      segOffset += step;
      segRemain -= step;
      remain    -= step;

      if (remain < 0.001) {
        phase  = 1 - phase;
        remain = phase === 0 ? dashLen : gapLen;
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------------
// Road building
// ---------------------------------------------------------------------------
interface RoadDef {
  type: 'arterial' | 'collector' | 'local' | 'pedestrian';
  width_m: number;
  path: { x: number; z: number }[];
}

function buildRoad(roadDef: RoadDef, scene: THREE.Scene): void {
  const halfW = roadDef.width_m / 2;
  const roadMat = roadDef.type === 'arterial'
    ? MAT_ROAD_DARK
    : roadDef.type === 'collector'
      ? MAT_ROAD_MID
      : MAT_ROAD_LOCAL;

  const roadGeo = roadRibbon(roadDef.path, halfW);
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;
  scene.add(roadMesh);

  const sw1Geo = sidewalkRibbon(roadDef.path, halfW,  1);
  const sw2Geo = sidewalkRibbon(roadDef.path, halfW, -1);
  const sw1 = new THREE.Mesh(sw1Geo, MAT_SIDEWALK);
  const sw2 = new THREE.Mesh(sw2Geo, MAT_SIDEWALK);
  sw1.receiveShadow = true;
  sw2.receiveShadow = true;
  scene.add(sw1);
  scene.add(sw2);

  // Yellow dashed centre line
  const centreGeo = laneDividerGeometry(roadDef.path, 0);
  scene.add(new THREE.Mesh(centreGeo, MAT_DIVIDER_YELLOW));

  // White inner-lane dashes for arterial roads
  if (roadDef.type === 'arterial') {
    const laneOff = halfW / 2;
    scene.add(new THREE.Mesh(laneDividerGeometry(roadDef.path,  laneOff), MAT_DIVIDER_WHITE));
    scene.add(new THREE.Mesh(laneDividerGeometry(roadDef.path, -laneOff), MAT_DIVIDER_WHITE));
  }
}

// ---------------------------------------------------------------------------
// Traffic light prop
// ---------------------------------------------------------------------------
function makeTrafficLight(x: number, z: number, rotY: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotY;

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 5, 6), MAT_SIGN_POLE);
  pole.position.set(0, 2.5, 0);
  pole.castShadow = true;
  group.add(pole);

  const arm = new THREE.Mesh(new THREE.BoxGeometry(2, 0.15, 0.15), MAT_SIGN_POLE);
  arm.position.set(1, 5, 0);
  arm.castShadow = true;
  group.add(arm);

  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.8, 0.4), MAT_CONCRETE_DARK);
  housing.position.set(2, 4.7, 0);
  housing.castShadow = true;
  group.add(housing);

  const signalGeo = new THREE.SphereGeometry(0.2, 6, 6);
  const redLight = new THREE.Mesh(signalGeo, MAT_SIGNAL_RED);
  redLight.position.set(2, 5.3, 0.21);
  group.add(redLight);

  const yellowLight = new THREE.Mesh(signalGeo, MAT_SIGNAL_YELLOW);
  yellowLight.position.set(2, 4.7, 0.21);
  group.add(yellowLight);

  const greenLight = new THREE.Mesh(signalGeo, MAT_SIGNAL_GREEN);
  greenLight.position.set(2, 4.1, 0.21);
  group.add(greenLight);

  return group;
}

// ---------------------------------------------------------------------------
// Stop sign prop
// ---------------------------------------------------------------------------
function makeStopSign(x: number, z: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.8, 6), MAT_SIGN_POLE);
  pole.position.set(0, 1.4, 0);
  group.add(pole);

  const sign = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 8), MAT_STOP_SIGN);
  sign.position.set(0, 2.8, 0);
  group.add(sign);

  return group;
}

// ---------------------------------------------------------------------------
// Street name sign prop
// ---------------------------------------------------------------------------
function makeStreetSign(x: number, z: number, text: string, isPedestrian = false): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const poleR = isPedestrian ? 0.05 : 0.08;
  const poleH = isPedestrian ? 2.0 : 4.5;
  const boardW = isPedestrian ? 2.5 : 3.5;
  const boardH = isPedestrian ? 0.5 : 0.7;

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(poleR, poleR, poleH, 6), MAT_SIGN_POLE);
  pole.position.set(0, poleH / 2, 0);
  group.add(pole);

  const signTex = makeSignTexture(text, isPedestrian ? '#1A4A6A' : '#2C5F2E');
  const signMat = new THREE.MeshStandardMaterial({
    map: signTex,
    flatShading: false,
  });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(boardW, boardH), signMat);
  board.position.set(0, poleH + boardH / 2, 0);
  board.rotation.y = Math.PI / 4; // angle 45° so visible from street
  group.add(board);

  return group;
}

// ---------------------------------------------------------------------------
// Park builder
// ---------------------------------------------------------------------------
function buildPark(scene: THREE.Scene): void {
  const cx = -73, cz = -163;

  // 1. Outer border slab
  const borderGeo = new THREE.PlaneGeometry(86, 61);
  const border = new THREE.Mesh(borderGeo, MAT_PAVEMENT);
  border.rotation.x = -Math.PI / 2;
  border.position.set(cx, 0.008, cz);
  border.receiveShadow = true;
  scene.add(border);

  // 2. Central lawn zone
  const lawnGeo = new THREE.PlaneGeometry(35, 25);
  const lawn = new THREE.Mesh(lawnGeo, MAT_GRASS);
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(cx, 0.015, cz);
  lawn.receiveShadow = true;
  scene.add(lawn);

  // 3. Shaded grove zone
  const groveGeo = new THREE.PlaneGeometry(20, 18);
  const grove = new THREE.Mesh(groveGeo, MAT_GRASS_DARK);
  grove.rotation.x = -Math.PI / 2;
  grove.position.set(-100, 0.015, -185);
  grove.receiveShadow = true;
  scene.add(grove);

  // Shared ez-tree prototypes for the hand-authored grove + lawn trees,
  // matching the OSM trees. Generated at scene-build time (ez-tree needs a DOM).
  const treeProtos = getSharedTreePrototypes();

  // 7 trees in shaded grove
  const groveCenters: [number, number][] = [
    [-103, -187], [-98, -181], [-106, -179], [-96, -191],
    [-101, -175], [-108, -185], [-94, -183],
  ];
  scene.add(buildTreeInstances(treeProtos, groveCenters, 4444));

  // 4. Plaza promenade
  const plazaGeo = new THREE.PlaneGeometry(25, 12);
  const plaza = new THREE.Mesh(plazaGeo, MAT_PAVING);
  plaza.rotation.x = -Math.PI / 2;
  plaza.rotation.z = -5 * DEG;
  plaza.position.set(-50, 0.02, -140);
  plaza.receiveShadow = true;
  scene.add(plaza);

  // 5. Play lawn
  const playGeo = new THREE.PlaneGeometry(18, 15);
  const play = new THREE.Mesh(playGeo, MAT_GRASS);
  play.rotation.x = -Math.PI / 2;
  play.position.set(-45, 0.015, -185);
  play.receiveShadow = true;
  scene.add(play);

  // 6. Park paths
  const parkPaths: { x: number; z: number }[][] = [
    // main diagonal
    [{ x: -105, z: -190 }, { x: -73, z: -163 }, { x: -40, z: -140 }, { x: -10, z: -120 }],
    // perimeter loop
    [{ x: -113, z: -190 }, { x: -90, z: -135 }, { x: -35, z: -130 }, { x: -20, z: -185 }, { x: -60, z: -200 }, { x: -113, z: -190 }],
    // short connector to plaza
    [{ x: -73, z: -163 }, { x: -60, z: -150 }, { x: -50, z: -140 }],
  ];
  for (const pp of parkPaths) {
    const ppGeo = roadRibbon(pp, 1.5, 0.025);
    const ppMesh = new THREE.Mesh(ppGeo, MAT_PARK_PATH);
    ppMesh.receiveShadow = true;
    scene.add(ppMesh);
  }

  // 7. Fountain centerpiece
  const basinGeo = new THREE.CylinderGeometry(4, 4, 0.6, 16);
  const basin = new THREE.Mesh(basinGeo, MAT_PAVEMENT);
  basin.position.set(cx, 0.3, cz);
  basin.castShadow = true;
  basin.receiveShadow = true;
  scene.add(basin);

  const waterConeGeo = new THREE.CylinderGeometry(0.2, 1, 3, 8);
  const waterCone = new THREE.Mesh(waterConeGeo, MAT_FOUNTAIN);
  waterCone.position.set(cx, 1.5, cz);
  scene.add(waterCone);

  // 8. Bench groups
  const seatGeo = new THREE.BoxGeometry(1.8, 0.4, 0.5);
  const legGeo  = new THREE.BoxGeometry(0.1, 0.8, 0.5);

  const benchClusters: { cx: number; cz: number; count: number }[] = [
    { cx: -90, cz: -150, count: 4 },
    { cx: -50, cz: -175, count: 3 },
  ];
  for (const cluster of benchClusters) {
    for (let i = 0; i < cluster.count; i++) {
      const angle = (i / cluster.count) * Math.PI * 2;
      const bx = cluster.cx + Math.cos(angle) * 3;
      const bz = cluster.cz + Math.sin(angle) * 3;

      const seat = new THREE.Mesh(seatGeo, MAT_BENCH);
      seat.position.set(bx, 0.6, bz);
      seat.rotation.y = angle;
      scene.add(seat);

      const leg1 = new THREE.Mesh(legGeo, MAT_BENCH);
      leg1.position.set(bx + Math.cos(angle) * 0.6, 0.4, bz + Math.sin(angle) * 0.6);
      leg1.rotation.y = angle;
      scene.add(leg1);

      const leg2 = new THREE.Mesh(legGeo, MAT_BENCH);
      leg2.position.set(bx - Math.cos(angle) * 0.6, 0.4, bz - Math.sin(angle) * 0.6);
      leg2.rotation.y = angle;
      scene.add(leg2);
    }
  }

  // 9. String lights along plaza
  const lightGeo = new THREE.SphereGeometry(0.12, 4, 4);
  const plazaCenter = { x: -50, z: -140 };
  const lightCount = 7;
  for (let i = 0; i < lightCount; i++) {
    const t = i / (lightCount - 1);
    const lx = plazaCenter.x - 12 + t * 24;
    const lz = plazaCenter.z;
    const light = new THREE.Mesh(lightGeo, MAT_LIGHTS_STR);
    light.position.set(lx, 4, lz);
    scene.add(light);
  }

  // 10. Perimeter planters along perimeter loop
  const planterGeo = new THREE.BoxGeometry(1.2, 0.5, 0.6);
  const perimLoop: { x: number; z: number }[] = [
    { x: -113, z: -190 }, { x: -90, z: -135 }, { x: -35, z: -130 },
    { x: -20, z: -185 }, { x: -60, z: -200 }, { x: -113, z: -190 },
  ];
  // Compute total arc length and place planters evenly
  const planterCount = 10;
  let totalLen = 0;
  const segLens: number[] = [];
  for (let i = 0; i < perimLoop.length - 1; i++) {
    const dx = perimLoop[i+1].x - perimLoop[i].x;
    const dz = perimLoop[i+1].z - perimLoop[i].z;
    const sl = Math.sqrt(dx * dx + dz * dz);
    segLens.push(sl);
    totalLen += sl;
  }
  for (let pi = 0; pi < planterCount; pi++) {
    let dist = (pi / planterCount) * totalLen;
    let segI = 0;
    while (segI < segLens.length - 1 && dist > segLens[segI]) {
      dist -= segLens[segI];
      segI++;
    }
    const t = segLens[segI] > 0 ? dist / segLens[segI] : 0;
    const px = perimLoop[segI].x + t * (perimLoop[segI + 1].x - perimLoop[segI].x);
    const pz = perimLoop[segI].z + t * (perimLoop[segI + 1].z - perimLoop[segI].z);
    const planter = new THREE.Mesh(planterGeo, MAT_PLANTER);
    planter.position.set(px, 0.25, pz);
    scene.add(planter);
  }

  // 11. Scattered lawn trees (6) at edges of central lawn
  const lawnTreeOffsets: [number, number][] = [
    [-15, -10], [15, -10], [-15, 10], [15, 10], [0, -12], [0, 12],
  ];
  const lawnTreePositions: [number, number][] = lawnTreeOffsets.map(
    ([ox, oz]) => [cx + ox, cz + oz],
  );
  scene.add(buildTreeInstances(treeProtos, lawnTreePositions, 5555));
}

// ---------------------------------------------------------------------------
// Shop frontages builder
// ---------------------------------------------------------------------------
function buildShops(scene: THREE.Scene, buildingMeshes: THREE.Mesh[]): void {
  const shopDefs = [
    { id: 'stir_restaurant',       name: 'STIR',             x:   60, z: -110, w: 20, d: 15, rotDeg: 12, stories: 1 },
    { id: 'yard_house_restaurant', name: 'Yard House',        x:   75, z: -100, w: 22, d: 16, rotDeg: 12, stories: 1 },
    { id: 'village_tavern',        name: 'Village Tavern',    x: -160, z:  -90, w: 18, d: 14, rotDeg: 20, stories: 1 },
    { id: 'leos_italian',          name: "Leo's Italian Social", x: -185, z: -130, w: 16, d: 12, rotDeg: 20, stories: 1 },
    { id: 'sixty_vines',           name: 'Sixty Vines',       x: -215, z: -270, w: 22, d: 16, rotDeg: 20, stories: 1 },
    { id: 'barking_dog',           name: 'Barking Dog',       x:   30, z: -130, w: 18, d: 14, rotDeg:  5, stories: 1 },
    { id: 'shop_block_a',          name: 'Retail Block A',    x: -150, z: -200, w: 40, d: 15, rotDeg:  5, stories: 2 },
    { id: 'shop_block_b',          name: 'Retail Block B',    x:   30, z: -180, w: 50, d: 15, rotDeg: -8, stories: 1 },
    { id: 'anchor_retail',         name: 'Anchor Retail',     x:  -40, z: -100, w: 70, d: 45, rotDeg:  0, stories: 2 },
  ];

  for (const s of shopDefs) {
    const isNamed = s.stories === 1 && s.id !== 'shop_block_b';
    const h = isNamed ? 5 : s.stories * 4.5;
    const ry = -s.rotDeg * DEG;

    // Main body
    const geo = new THREE.BoxGeometry(s.w, h, s.d);
    const mat = s.id === 'anchor_retail' ? MAT_RETAIL_LIGHT : MAT_RETAIL_MID;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(s.x, h / 2, s.z);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    buildingMeshes.push(mesh);

    // Awning on front face (local -Z direction)
    const awningGeo = new THREE.BoxGeometry(s.w * 0.85, 0.3, 1.5);
    const awning = new THREE.Mesh(awningGeo, MAT_AWNING);
    // Position awning at front face, mid-height of 1st floor
    const frontOffset = applyY(new THREE.Vector3(0, 0, -(s.d / 2 + 0.75)), ry);
    awning.position.set(
      s.x + frontOffset.x,
      2.5,
      s.z + frontOffset.z,
    );
    awning.rotation.y = ry;
    awning.rotation.x = -0.2; // slight downward tilt
    awning.castShadow = true;
    scene.add(awning);

    // Name sign on front face
    const signTex = makeShopSignTexture(s.name);
    const signMat = new THREE.MeshStandardMaterial({ map: signTex, flatShading: false });
    const signW = Math.min(s.w * 0.6, 8);
    const signGeo = new THREE.PlaneGeometry(signW, 0.8);
    const signMesh = new THREE.Mesh(signGeo, signMat);
    const signOffset = applyY(new THREE.Vector3(0, 0, -(s.d / 2 + 0.06)), ry);
    signMesh.position.set(
      s.x + signOffset.x,
      3.2,
      s.z + signOffset.z,
    );
    signMesh.rotation.y = ry + Math.PI;
    scene.add(signMesh);
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export function buildMidtownScene(scene: THREE.Scene): THREE.Mesh[] {
  const buildingMeshes: THREE.Mesh[] = [];

  // ------------------------------------------------------------------
  // Pre-count windows for InstancedMesh
  // ------------------------------------------------------------------

  // 1. One North Hills Tower: main(45,75,25) + cap(38,7,20)
  let totalWindows = wBox(45, 75, 25) + wBox(38, 7, 20);
  // 2. Landmark at North Hills: (60,35,35)
  totalWindows += wBox(60, 35, 35);
  // 3. Bank of America Tower: base(40,5,30) + tower(35,57,25)
  totalWindows += wBox(40, 5, 30) + wBox(35, 57, 25);
  // 4. North Hills Tower II: (38,66,28)
  totalWindows += wBox(38, 66, 28);
  // 5. Capital Towers: 2×(30,65,30)
  totalWindows += 2 * wBox(30, 65, 30);
  // 6. The Eastern: podium(50,6,50) + tower(35,79,35)
  totalWindows += wBox(50, 6, 50) + wBox(35, 79, 35);
  // 7. Midtown Green: back(70,22,12) + left(15,22,26) + right(15,22,26)
  totalWindows += wBox(70, 22, 12) + wBox(15, 22, 26) + wBox(15, 22, 26);
  // 8. Park and Market: (65,25,45)
  totalWindows += wBox(65, 25, 45);
  // 9. Park Central: (60,25,45)
  totalWindows += wBox(60, 25, 45);
  // 10. The Dartmouth: (55,22,35)
  totalWindows += wBox(55, 22, 35);
  // 11. RH Raleigh: (40,14,30)
  totalWindows += wBox(40, 14, 30);
  // 12. North Hills District: 7 small boxes
  const RETAIL_CLUSTER = [
    { dx: -45, dz: -30, w: 32, h: 9,  d: 18 },
    { dx:  20, dz: -25, w: 28, h: 6,  d: 16 },
    { dx: -20, dz:  15, w: 38, h: 7,  d: 20 },
    { dx:  30, dz:  25, w: 24, h: 10, d: 14 },
    { dx: -55, dz:  20, w: 20, h: 5,  d: 15 },
    { dx:  10, dz:  45, w: 42, h: 8,  d: 22 },
    { dx: -30, dz: -55, w: 26, h: 11, d: 17 },
  ] as const;
  for (const r of RETAIL_CLUSTER) totalWindows += wBox(r.w, r.h, r.d);

  // Shops
  totalWindows += wBox(20, 5, 15) + wBox(22, 5, 16) + wBox(18, 5, 14) + wBox(16, 5, 12);
  totalWindows += wBox(22, 5, 16) + wBox(18, 5, 14);
  totalWindows += wBox(40, 9, 15) + wBox(50, 5, 15) + wBox(70, 9, 45);

  // Fillers
  const FILLERS = [
    { x: -330, z: -200, w: 40, h: 28, d: 30, r:  5, col: 0xA8A29A },
    { x: -290, z:  120, w: 35, h: 35, d: 25, r: -8, col: 0x7FA8C9 },
    { x: -340, z:  380, w: 45, h: 42, d: 32, r: 12, col: 0x8C8780 },
    { x:  120, z:  280, w: 50, h: 30, d: 40, r: -5, col: 0xA8A29A },
    { x:  220, z: -320, w: 30, h: 20, d: 25, r: 15, col: 0xB97A56 },
    { x:  360, z:   80, w: 40, h: 25, d: 35, r: -10, col: 0xD8CFC0 },
    { x:  310, z:  430, w: 55, h: 38, d: 40, r:  8, col: 0x8C8780 },
    { x: -190, z:  680, w: 40, h: 30, d: 30, r: 20, col: 0xA8A29A },
    { x:  120, z:  720, w: 35, h: 45, d: 30, r: -15, col: 0x7FA8C9 },
    { x:  350, z:  720, w: 50, h: 35, d: 40, r:  5, col: 0x8C8780 },
    { x:  -90, z: -430, w: 45, h: 32, d: 35, r:  0, col: 0xA8A29A },
    { x:  210, z: -480, w: 40, h: 28, d: 30, r: 10, col: 0xB97A56 },
  ] as const;
  for (const f of FILLERS) totalWindows += wBox(f.w, f.h, f.d);

  // 30% buffer
  totalWindows = Math.ceil(totalWindows * 1.3);

  // Create single InstancedMesh for windows
  const windowGeo  = new THREE.PlaneGeometry(1.5, 2.0);
  const windowInst = new THREE.InstancedMesh(windowGeo, MAT_WINDOW, totalWindows);
  windowInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  windowInst.count = totalWindows; // set to max so bounds are correct
  scene.add(windowInst);

  let wIdx = 0;

  // ------------------------------------------------------------------
  // 1. ONE NORTH HILLS TOWER  (local_xz: -210, -280, h=75, 45×25, rot=20°CW)
  // ------------------------------------------------------------------
  {
    const cx = -210, cz = -280, ry = -20 * DEG;
    const geo = new THREE.BoxGeometry(45, 75, 25);
    const mesh = new THREE.Mesh(geo, MAT_GLASS_TOWER);
    mesh.position.set(cx, 37.5, cz);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    buildingMeshes.push(mesh);
    wIdx = placeWindowsForBox(windowInst, wIdx, new THREE.Vector3(cx, 0, cz), ry, 45, 75, 25);

    // Slight setback cap
    const capGeo = new THREE.BoxGeometry(38, 8, 20);
    const capMesh = new THREE.Mesh(capGeo, MAT_GLASS_TOWER_DARK);
    capMesh.position.set(cx, 79, cz);
    capMesh.rotation.y = ry;
    capMesh.castShadow = true;
    capMesh.receiveShadow = true;
    scene.add(capMesh);
    buildingMeshes.push(capMesh);
    wIdx = placeWindowsForBox(windowInst, wIdx, new THREE.Vector3(cx, 75, cz), ry, 38, 8, 20);
  }

  // ------------------------------------------------------------------
  // 2. LANDMARK AT NORTH HILLS  (local_xz: -165, 435, h=35, 60×35, rot=15°CW)
  // ------------------------------------------------------------------
  {
    const cx = -165, cz = 435, ry = -15 * DEG;
    const geo = new THREE.BoxGeometry(60, 35, 35);
    const mesh = new THREE.Mesh(geo, MAT_CONCRETE_DARK);
    mesh.position.set(cx, 17.5, cz);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    buildingMeshes.push(mesh);
    wIdx = placeWindowsForBox(windowInst, wIdx, new THREE.Vector3(cx, 0, cz), ry, 60, 35, 35);
  }

  // ------------------------------------------------------------------
  // 3. BANK OF AMERICA TOWER  (local_xz: 80, -90, h=62, 40×30, rot=12°CW)
  //    ground-floor retail base (h=5m) + tower above
  // ------------------------------------------------------------------
  {
    const cx = 80, cz = -90, ry = -12 * DEG;

    // Retail base
    const baseGeo = new THREE.BoxGeometry(40, 5, 30);
    const baseMesh = new THREE.Mesh(baseGeo, MAT_RETAIL_LIGHT);
    baseMesh.position.set(cx, 2.5, cz);
    baseMesh.rotation.y = ry;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    scene.add(baseMesh);
    buildingMeshes.push(baseMesh);
    wIdx = placeWindowsForBox(windowInst, wIdx, new THREE.Vector3(cx, 0, cz), ry, 40, 5, 30);

    // Tower
    const towerGeo = new THREE.BoxGeometry(35, 57, 25);
    const towerMesh = new THREE.Mesh(towerGeo, MAT_GLASS_TOWER_DARK);
    towerMesh.position.set(cx, 33.5, cz);
    towerMesh.rotation.y = ry;
    towerMesh.castShadow = true;
    towerMesh.receiveShadow = true;
    scene.add(towerMesh);
    buildingMeshes.push(towerMesh);
    wIdx = placeWindowsForBox(windowInst, wIdx, new THREE.Vector3(cx, 5, cz), ry, 35, 57, 25);
  }

  // ------------------------------------------------------------------
  // 4. NORTH HILLS TOWER II  (local_xz: 100, -85, h=66, 38×28, rot=12°CW)
  // ------------------------------------------------------------------
  {
    const cx = 100, cz = -85, ry = -12 * DEG;
    const geo = new THREE.BoxGeometry(38, 66, 28);
    const mesh = new THREE.Mesh(geo, MAT_GLASS_TOWER);
    mesh.position.set(cx, 33, cz);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    buildingMeshes.push(mesh);
    wIdx = placeWindowsForBox(windowInst, wIdx, new THREE.Vector3(cx, 0, cz), ry, 38, 66, 28);
  }

  // ------------------------------------------------------------------
  // 5. CAPITAL TOWERS  (local_xz: -109, 770, h=65, twin 30×30, rot=10°CW, gap=15)
  // ------------------------------------------------------------------
  {
    const cx = -109, cz = 770, ry = -10 * DEG;
    const group = new THREE.Group();
    group.position.set(cx, 0, cz);
    group.rotation.y = ry;
    scene.add(group);

    const towerGeo = new THREE.BoxGeometry(30, 65, 30);

    const towerA = new THREE.Mesh(towerGeo, MAT_CONCRETE);
    towerA.position.set(-22.5, 32.5, 0);
    towerA.castShadow = true;
    towerA.receiveShadow = true;
    group.add(towerA);
    buildingMeshes.push(towerA);

    const towerB = new THREE.Mesh(towerGeo, MAT_CONCRETE);
    towerB.position.set(22.5, 32.5, 0);
    towerB.castShadow = true;
    towerB.receiveShadow = true;
    group.add(towerB);
    buildingMeshes.push(towerB);

    const wPosA = applyY(new THREE.Vector3(-22.5, 0, 0), ry).add(new THREE.Vector3(cx, 0, cz));
    wIdx = placeWindowsForBox(windowInst, wIdx, wPosA, ry, 30, 65, 30);
    const wPosB = applyY(new THREE.Vector3(22.5, 0, 0), ry).add(new THREE.Vector3(cx, 0, cz));
    wIdx = placeWindowsForBox(windowInst, wIdx, wPosB, ry, 30, 65, 30);
  }

  // ------------------------------------------------------------------
  // 6. THE EASTERN  (local_xz: 220, -230, h=85, 35×35, rot=8°CW)
  //    podium 50×50×6 below tower
  // ------------------------------------------------------------------
  {
    const cx = 220, cz = -230, ry = -8 * DEG;

    // Podium
    const podiumGeo = new THREE.BoxGeometry(50, 6, 50);
    const podiumMesh = new THREE.Mesh(podiumGeo, MAT_CONCRETE);
    podiumMesh.position.set(cx, 3, cz);
    podiumMesh.rotation.y = ry;
    podiumMesh.castShadow = true;
    podiumMesh.receiveShadow = true;
    scene.add(podiumMesh);
    buildingMeshes.push(podiumMesh);
    wIdx = placeWindowsForBox(windowInst, wIdx, new THREE.Vector3(cx, 0, cz), ry, 50, 6, 50);

    // Tower
    const towerGeo = new THREE.BoxGeometry(35, 79, 35);
    const towerMesh = new THREE.Mesh(towerGeo, MAT_GLASS_TOWER);
    towerMesh.position.set(cx, 45.5, cz);
    towerMesh.rotation.y = ry;
    towerMesh.castShadow = true;
    towerMesh.receiveShadow = true;
    scene.add(towerMesh);
    buildingMeshes.push(towerMesh);
    wIdx = placeWindowsForBox(windowInst, wIdx, new THREE.Vector3(cx, 6, cz), ry, 35, 79, 35);
  }

  // ------------------------------------------------------------------
  // 7. MIDTOWN GREEN APARTMENTS  (local_xz: 435, -222, h=22, 70×50, rot=-25°CW→+25°)
  //    U-shaped courtyard block
  // ------------------------------------------------------------------
  {
    const cx = 435, cz = -222, ry = 25 * DEG; // -25 clockwise → +25 in THREE.js

    const group = new THREE.Group();
    group.position.set(cx, 0, cz);
    group.rotation.y = ry;
    scene.add(group);

    const h = 22;

    // Back wall
    const backGeo = new THREE.BoxGeometry(70, h, 12);
    const backMesh = new THREE.Mesh(backGeo, MAT_BRICK);
    backMesh.position.set(0, h / 2, 19);
    backMesh.castShadow = true;
    backMesh.receiveShadow = true;
    group.add(backMesh);
    buildingMeshes.push(backMesh);

    // Left arm
    const armGeo = new THREE.BoxGeometry(15, h, 26);
    const leftMesh = new THREE.Mesh(armGeo, MAT_BRICK);
    leftMesh.position.set(-27.5, h / 2, -6);
    leftMesh.castShadow = true;
    leftMesh.receiveShadow = true;
    group.add(leftMesh);
    buildingMeshes.push(leftMesh);

    // Right arm
    const rightMesh = new THREE.Mesh(armGeo, MAT_BRICK);
    rightMesh.position.set(27.5, h / 2, -6);
    rightMesh.castShadow = true;
    rightMesh.receiveShadow = true;
    group.add(rightMesh);
    buildingMeshes.push(rightMesh);

    const backW = applyY(new THREE.Vector3(0, 0, 19), ry).add(new THREE.Vector3(cx, 0, cz));
    wIdx = placeWindowsForBox(windowInst, wIdx, backW, ry, 70, h, 12);
    const leftW = applyY(new THREE.Vector3(-27.5, 0, -6), ry).add(new THREE.Vector3(cx, 0, cz));
    wIdx = placeWindowsForBox(windowInst, wIdx, leftW, ry, 15, h, 26);
    const rightW = applyY(new THREE.Vector3(27.5, 0, -6), ry).add(new THREE.Vector3(cx, 0, cz));
    wIdx = placeWindowsForBox(windowInst, wIdx, rightW, ry, 15, h, 26);

    // Balcony instanced mesh
    const balconyCount = 80;
    const balconyInst = new THREE.InstancedMesh(
      new THREE.BoxGeometry(3, 0.4, 1.2),
      MAT_BALCONY,
      balconyCount,
    );
    scene.add(balconyInst);
    let bi = 0;
    const balDummy = new THREE.Object3D();
    const backWorldN = applyY(new THREE.Vector3(0, 0, 1), ry).normalize();
    const backRight  = applyY(new THREE.Vector3(1, 0, 0), ry).normalize();
    const backFaceCenter = applyY(new THREE.Vector3(0, 0, 25), ry).add(new THREE.Vector3(cx, 0, cz));
    const bm = new THREE.Matrix4().makeBasis(backRight, new THREE.Vector3(0, 1, 0), backWorldN);
    const bq = new THREE.Quaternion().setFromRotationMatrix(bm);
    for (let floor = 0; floor < 5 && bi < balconyCount; floor++) {
      const by = floor * 4 + 2.5;
      for (let col = -4; col <= 4 && bi < balconyCount; col++) {
        const bPos = new THREE.Vector3(
          backFaceCenter.x + backRight.x * col * 3.5,
          by,
          backFaceCenter.z + backRight.z * col * 3.5,
        ).addScaledVector(backWorldN, 0.6);
        balDummy.position.copy(bPos);
        balDummy.quaternion.copy(bq);
        balDummy.scale.set(1, 1, 1);
        balDummy.updateMatrix();
        balconyInst.setMatrixAt(bi++, balDummy.matrix);
      }
    }
    balconyInst.count = bi;
    balconyInst.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------
  // 8. PARK AND MARKET APARTMENTS  (local_xz: 295, -190, h=25, 65×45, rot=-10°CW)
  // ------------------------------------------------------------------
  {
    const cx = 295, cz = -190, ry = 10 * DEG; // -10°CW → +10° in THREE.js
    const geo = new THREE.BoxGeometry(65, 25, 45);
    const mesh = new THREE.Mesh(geo, MAT_BRICK);
    mesh.position.set(cx, 12.5, cz);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    buildingMeshes.push(mesh);
    wIdx = placeWindowsForBox(windowInst, wIdx, new THREE.Vector3(cx, 0, cz), ry, 65, 25, 45);
  }

  // ------------------------------------------------------------------
  // 9. PARK CENTRAL NORTH HILLS  (local_xz: 290, -340, h=25, 60×45, rot=-5°CW)
  // ------------------------------------------------------------------
  {
    const cx = 290, cz = -340, ry = 5 * DEG; // -5°CW → +5°
    const geo = new THREE.BoxGeometry(60, 25, 45);
    const mesh = new THREE.Mesh(geo, MAT_BRICK);
    mesh.position.set(cx, 12.5, cz);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    buildingMeshes.push(mesh);
    wIdx = placeWindowsForBox(windowInst, wIdx, new THREE.Vector3(cx, 0, cz), ry, 60, 25, 45);
  }

  // ------------------------------------------------------------------
  // 10. THE DARTMOUTH NORTH HILLS  (local_xz: 175, -50, h=22, 55×35, rot=12°CW)
  // ------------------------------------------------------------------
  {
    const cx = 175, cz = -50, ry = -12 * DEG;
    const geo = new THREE.BoxGeometry(55, 22, 35);
    const mesh = new THREE.Mesh(geo, MAT_BRICK);
    mesh.position.set(cx, 11, cz);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    buildingMeshes.push(mesh);
    wIdx = placeWindowsForBox(windowInst, wIdx, new THREE.Vector3(cx, 0, cz), ry, 55, 22, 35);
  }

  // ------------------------------------------------------------------
  // 11. RH RALEIGH SHOWROOM  (local_xz: -195, -100, h=14, 40×30, rot=20°CW)
  //     flat rooftop terrace: raised slab + railing on top
  // ------------------------------------------------------------------
  {
    const cx = -195, cz = -100, ry = -20 * DEG;
    const geo = new THREE.BoxGeometry(40, 14, 30);
    const mesh = new THREE.Mesh(geo, MAT_STONE_GLASS);
    mesh.position.set(cx, 7, cz);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    buildingMeshes.push(mesh);
    wIdx = placeWindowsForBox(windowInst, wIdx, new THREE.Vector3(cx, 0, cz), ry, 40, 14, 30);

    // Rooftop terrace slab
    const terraceGeo = new THREE.BoxGeometry(40, 0.5, 30);
    const terrace = new THREE.Mesh(terraceGeo, MAT_PAVING);
    terrace.position.set(cx, 14.25, cz);
    terrace.rotation.y = ry;
    terrace.castShadow = true;
    scene.add(terrace);
    buildingMeshes.push(terrace);

    // Railing (4 sides) using thin boxes
    const railH = 1.2;
    const railings = [
      { lw: 40, ld: 0.1, lx: 0,    lz: -15 },
      { lw: 40, ld: 0.1, lx: 0,    lz:  15 },
      { lw: 0.1, ld: 30, lx: -20,  lz:  0 },
      { lw: 0.1, ld: 30, lx:  20,  lz:  0 },
    ];
    for (const rr of railings) {
      const rGeo = new THREE.BoxGeometry(rr.lw, railH, rr.ld);
      const rMesh = new THREE.Mesh(rGeo, MAT_ROOFTOP_RAILING);
      const rOff = applyY(new THREE.Vector3(rr.lx, 0, rr.lz), ry);
      rMesh.position.set(cx + rOff.x, 14.5 + railH / 2, cz + rOff.z);
      rMesh.rotation.y = ry;
      scene.add(rMesh);
    }
  }

  // ------------------------------------------------------------------
  // 12. NORTH HILLS DISTRICT  (local_xz: -73, -163, h=9, 200×150 area)
  //     7 small boxes of varying height scattered within footprint
  // ------------------------------------------------------------------
  {
    const cx = -73, cz = -163;
    const mats = [MAT_RETAIL_LIGHT, MAT_RETAIL_MID];
    for (const r of RETAIL_CLUSTER) {
      const rot = [8, -5, 3, -12, 6, -7, 10][RETAIL_CLUSTER.indexOf(r)] ?? 0;
      const ry = -rot * DEG;
      const geo = new THREE.BoxGeometry(r.w, r.h, r.d);
      const mesh = new THREE.Mesh(geo, mats[RETAIL_CLUSTER.indexOf(r) % 2]);
      mesh.position.set(cx + r.dx, r.h / 2, cz + r.dz);
      mesh.rotation.y = ry;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      buildingMeshes.push(mesh);
      wIdx = placeWindowsForBox(windowInst, wIdx, new THREE.Vector3(cx + r.dx, 0, cz + r.dz), ry, r.w, r.h, r.d);
    }
  }

  // ------------------------------------------------------------------
  // FILLER BUILDINGS — 12 generic boxes
  // ------------------------------------------------------------------
  for (const f of FILLERS) {
    const ry = -f.r * DEG;
    const mat = new THREE.MeshStandardMaterial({ color: f.col, flatShading: true });
    const geo = new THREE.BoxGeometry(f.w, f.h, f.d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(f.x, f.h / 2, f.z);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    buildingMeshes.push(mesh);
    wIdx = placeWindowsForBox(windowInst, wIdx, new THREE.Vector3(f.x, 0, f.z), ry, f.w, f.h, f.d);
  }

  // Finalize window instanced mesh
  windowInst.count = Math.min(wIdx, totalWindows);
  windowInst.instanceMatrix.needsUpdate = true;

  // ------------------------------------------------------------------
  // ROADS — all 6 from roads.json
  // ------------------------------------------------------------------
  const ROADS: RoadDef[] = [
    {
      type: 'arterial',
      width_m: 18,
      path: [
        { x: -260, z: -550 }, { x: -230, z: -300 }, { x: -180, z: 0 },
        { x: -140, z: 300 },  { x: -100, z: 600 },  { x: -60, z: 900 },
      ],
    },
    {
      type: 'collector',
      width_m: 12,
      path: [
        { x: -400, z: -50 }, { x: -200, z: -60 }, { x: 0, z: -73 },
        { x: 200, z: -100 }, { x: 400, z: -150 },
      ],
    },
    {
      type: 'local',
      width_m: 10,
      path: [
        { x: -210, z: -280 }, { x: -180, z: -200 },
        { x: -150, z: -100 }, { x: -130, z: 0 },
      ],
    },
    {
      type: 'local',
      width_m: 10,
      path: [
        { x: 100, z: -200 }, { x: 250, z: -180 }, { x: 400, z: -150 },
      ],
    },
    {
      type: 'local',
      width_m: 9,
      path: [
        { x: 150, z: -120 }, { x: 200, z: -50 }, { x: 230, z: 20 },
      ],
    },
    {
      type: 'pedestrian',
      width_m: 8,
      path: [
        { x: -73, z: -163 }, { x: 20, z: -120 }, { x: 100, z: -50 },
        { x: 50, z: 50 }, { x: -73, z: -163 },
      ],
    },
  ];

  for (const road of ROADS) {
    buildRoad(road, scene);
  }

  // ------------------------------------------------------------------
  // INTERSECTIONS — traffic lights + stop signs + street name signs
  // ------------------------------------------------------------------

  // Traffic light intersections
  const TL_INTERSECTIONS = [
    { x: -180, z: -73,  roads: ['Six Forks Rd', 'Lassiter Mill Rd'] },
    { x: -150, z: -100, roads: ['Six Forks Rd', 'Park at N Hills St'] },
    { x:  200, z: -100, roads: ['Lassiter Mill Rd', 'St Albans Dr'] },
  ];
  for (const tl of TL_INTERSECTIONS) {
    scene.add(makeTrafficLight(tl.x + 6, tl.z + 6, 0));
    scene.add(makeTrafficLight(tl.x - 6, tl.z - 6, Math.PI / 2));

    // Street signs
    scene.add(makeStreetSign(tl.x + 8, tl.z + 3, tl.roads[0]));
    scene.add(makeStreetSign(tl.x + 3, tl.z + 8, tl.roads[1]));
  }

  // Stop sign intersections
  const SS_INTERSECTIONS = [
    { x: 175, z: -90,  roads: ['St Albans Dr', 'Dartmouth Rd'] },
    { x: -73, z: -163, roads: ['Park at N Hills St', 'Midtown Park Walk'], pedestrian: true },
  ];
  for (const ss of SS_INTERSECTIONS) {
    scene.add(makeStopSign(ss.x + 6, ss.z + 6));
    scene.add(makeStopSign(ss.x - 6, ss.z - 6));

    // Street signs
    const isPed = 'pedestrian' in ss && ss.pedestrian === true;
    scene.add(makeStreetSign(ss.x + 9, ss.z + 3, ss.roads[0], isPed));
    scene.add(makeStreetSign(ss.x + 3, ss.z + 9, ss.roads[1], isPed));
  }

  // ------------------------------------------------------------------
  // PARK
  // ------------------------------------------------------------------
  buildPark(scene);

  // ------------------------------------------------------------------
  // SHOPS
  // ------------------------------------------------------------------
  buildShops(scene, buildingMeshes);

  return buildingMeshes;
}
