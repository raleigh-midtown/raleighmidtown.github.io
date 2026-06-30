import * as THREE from 'three';

/**
 * Jubala Coffee storefront — gold name sign, floor-to-ceiling glass wall,
 * red vertical blade sign.
 *
 * Positioned in the North Hills retail cluster, just west of Barking Dog.
 * Reference: reference/midtown-reference/images/Jubala Name.jpg
 *
 * Coordinate conventions: +X east, +Z south, +Y up.
 */

// ── Storefront constants ────────────────────────────────────────────────────
const JX   = 291;    // centre X  (projected from OSM node -78.6368506, 35.8359373)
const JZ   = 270;    // centre Z  (approx north face of Park Central North Hills building)
const JW   = 14;     // width  (m)
const JD   = 8;      // depth  (m)
const JH   = 5;      // height (m)
const JROT = 0;      // rotation around Y (radians); 0 = front face points -Z (north)

// ── Helper: rotate offset vector around Y ──────────────────────────────────
function applyY(v: THREE.Vector3, angle: number): THREE.Vector3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return new THREE.Vector3(
    v.x * cos - v.z * sin,
    v.y,
    v.x * sin + v.z * cos,
  );
}

// ── Canvas texture helpers ──────────────────────────────────────────────────

function makeJubalaNameTexture(): THREE.CanvasTexture {
  const W = 512; const H = 96;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  // Near-black espresso background
  ctx.fillStyle = '#1A1208';
  ctx.fillRect(0, 0, W, H);
  // Gold channel-letter text
  ctx.fillStyle = '#C8A84B';
  ctx.font = 'bold 52px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('JUBALA', W / 2, H / 2);
  return new THREE.CanvasTexture(canvas);
}

function makeBladeTexture(): THREE.CanvasTexture {
  // Tall narrow canvas — text will be rotated 90° to read top-to-bottom
  const W = 64; const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  // Red background
  ctx.fillStyle = '#CC1111';
  ctx.fillRect(0, 0, W, H);
  // White rotated text: translate to centre, rotate -90°, draw horizontally
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('COFFEE', 0, 0);
  ctx.restore();
  return new THREE.CanvasTexture(canvas);
}

// ── Main export ─────────────────────────────────────────────────────────────

/**
 * Build the Jubala Coffee storefront and add all meshes to the scene.
 * Returns the opaque body mesh(es) that should be passed to collision.build().
 */
export function buildJubalaDecor(scene: THREE.Scene): THREE.Mesh[] {
  const ry = JROT;

  // Front-face direction unit vector: local -Z (north), rotated by ry.
  // Players approach from the north (z=245 < building z=270), so -Z faces them.
  const frontDir = applyY(new THREE.Vector3(0, 0, -1), ry);

  // ── Body ───────────────────────────────────────────────────────────────────
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(JW, JH, JD),
    new THREE.MeshStandardMaterial({ color: 0xC2B8A3, flatShading: true }),
  );
  body.position.set(JX, JH / 2, JZ);
  body.rotation.y = ry;
  body.castShadow = true;
  body.receiveShadow = true;
  scene.add(body);

  // ── Glass wall — floor-to-ceiling, full width ──────────────────────────────
  // Offset 0.08 m off the north face to prevent z-fighting.
  // rotation.y = ry + Math.PI flips the plane's normal to face north toward the player.
  const glassH = 3.5;
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x7FAFC9,
    metalness: 0.70,
    roughness: 0.08,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(JW, glassH), glassMat);
  const glassOffset = frontDir.clone().multiplyScalar(JD / 2 + 0.08);
  glass.position.set(
    JX + glassOffset.x,
    glassH / 2,
    JZ + glassOffset.z,
  );
  glass.rotation.y = ry + Math.PI;
  scene.add(glass);

  // ── Gold name sign ─────────────────────────────────────────────────────────
  const signW = Math.min(JW * 0.72, 10);
  const signMat = new THREE.MeshStandardMaterial({
    map: makeJubalaNameTexture(),
    flatShading: false,
    transparent: true,
    alphaTest: 0.05,
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(signW, 0.9), signMat);
  const signOffset = frontDir.clone().multiplyScalar(JD / 2 + 0.06);
  sign.position.set(
    JX + signOffset.x,
    4.1,
    JZ + signOffset.z,
  );
  sign.rotation.y = ry + Math.PI;
  scene.add(sign);

  // ── Blade sign — perpendicular to left facade edge ─────────────────────────
  // Left edge local X = -(JW/2 - 0.5). The blade protrudes along the front face,
  // slightly outward. rotation.y = ry + Math.PI/2 makes the plane face left/right
  // (perpendicular to the wall), visible from both approach directions.
  const bladeMat = new THREE.MeshStandardMaterial({
    map: makeBladeTexture(),
    side: THREE.DoubleSide,
    flatShading: false,
    transparent: true,
    alphaTest: 0.05,
  });
  const blade = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 3.0), bladeMat);
  // Place at left facade edge, forward of the wall by 0.2 m
  const bladeLocalOffset = new THREE.Vector3(-(JW / 2 - 0.5), 0, -(JD / 2 + 0.2));
  const bladeWorldOffset = applyY(bladeLocalOffset, ry);
  blade.position.set(
    JX + bladeWorldOffset.x,
    2.5,
    JZ + bladeWorldOffset.z,
  );
  // Perpendicular to wall: rotate by ry + Math.PI/2 so plane normal points along the wall face
  blade.rotation.y = ry + Math.PI / 2;
  scene.add(blade);

  // Return only the body — glass, sign, and blade are not collidable (R5)
  return [body];
}
