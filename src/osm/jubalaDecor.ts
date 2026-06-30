import * as THREE from 'three';

/**
 * Jubala Coffee storefront — gold name sign, floor-to-ceiling glass wall,
 * red vertical blade sign, and raised entry terrace.
 *
 * Aligned to the Park Central North Hills building wall (edge from
 * scene coords (323.9,283.8)→(240.3,250.5), angle ≈ −21.7°).
 * Reference: reference/midtown-reference/images/Jubala Name.jpg
 *
 * Coordinate conventions: +X east, +Z south, +Y up.
 */

// ── Storefront constants ────────────────────────────────────────────────────
const JX   = 291;      // centre X  (from OSM node -78.6368506, 35.8359373)
const JZ   = 272;      // centre Z  (on Park Central north wall at x=291)
const JW   = 14;       // width  (m) along wall
const JD   = 2;        // depth  (m) — thin facade slab; OSM building provides the bulk
const JH   = 5;        // height (m)
// Wall angle: edge (323.9,283.8)→(240.3,250.5); outward normal ≈ (0.37, -0.93)
// rotation.y = -0.379 rad so local -Z aligns with that outward normal
const JROT = -0.379;

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
  // Transparent background — only the gold letters render (like real channel letters)
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#C8A84B';  // gold
  ctx.font = 'bold 56px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('JUBALA', W / 2, H / 2);
  return new THREE.CanvasTexture(canvas);
}

function makeBladeTexture(): THREE.CanvasTexture {
  const W = 64; const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#CC1111';
  ctx.fillRect(0, 0, W, H);
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

  // Front-face direction: local -Z rotated by ry → outward wall normal
  const frontDir = applyY(new THREE.Vector3(0, 0, -1), ry);

  // ── Body — thin facade slab flush with building wall ───────────────────────
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

  // ── Gold name sign — MeshBasicMaterial so it's unlit (always full gold) ────
  // Transparent background lets the building wall show through, floating letters
  // match real backlit channel-letter signage.
  const signW = Math.min(JW * 0.72, 10);
  const signMat = new THREE.MeshBasicMaterial({
    map: makeJubalaNameTexture(),
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

  // ── Blade sign — MeshBasicMaterial keeps red vivid regardless of lighting ──
  const bladeMat = new THREE.MeshBasicMaterial({
    map: makeBladeTexture(),
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.05,
  });
  const blade = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 3.0), bladeMat);
  const bladeLocalOffset = new THREE.Vector3(-(JW / 2 - 0.5), 0, -(JD / 2 + 0.2));
  const bladeWorldOffset = applyY(bladeLocalOffset, ry);
  blade.position.set(
    JX + bladeWorldOffset.x,
    2.5,
    JZ + bladeWorldOffset.z,
  );
  blade.rotation.y = ry + Math.PI / 2;
  scene.add(blade);

  // ── Raised entry terrace — matches the elevated platform in reference photo ─
  // Concrete slab ~0.4 m tall, 2.5 m deep, spanning the storefront width.
  const terraceH = 0.4;
  const terraceD = 2.5;
  const terrace = new THREE.Mesh(
    new THREE.BoxGeometry(JW - 1, terraceH, terraceD),
    new THREE.MeshStandardMaterial({ color: 0xB4B0AA, flatShading: true }),
  );
  const terraceOffset = frontDir.clone().multiplyScalar(JD / 2 + terraceD / 2 + 0.05);
  terrace.position.set(
    JX + terraceOffset.x,
    terraceH / 2,
    JZ + terraceOffset.z,
  );
  terrace.rotation.y = ry;
  terrace.receiveShadow = true;
  scene.add(terrace);

  return [body, terrace];  // both are collidable
}
