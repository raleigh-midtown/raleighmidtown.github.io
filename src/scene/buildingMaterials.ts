import * as THREE from 'three';

// UV tile = 10 m of wall (set by WALL_TILE_SIZE in extrude.ts).
// cols × rows per tile → e.g. 4 cols = 2.5 m/window, 3 rows = 3.3 m/floor.

interface WindowOpts {
  bgColor: string;
  frameColor?: string;       // optional explicit mullion/frame color
  windowColor: string;
  litColor: string;
  cols: number;
  rows: number;
  litRatio: number;
  padXRatio?: number;        // fraction of cell width used as left+right padding
  padYRatio?: number;        // fraction of cell height used as top+bottom padding
  res?: number;              // canvas resolution (default 512)
}

function makeWindowTexture(opts: WindowOpts): THREE.CanvasTexture {
  const S = opts.res ?? 512;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = opts.bgColor;
  ctx.fillRect(0, 0, S, S);

  const colW = S / opts.cols;
  const rowH = S / opts.rows;
  const px = colW * (opts.padXRatio ?? 0.16);
  const py = rowH * (opts.padYRatio ?? 0.18);
  const wW = colW - px * 2;
  const wH = rowH - py * 2;

  for (let r = 0; r < opts.rows; r++) {
    for (let c = 0; c < opts.cols; c++) {
      const lit = Math.random() < opts.litRatio;
      ctx.fillStyle = lit ? opts.litColor : opts.windowColor;
      ctx.fillRect(c * colW + px, r * rowH + py, wW, wH);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ─── Reference-matched material factories ────────────────────────────────────

/**
 * One North Hills Tower style.
 * Cream limestone precast panel grid with blue-green curtain-wall glass and
 * thin aluminium mullions. Floor-to-ceiling glazing per bay.
 */
function modernCurtainWallMaterial(): THREE.MeshStandardMaterial {
  const tex = makeWindowTexture({
    bgColor:    '#dcd7c6',   // cream limestone / precast
    windowColor:'#4d7f9e',   // blue-green curtain glass (sky reflection)
    litColor:   '#a2cde8',   // brighter sky panel
    cols: 4,                 // 4 bays / 10 m → 2.5 m each
    rows: 3,                 // 3 floors / 10 m → 3.3 m each
    litRatio:   0.52,
    padXRatio:  0.09,        // thin aluminium mullion
    padYRatio:  0.14,
  });
  return new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff,
    metalness: 0.38,
    roughness: 0.28,
  });
}

/**
 * Capital Towers style (1970s–80s modernist).
 * Light beige precast concrete structural grid; very dark, nearly-black
 * tinted glass in a tight regular pattern. Thick concrete frame.
 */
function concreteGridMaterial(): THREE.MeshStandardMaterial {
  const tex = makeWindowTexture({
    bgColor:    '#bab0a0',   // light beige precast concrete
    windowColor:'#1a2430',   // near-black tinted glass
    litColor:   '#2e4458',   // faint interior glow
    cols: 3,                 // 3 windows / 10 m → 3.3 m
    rows: 3,
    litRatio:   0.22,
    padXRatio:  0.24,        // thick concrete frame (structural)
    padYRatio:  0.24,
  });
  return new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff,
    metalness: 0.04,
    roughness: 0.82,
  });
}

/**
 * Landmark at North Hills style (classic suburban office).
 * Warm reddish-brown brick with alternating horizontal dark-glass bands
 * that run the full width of each floor.
 */
function makeBrickOfficeTex(): THREE.CanvasTexture {
  const W = 512, H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Mortar background
  ctx.fillStyle = '#b8a898';
  ctx.fillRect(0, 0, W, H);

  const bW = 52, bH = 20, gap = 3;
  const totalRows = Math.ceil(H / bH) + 1;

  for (let row = 0; row < totalRows; row++) {
    const offset = row % 2 === 0 ? 0 : bW / 2;
    for (let col = -1; col < Math.ceil(W / bW) + 1; col++) {
      // Warm reddish-brown: Landmark's distinctive palette
      const hue = 12 + Math.random() * 8;
      const sat = 50 + Math.random() * 15;
      const lum = 32 + Math.random() * 10;
      ctx.fillStyle = `hsl(${hue},${sat}%,${lum}%)`;
      ctx.fillRect(col * bW + offset + gap / 2, row * bH + gap / 2, bW - gap, bH - gap);
    }
  }

  // Horizontal full-width dark glass bands (every 4 brick rows = ~1 floor)
  ctx.fillStyle = '#1c2a38';
  for (let row = 3; row < totalRows; row += 4) {
    ctx.fillRect(10, row * bH, W - 20, bH * 1.5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(0.5, 0.5); // canvas covers 5 m; tile = 10 m
  return tex;
}

function brickOfficeMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: makeBrickOfficeTex(),
    color: 0xffffff,
    roughness: 0.90,
    metalness: 0.00,
  });
}

/**
 * Midtown Green Apartments style.
 * Rich deep red brick with individual punched rectangular windows,
 * white stone sill/trim surround, black sash.
 */
function makeResidentialBrickTex(): THREE.CanvasTexture {
  const W = 512, H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#bfae9e';
  ctx.fillRect(0, 0, W, H);

  const bW = 48, bH = 18, gap = 3;
  const totalRows = Math.ceil(H / bH) + 1;

  for (let row = 0; row < totalRows; row++) {
    const offset = row % 2 === 0 ? 0 : bW / 2;
    for (let col = -1; col < Math.ceil(W / bW) + 1; col++) {
      // Deep red — richer and darker than Landmark
      const hue = 8 + Math.random() * 10;
      const sat = 58 + Math.random() * 16;
      const lum = 27 + Math.random() * 10;
      ctx.fillStyle = `hsl(${hue},${sat}%,${lum}%)`;
      ctx.fillRect(col * bW + offset + gap / 2, row * bH + gap / 2, bW - gap, bH - gap);
    }
  }

  // Punched windows: 3 columns, every 5 brick rows (~1 floor at 90px/floor)
  const winW = W / 5;
  const winH = bH * 3;
  for (let row = 2; row < totalRows - 2; row += 5) {
    for (let col = 0; col < 3; col++) {
      const wx = col * (W / 3) + W / 9;
      const wy = row * bH;
      // White stone sill / trim frame
      ctx.fillStyle = '#e4ddd0';
      ctx.fillRect(wx - 4, wy - 4, winW + 8, winH + 8);
      // Dark sash + glass
      ctx.fillStyle = '#1c2838';
      ctx.fillRect(wx, wy, winW, winH);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(0.5, 0.5);
  return tex;
}

function residentialBrickMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: makeResidentialBrickTex(),
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0.00,
  });
}

/**
 * North Hills District retail / mixed-use style.
 * Cream/tan stucco facade with wide storefront glazing and minimal framing.
 * Also covers hotel ground floors and low attached retail.
 */
function retailStuccoMaterial(): THREE.MeshStandardMaterial {
  const tex = makeWindowTexture({
    bgColor:    '#cfc7a5',   // cream/tan stucco
    windowColor:'#203040',   // dark storefront glass
    litColor:   '#e8d898',   // warm interior (restaurant / retail)
    cols: 3,                 // 3 bays / 10 m → wide storefronts
    rows: 2,                 // low-rise: 2 floors / 10 m
    litRatio:   0.65,        // lots of lit interiors
    padXRatio:  0.10,        // thin frame — big glazing
    padYRatio:  0.28,        // thick sill + lintel → tall opening
  });
  return new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0.00,
  });
}

// ─── Public selector ─────────────────────────────────────────────────────────

/**
 * Pick the reference-matched material by OSM type index and representative height.
 *
 * The height passed in is the band representative from extrudeBuildingsGroup
 * (8 / 18 / 32 / 60 m), so thresholds here align with those band midpoints.
 *
 *   ≥ 40 m  → One North Hills / BofA Tower style  (curtain-wall glass)
 *   ≥ 24 m  → Capital Towers style                 (concrete grid)
 *   ≥ 12 m, commercial/unknown → Landmark style    (brick office)
 *   ≥ 12 m, residential        → Midtown Green     (residential brick)
 *   < 12 m  → North Hills District style           (retail stucco)
 */
export function materialForType(typeIndex: number, height: number): THREE.MeshStandardMaterial {
  if (height >= 40)                          return modernCurtainWallMaterial();
  if (height >= 24)                          return concreteGridMaterial();
  if (height >= 12 && typeIndex === 0)       return residentialBrickMaterial();
  if (height >= 12)                          return brickOfficeMaterial();
  return retailStuccoMaterial();
}
