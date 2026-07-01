import * as THREE from 'three';

/**
 * Shared storefront factory — extracts the Jubala Coffee storefront assembly
 * (body + glass panes + mullions + rails + name sign + optional blade) into a
 * placement-agnostic builder. Each storefront is wrapped in its own
 * `THREE.Group` placed at a world position with `rotation.y = rotY`; children
 * use local coordinates where local `-Z` is the street-facing front, identical
 * to the `jubalaDecor.ts` convention (AGENTS.md: "Hand-placed scene props belong
 * inside a THREE.Group, positioned + rotated as a unit").
 *
 * Returns only the opaque body mesh for collision registration (R4/R5): glass,
 * mullions, rails, signs, and blades are added to the scene but NOT returned.
 *
 * Coordinate conventions: +X east, +Z south, +Y up.
 */

export interface StorefrontBladeOpts {
  text: string;   // blade text (rendered rotated, vertical)
  bg: string;     // blade background color
  fg: string;     // blade text color
}

export interface StorefrontOpts {
  worldX: number;
  worldZ: number;
  rotY: number;
  terraceH: number;
  width: number;
  height?: number;        // default 5 (m) above terrace
  depth?: number;         // default 2 (m) — thin facade slab
  bodyColor: number;
  paneCols?: number;      // default 4 glass bays
  signText: string;
  signTextColor: string;
  signBgColor?: string;   // if omitted, transparent background (like Jubala gold)
  blade?: StorefrontBladeOpts;
}

// ── Canvas texture helpers ──────────────────────────────────────────────────

/**
 * Name sign texture — generalized from `makeJubalaNameTexture`. Renders `text`
 * in `color` on a transparent canvas, optionally over a solid `bgColor`. Font
 * size auto-shrinks so longer names ("FURNITURE RENTAL", "ONE MEDICAL") fit the
 * canvas width; short names ("JUBALA") keep the original 56 px look.
 */
function makeNameTexture(text: string, color: string, bgColor?: string): THREE.CanvasTexture {
  const W = 512; const H = 96;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);
  if (bgColor) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Auto-fit: start at the Jubala reference size and shrink until the text fits.
  let fontSize = 56;
  for (;;) {
    ctx.font = `bold ${fontSize}px sans-serif`;
    const metrics = ctx.measureText(text);
    if (metrics.width <= W - 24 || fontSize <= 16) break;
    fontSize -= 2;
  }
  ctx.fillText(text, W / 2, H / 2);
  return new THREE.CanvasTexture(canvas);
}

/**
 * Blade sign texture — generalized from `makeBladeTexture`. A 64×256 vertical
 * canvas with a solid `bg` fill and rotated `fg` text. Dimensions are fixed so
 * the Jubala regression guard (64×256 canvas) holds.
 */
function makeBladeTexture(text: string, bg: string, fg: string): THREE.CanvasTexture {
  const W = 64; const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = fg;
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
  return new THREE.CanvasTexture(canvas);
}

// ── Main export ─────────────────────────────────────────────────────────────

/**
 * Build a storefront assembly and add it to `scene`. Returns the opaque body
 * mesh for collision registration.
 */
export function makeStorefront(scene: THREE.Scene, opts: StorefrontOpts): THREE.Mesh {
  const {
    worldX, worldZ, rotY, terraceH, width,
    height = 5, depth = 2, bodyColor,
    paneCols = 4, signText, signTextColor, signBgColor, blade,
  } = opts;

  // One group, placed + rotated as a unit (AGENTS.md convention). Children use
  // local coordinates; local -Z is the street-facing front.
  const group = new THREE.Group();
  group.position.set(worldX, 0, worldZ);
  group.rotation.y = rotY;
  scene.add(group);

  // ── Body — thin facade slab, base sits on the shared terrace ───────────────
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color: bodyColor, flatShading: true }),
  );
  body.position.set(0, terraceH + height / 2, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // ── Glass panes — `paneCols` bays separated by aluminum mullions ───────────
  const MULLION_T = 0.12;   // mullion thickness (m)
  const paneW = (width - MULLION_T * (paneCols + 1)) / paneCols;
  const glassH = height - 0.1;          // glass height (slight inset from body top)
  const glassFaceZ = depth / 2 + 0.08;  // local -Z: just in front of the body face

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xC8E4F0,
    metalness: 0.82,
    roughness: 0.04,
    transparent: true,
    opacity: 0.30,
    side: THREE.DoubleSide,
  });

  const mullionMat = new THREE.MeshStandardMaterial({
    color: 0xD8D8D8,   // light aluminum
    metalness: 0.55,
    roughness: 0.25,
  });

  // Glass panes — local -Z is the street-facing front
  for (let i = 0; i < paneCols; i++) {
    const localX = -width / 2 + MULLION_T * (i + 1) + paneW * (i + 0.5);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(paneW, glassH), glassMat.clone());
    pane.position.set(localX, terraceH + glassH / 2, -glassFaceZ);
    pane.rotation.y = Math.PI;   // face local -Z (street)
    group.add(pane);
  }

  // Vertical mullion bars (paneCols + 1 bars: left edge, between panes, right edge)
  for (let i = 0; i <= paneCols; i++) {
    const localX = -width / 2 + MULLION_T * (i + 0.5) + paneW * i;
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(MULLION_T, glassH + 0.15, 0.10),
      mullionMat,
    );
    bar.position.set(localX, terraceH + glassH / 2, -(depth / 2 + 0.05));
    group.add(bar);
  }

  // Horizontal rails: header at top, sill at terrace level, mid transom
  const railPositions = [
    terraceH,                    // sill (at terrace deck)
    terraceH + glassH * 0.45,   // mid transom
    terraceH + glassH,          // header
  ];
  for (const y of railPositions) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(width + MULLION_T, 0.10, 0.10),
      mullionMat,
    );
    rail.position.set(0, y, -(depth / 2 + 0.05));
    group.add(rail);
  }

  // ── Name sign — MeshBasicMaterial (unlit, always full color) ───────────────
  const signW = Math.min(width * 0.72, 10);
  const signMat = new THREE.MeshBasicMaterial({
    map: makeNameTexture(signText, signTextColor, signBgColor),
    transparent: true,
    alphaTest: 0.05,
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(signW, 0.9), signMat);
  sign.position.set(0, terraceH + height - 0.6, -(depth / 2 + 0.06));
  sign.rotation.y = Math.PI;   // face local -Z (street)
  group.add(sign);

  // ── Optional perpendicular blade sign (MeshBasicMaterial — vivid) ──────────
  if (blade) {
    const bladeMat = new THREE.MeshBasicMaterial({
      map: makeBladeTexture(blade.text, blade.bg, blade.fg),
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.05,
    });
    const bladeMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 3.0), bladeMat);
    bladeMesh.position.set(-(width / 2 - 0.5), terraceH + 2.5, -(depth / 2 + 0.2));
    bladeMesh.rotation.y = Math.PI / 2;   // perpendicular to the facade
    group.add(bladeMesh);
  }

  return body;
}