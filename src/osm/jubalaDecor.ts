import * as THREE from 'three';

/**
 * Jubala Coffee storefront — gold name sign, floor-to-ceiling glass panes,
 * red vertical blade sign, and a raised entry terrace in front of the storefront.
 *
 * Built as a single THREE.Group (AGENTS.md: "Hand-placed scene props belong
 * inside a THREE.Group, positioned + rotated as a unit"). The group is placed
 * at (JX, 0, JZ) and rotated JROT once; every storefront mesh is a child with
 * LOCAL coordinates, where local -Z is the street-facing front. This keeps
 * position and orientation in one convention — three.js rotation.y — instead
 * of hand-rotating world offsets (the previous applyY() helper rotated by
 * -JROT, opposite to rotation.y, which left the glass panes non-coplanar).
 *
 * Wall reference: polygon edge (323.9,283.8)→(240.3,250.5) in scene space. That
 * edge runs at +21.7° (atan2(z,x)); its OUTWARD normal (away from the Park
 * Central bbox centroid, toward the street) is (0.370, 0, -0.929) = N 21.7° E.
 * Under three.js rotation.y(JROT), local -Z (the storefront front) faces
 * (-sin JROT, 0, -cos JROT); for that to equal the outward normal, JROT must
 * be -0.379 rad. (A +0.379 sign mirrors it to N 21.7° W — NW — and skews the
 * width 43.4° across the wall; that was the prior bug.)
 *
 * Coordinate conventions: +X east, +Z south, +Y up.
 */

// ── Jubala storefront constants ─────────────────────────────────────────────
const JX   = 291;      // centre X  (from OSM node -78.6368506, 35.8359373)
const JZ   = 271.5;    // centre Z  (north wall at x=291 is z≈270.7)
const JW   = 14;       // width  (m) along wall
const JD   = 2;        // depth  (m) — thin facade slab
const JH   = 5;        // height (m) above terrace
const JROT = -0.379;   // wall angle — applied once to the group (−: front faces N 21.7° E)

// ── Entry terrace — rotated with the group (parallel to the road/wall) ───────
// The Park Central wall edge and the adjacent road ("Park At North Hills
// Street") both run at ~21.7° (= JROT), so the storefront group is rotated JROT
// to face the road. The terrace is a child of that group so it inherits JROT
// and stays parallel to the road/wall/storefront — an axis-aligned (0°) terrace
// would sit 21.7° skew to the road it borders. Width is along the wall (local
// X), depth is perpendicular (local Z, -Z toward the street).
//
// Tuning: a rotated 16×6 m terrace projects its width onto world-Z, so the
// local z centre is set to TERRACE_LOCAL_Z = -2.5 (back face at local +0.5,
// front at local -5.5). That keeps the front-left (west) corner at world
// z≈263.4 — just clear of the park fence (z≈263) — while the back-right
// (east) corner (z≈274.9) stays no deeper into Park Central than the
// storefront body already is. Per
// CONCEPTS.md, Park Central's bbox is x[188..324] z[236..327]; the storefront
// is mounted on its closest wall to the Jubala POI.
const TERRACE_H = 1.8;        // raised platform height
const TERRACE_W = 16;         // width along the wall/road (local X), slightly > JW=14
const TERRACE_D = 6.0;        // depth perpendicular to the wall (local Z)
const TERRACE_LOCAL_Z = -2.5; // local z centre: front at -5.5 (toward road), back at +0.5 (wall)

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

export function buildJubalaDecor(scene: THREE.Scene): THREE.Mesh[] {
  // One group, placed + rotated as a unit (AGENTS.md convention). Children use
  // local coordinates; local -Z is the street-facing front. This replaces the
  // prior per-mesh scene.add() with hand-rotated world offsets.
  const group = new THREE.Group();
  group.position.set(JX, 0, JZ);
  group.rotation.y = JROT;
  scene.add(group);

  // ── Entry terrace — child of the rotated group, parallel to the road ───────
  // Inherits the group's JROT rotation so it runs parallel to the Park Central
  // wall and the adjacent road (both ~21.7°), matching the storefront. Local z
  // centre TERRACE_LOCAL_Z = -2.5 tunes the offset so the front-left (west)
  // corner clears the park fence (z≈263); see the TERRACE constants comment.
  const terrace = new THREE.Mesh(
    new THREE.BoxGeometry(TERRACE_W, TERRACE_H, TERRACE_D),
    new THREE.MeshStandardMaterial({ color: 0xB8B4AE, flatShading: true }),
  );
  terrace.position.set(0, TERRACE_H / 2, TERRACE_LOCAL_Z);
  terrace.receiveShadow = true;
  group.add(terrace);

  // ── Body — thin facade slab, base sits on top of terrace ──────────────────
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(JW, JH, JD),
    new THREE.MeshStandardMaterial({ color: 0xC2B8A3, flatShading: true }),
  );
  body.position.set(0, TERRACE_H + JH / 2, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // ── Glass panes — 4 bays separated by aluminum mullions ───────────────────
  const PANE_COLS   = 4;
  const MULLION_T   = 0.12;   // mullion thickness (m)
  const paneW       = (JW - MULLION_T * (PANE_COLS + 1)) / PANE_COLS;  // ≈ 3.22 m
  const glassH      = JH - 0.1;   // glass height (slight inset from body top)
  const glassFaceZ  = JD / 2 + 0.08;   // local -Z: just in front of the body face

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xC8E4F0,
    metalness: 0.82,
    roughness: 0.04,
    transparent: true,
    opacity: 0.30,
    side: THREE.DoubleSide,
  });

  const mullionMat = new THREE.MeshStandardMaterial({
    color: 0xD8D8D8,   // light aluminum — matches reference image
    metalness: 0.55,
    roughness: 0.25,
  });

  // Glass panes — local -Z is the street-facing front
  for (let i = 0; i < PANE_COLS; i++) {
    const localX = -JW / 2 + MULLION_T * (i + 1) + paneW * (i + 0.5);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(paneW, glassH), glassMat.clone());
    pane.position.set(localX, TERRACE_H + glassH / 2, -glassFaceZ);
    pane.rotation.y = Math.PI;   // face local -Z (street)
    group.add(pane);
  }

  // Vertical mullion bars (PANE_COLS + 1 bars: left edge, between panes, right edge)
  for (let i = 0; i <= PANE_COLS; i++) {
    const localX = -JW / 2 + MULLION_T * (i + 0.5) + paneW * i;
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(MULLION_T, glassH + 0.15, 0.10),
      mullionMat,
    );
    bar.position.set(localX, TERRACE_H + glassH / 2, -(JD / 2 + 0.05));
    group.add(bar);
  }

  // Horizontal rails: header at top, sill at terrace level, mid transom
  const railPositions = [
    TERRACE_H,                    // sill (at terrace deck)
    TERRACE_H + glassH * 0.45,   // mid transom
    TERRACE_H + glassH,          // header
  ];
  for (const y of railPositions) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(JW + MULLION_T, 0.10, 0.10),
      mullionMat,
    );
    rail.position.set(0, y, -(JD / 2 + 0.05));
    group.add(rail);
  }

  // ── Gold name sign — MeshBasicMaterial (unlit, always full gold) ──────────
  const signW = Math.min(JW * 0.72, 10);
  const signMat = new THREE.MeshBasicMaterial({
    map: makeJubalaNameTexture(),
    transparent: true,
    alphaTest: 0.05,
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(signW, 0.9), signMat);
  sign.position.set(0, TERRACE_H + JH - 0.6, -(JD / 2 + 0.06));
  sign.rotation.y = Math.PI;   // face local -Z (street)
  group.add(sign);

  // ── Red "COFFEE" blade sign (MeshBasicMaterial — vivid red always) ─────────
  const bladeMat = new THREE.MeshBasicMaterial({
    map: makeBladeTexture(),
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.05,
  });
  const blade = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 3.0), bladeMat);
  blade.position.set(-(JW / 2 - 0.5), TERRACE_H + 2.5, -(JD / 2 + 0.2));
  blade.rotation.y = Math.PI / 2;   // perpendicular to the facade
  group.add(blade);

  return [body, terrace];
}