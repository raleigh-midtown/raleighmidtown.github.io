import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Low-poly car dimensions (world metres). Length runs along local +Z so a
// yaw of atan2(frontX, frontZ) rotates the nose (+Z) onto a target normal,
// matching the bench orientation convention in benches.ts.
const WHEEL_R   = 0.33;
const BODY_W    = 1.8;
const BODY_H    = 0.7;
const BODY_L    = 4.4;
const BODY_Y0   = 0.45;                 // underside clearance above ground
const CABIN_W   = 1.55;
const CABIN_H   = 0.55;
const CABIN_L   = 2.2;
const CABIN_DZ  = -0.3;                  // cabin nudged toward the rear

/** Realistic car body colours, indexed deterministically per stall. */
export const CAR_COLORS: number[] = [
  0xb9bcc0, // silver
  0x2b2b2e, // near-black
  0xf2f2f2, // white
  0x8a1f24, // dark red
  0x223a5e, // navy blue
  0x4d5256, // gunmetal
  0x2c4a36, // dark green
  0x6e7378, // grey
];

/** Deterministic palette pick that wraps on the palette length. */
export function colorForIndex(i: number): THREE.Color {
  return new THREE.Color(CAR_COLORS[((i % CAR_COLORS.length) + CAR_COLORS.length) % CAR_COLORS.length]);
}

/**
 * Build one merged low-poly car geometry (body + cabin + four wheels) with its
 * origin at the ground-plane centre, nose pointing local +Z. No material is
 * created here — the caller drives colour per instance via InstancedMesh
 * setColorAt, so the instanced material must keep a white base colour.
 */
export function makeCarGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const body = new THREE.BoxGeometry(BODY_W, BODY_H, BODY_L);
  body.translate(0, BODY_Y0 + BODY_H / 2, 0);
  parts.push(body);

  const cabin = new THREE.BoxGeometry(CABIN_W, CABIN_H, CABIN_L);
  cabin.translate(0, BODY_Y0 + BODY_H + CABIN_H / 2, CABIN_DZ);
  parts.push(cabin);

  // Four wheels: cylinders with the axle along X (rotateZ 90°), grounded at y=R.
  const wheel = (x: number, z: number) => {
    const g = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.2, 12);
    g.rotateZ(Math.PI / 2);
    g.translate(x, WHEEL_R, z);
    return g;
  };
  const wx = BODY_W / 2 - 0.05;
  const wz = BODY_L / 2 - 1.0;
  parts.push(wheel(-wx, wz), wheel(wx, wz), wheel(-wx, -wz), wheel(wx, -wz));

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  // mergeGeometries returns null only on attribute mismatch; all parts here are
  // Box/Cylinder with identical attributes, so this is non-null in practice.
  return merged ?? new THREE.BufferGeometry();
}
