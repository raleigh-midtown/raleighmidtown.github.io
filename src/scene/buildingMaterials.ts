import * as THREE from 'three';

// UV tile = 10 m of wall (set by WALL_TILE_SIZE in extrude.ts).
// cols × rows per tile → e.g. 4 cols = 2.5 m/window, 3 rows = 3.3 m/floor.

interface WindowOpts {
  bgColor: string;
  frameColor?: string;
  windowColor: string;
  litColor: string;
  cols: number;
  rows: number;
  litRatio: number;
  padXRatio?: number;
  padYRatio?: number;
  res?: number;
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

function modernCurtainWallMaterial(): THREE.MeshStandardMaterial {
  const tex = makeWindowTexture({
    bgColor:    '#dcd7c6',
    windowColor:'#7ab8d8',
    litColor:   '#c8e8f8',
    cols: 4,
    rows: 3,
    litRatio:   0.52,
    padXRatio:  0.09,
    padYRatio:  0.14,
  });
  return new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff,
    metalness: 0.72,
    roughness: 0.08,
    envMapIntensity: 1.2,
  });
}

function concreteGridMaterial(): THREE.MeshStandardMaterial {
  const tex = makeWindowTexture({
    bgColor:    '#bab0a0',
    windowColor:'#1a2430',
    litColor:   '#2e4458',
    cols: 3,
    rows: 3,
    litRatio:   0.22,
    padXRatio:  0.24,
    padYRatio:  0.24,
  });
  return new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff,
    metalness: 0.04,
    roughness: 0.82,
  });
}

function makeBrickOfficeTex(): THREE.CanvasTexture {
  const W = 512, H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#b8a898';
  ctx.fillRect(0, 0, W, H);

  const bW = 52, bH = 20, gap = 3;
  const totalRows = Math.ceil(H / bH) + 1;

  for (let row = 0; row < totalRows; row++) {
    const offset = row % 2 === 0 ? 0 : bW / 2;
    for (let col = -1; col < Math.ceil(W / bW) + 1; col++) {
      const hue = 12 + Math.random() * 8;
      const sat = 50 + Math.random() * 15;
      const lum = 32 + Math.random() * 10;
      ctx.fillStyle = `hsl(${hue},${sat}%,${lum}%)`;
      ctx.fillRect(col * bW + offset + gap / 2, row * bH + gap / 2, bW - gap, bH - gap);
    }
  }

  ctx.fillStyle = '#1c2a38';
  for (let row = 3; row < totalRows; row += 4) {
    ctx.fillRect(10, row * bH, W - 20, bH * 1.5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(0.5, 0.5);
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
      const hue = 8 + Math.random() * 10;
      const sat = 58 + Math.random() * 16;
      const lum = 27 + Math.random() * 10;
      ctx.fillStyle = `hsl(${hue},${sat}%,${lum}%)`;
      ctx.fillRect(col * bW + offset + gap / 2, row * bH + gap / 2, bW - gap, bH - gap);
    }
  }

  const winW = W / 5;
  const winH = bH * 3;
  for (let row = 2; row < totalRows - 2; row += 5) {
    for (let col = 0; col < 3; col++) {
      const wx = col * (W / 3) + W / 9;
      const wy = row * bH;
      ctx.fillStyle = '#e4ddd0';
      ctx.fillRect(wx - 4, wy - 4, winW + 8, winH + 8);
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

function retailStuccoMaterial(): THREE.MeshStandardMaterial {
  const tex = makeWindowTexture({
    bgColor:    '#cfc7a5',
    windowColor:'#3a7aaa',
    litColor:   '#d4eeff',
    cols: 3,
    rows: 2,
    litRatio:   0.65,
    padXRatio:  0.10,
    padYRatio:  0.28,
  });
  return new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0.00,
  });
}

// Memoize material builders so multiple buildings sharing a band don't each
// allocate a fresh 512x512 canvas texture.
type MatKind = 'curtain' | 'concrete' | 'residential' | 'brick' | 'retail';
const _matCache: Partial<Record<MatKind, THREE.MeshStandardMaterial>> = {};
const _builders: Record<MatKind, () => THREE.MeshStandardMaterial> = {
  curtain:     modernCurtainWallMaterial,
  concrete:    concreteGridMaterial,
  residential: residentialBrickMaterial,
  brick:       brickOfficeMaterial,
  retail:      retailStuccoMaterial,
};
function get(kind: MatKind): THREE.MeshStandardMaterial {
  return (_matCache[kind] ??= _builders[kind]());
}

export function materialForType(typeIndex: number, height: number): THREE.MeshStandardMaterial {
  if (height >= 40)                          return get('curtain');
  if (height >= 24)                          return get('concrete');
  if (height >= 12 && typeIndex === 0)       return get('residential');
  if (height >= 12)                          return get('brick');
  return get('retail');
}
