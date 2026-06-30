import * as THREE from 'three';

/**
 * Jubala Coffee storefront — gold name sign, floor-to-ceiling glass wall,
 * red vertical blade sign, and a continuous raised terrace along the full
 * Park Central North Hills north facade.
 *
 * Wall reference: polygon edge (323.9,283.8)→(240.3,250.5) in scene space.
 * Outward normal: (0.371, 0, -0.929). JROT = +0.379 rad aligns local +X
 * with wall direction (240.3,250.5)→(323.9,283.8) so the 90m terrace box
 * spans the wall endpoints exactly.
 *
 * Coordinate conventions: +X east, +Z south, +Y up.
 */

// ── Jubala storefront constants ─────────────────────────────────────────────
const JX   = 291;      // centre X  (from OSM node -78.6368506, 35.8359373)
const JZ   = 271.5;    // centre Z  (north wall at x=291 is z≈270.7; JZ=271.5 puts
                       //             glass/sign at z≈270.5, just in front of the wall)
const JW   = 14;       // width  (m) along wall
const JD   = 2;        // depth  (m) — thin facade slab
const JH   = 5;        // height (m)
// Wall outward normal: (0.371, 0, -0.929).  frontDir = applyY((0,0,-1), JROT).
// frontDir.x = sin(JROT), frontDir.z = -cos(JROT).
// → sin(JROT)=0.371, cos(JROT)=0.929 → JROT = +0.379 (not -0.379).
const JROT = +0.379;

// ── Park Central north-wall terrace constants ───────────────────────────────
// Wall edge (323.9,283.8)→(240.3,250.5), length ≈90 m, midpoint (282.1,267.15).
// Terrace spans the full wall width and covers the ground strip between the
// fence/sidewalk and the building base (~6 m outward from the wall).
const WALL_MID_X  = 282.1;
const WALL_MID_Z  = 267.15;
const TERRACE_W   = 90;    // full wall length (m)
const TERRACE_D   = 5;     // depth outward from wall (m)
const TERRACE_H   = 1.0;   // slab height — must clear the fence railing (~0.9 m)

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
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#C8A84B';
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
 * Build the Jubala Coffee storefront and the full-wall entry terrace, adding
 * all meshes to the scene. Returns opaque collision meshes for collision.build().
 */
export function buildJubalaDecor(scene: THREE.Scene): THREE.Mesh[] {
  const ry = JROT;

  // frontDir: direction the storefront faces (outward from building wall)
  // = applyY((0,0,-1), JROT) = (sin(JROT), 0, -cos(JROT)) = (0.371, 0, -0.929)
  const frontDir = applyY(new THREE.Vector3(0, 0, -1), ry);

  // ── Body — thin facade slab ────────────────────────────────────────────────
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(JW, JH, JD),
    new THREE.MeshStandardMaterial({ color: 0xC2B8A3, flatShading: true }),
  );
  body.position.set(JX, JH / 2, JZ);
  body.rotation.y = ry;
  body.castShadow = true;
  body.receiveShadow = true;
  scene.add(body);

  // ── Glass wall — sits just in front of the building wall face ──────────────
  // With JZ=271.5, glass lands at z≈270.5 — 0.2 m north of the wall at z≈270.7.
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
  glass.position.set(JX + glassOffset.x, glassH / 2, JZ + glassOffset.z);
  glass.rotation.y = ry + Math.PI;
  scene.add(glass);

  // ── Gold name sign — MeshBasicMaterial (unlit, always full gold) ──────────
  const signW = Math.min(JW * 0.72, 10);
  const signMat = new THREE.MeshBasicMaterial({
    map: makeJubalaNameTexture(),
    transparent: true,
    alphaTest: 0.05,
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(signW, 0.9), signMat);
  const signOffset = frontDir.clone().multiplyScalar(JD / 2 + 0.06);
  sign.position.set(JX + signOffset.x, 4.1, JZ + signOffset.z);
  sign.rotation.y = ry + Math.PI;
  scene.add(sign);

  // ── Red "COFFEE" blade sign (MeshBasicMaterial — vivid red always) ─────────
  const bladeMat = new THREE.MeshBasicMaterial({
    map: makeBladeTexture(),
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.05,
  });
  const blade = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 3.0), bladeMat);
  const bladeLocalOffset = new THREE.Vector3(-(JW / 2 - 0.5), 0, -(JD / 2 + 0.2));
  const bladeWorldOffset = applyY(bladeLocalOffset, ry);
  blade.position.set(JX + bladeWorldOffset.x, 2.5, JZ + bladeWorldOffset.z);
  blade.rotation.y = ry + Math.PI / 2;
  scene.add(blade);

  // ── Full-wall entry terrace ────────────────────────────────────────────────
  // Spans the entire Park Central north wall (~90 m) and covers the ground
  // strip between the building base and the sidewalk/fence (~6 m deep).
  // Box center = wall midpoint + frontDir * (TERRACE_D / 2) so the back face
  // sits flush against the building wall and the front face meets the sidewalk.
  const terrace = new THREE.Mesh(
    new THREE.BoxGeometry(TERRACE_W, TERRACE_H, TERRACE_D),
    new THREE.MeshStandardMaterial({ color: 0xB4B0AA, flatShading: true }),
  );
  terrace.position.set(
    WALL_MID_X + frontDir.x * (TERRACE_D / 2),
    TERRACE_H / 2,
    WALL_MID_Z + frontDir.z * (TERRACE_D / 2),
  );
  terrace.rotation.y = ry;
  terrace.receiveShadow = true;
  scene.add(terrace);

  return [body, terrace];
}
