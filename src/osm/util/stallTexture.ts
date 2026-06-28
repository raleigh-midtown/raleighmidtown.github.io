import * as THREE from 'three';

const STALL_TEX_SIZE = 256;

/**
 * Draw an asphalt canvas with white stall-edge stripes along both axes.
 * The L-shaped corner stripe, when tiled with RepeatWrapping, produces a
 * full column-and-row stall grid across the lot surface.
 * Returns null when a 2D context is unavailable (non-browser environments).
 */
export function makeStallTexture(): THREE.CanvasTexture | null {
  const canvas = document.createElement('canvas');
  canvas.width = STALL_TEX_SIZE;
  canvas.height = STALL_TEX_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#2a2826';
  ctx.fillRect(0, 0, STALL_TEX_SIZE, STALL_TEX_SIZE);

  const stripeW = Math.max(2, Math.round(STALL_TEX_SIZE * 0.028));
  ctx.fillStyle = '#e8e8e8';
  // Vertical stripe at tile left → column dividers when tiled.
  ctx.fillRect(0, 0, stripeW, STALL_TEX_SIZE);
  // Horizontal stripe at tile top → row dividers when tiled.
  ctx.fillRect(0, 0, STALL_TEX_SIZE, stripeW);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
