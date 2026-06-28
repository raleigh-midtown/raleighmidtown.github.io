import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Low-poly car dimensions (world metres). Length runs along local +Z so a
// yaw of atan2(frontX, frontZ) rotates the nose (+Z) onto a target normal,
// matching the bench orientation convention in benches.ts.
const BODY_W   = 1.8;
const BODY_H   = 0.55;
const BODY_L   = 4.4;
const BODY_Y0  = 0.40;                 // underside clearance above ground
const CABIN_W  = 1.6;
const CABIN_H  = 0.45;
const CABIN_L  = 2.0;
const CABIN_DZ = -0.30;                // greenhouse set back toward the rear (long hood, short trunk)
const ROOF_H   = 0.08;
const WHEEL_R  = 0.34;
const WHEEL_T  = 0.22;

// Per-part vertex colours. The instanced material multiplies these by the
// per-instance palette colour, so: white parts take the body colour, black
// wheels stay black at any body colour, and the dark cabin reads as tinted
// glass — all from a single InstancedMesh with one setColorAt per car.
const BODY_RGB:  [number, number, number] = [1, 1, 1];
const GLASS_RGB: [number, number, number] = [0.10, 0.11, 0.13];
const WHEEL_RGB: [number, number, number] = [0.04, 0.04, 0.04];

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

/** Paint every vertex of a geometry a single RGB (baked vertex colour). */
function paint(geo: THREE.BufferGeometry, [r, g, b]: [number, number, number]): THREE.BufferGeometry {
  const n = geo.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b; }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/**
 * Build one merged low-poly car geometry (lower body + glass cabin + roof cap +
 * four wheels) with its origin at the ground-plane centre, nose pointing local
 * +Z. Vertex colours bake in black wheels and a dark glass greenhouse; the
 * caller's InstancedMesh material must set `vertexColors: true` and a white base
 * colour so per-instance setColorAt tints only the body/roof.
 */
export function makeCarGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const body = new THREE.BoxGeometry(BODY_W, BODY_H, BODY_L);
  body.translate(0, BODY_Y0 + BODY_H / 2, 0);
  parts.push(paint(body, BODY_RGB));

  // Greenhouse (windows) — narrower, set back, dark glass.
  const cabin = new THREE.BoxGeometry(CABIN_W, CABIN_H, CABIN_L);
  cabin.translate(0, BODY_Y0 + BODY_H + CABIN_H / 2, CABIN_DZ);
  parts.push(paint(cabin, GLASS_RGB));

  // Roof cap — body colour, sits on the greenhouse.
  const roof = new THREE.BoxGeometry(CABIN_W - 0.12, ROOF_H, CABIN_L - 0.2);
  roof.translate(0, BODY_Y0 + BODY_H + CABIN_H + ROOF_H / 2, CABIN_DZ);
  parts.push(paint(roof, BODY_RGB));

  // Four wheels: cylinders with the axle along X (rotateZ 90°), grounded at y=R.
  const wheel = (x: number, z: number) => {
    const g = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, WHEEL_T, 14);
    g.rotateZ(Math.PI / 2);
    g.translate(x, WHEEL_R, z);
    return paint(g, WHEEL_RGB);
  };
  const wx = BODY_W / 2 - 0.02;
  const wz = BODY_L / 2 - 1.05;
  parts.push(wheel(-wx, wz), wheel(wx, wz), wheel(-wx, -wz), wheel(wx, -wz));

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  // mergeGeometries returns null only on attribute mismatch; all parts here
  // carry identical attributes (position/normal/uv/color), so this is non-null.
  return merged ?? new THREE.BufferGeometry();
}
