import * as THREE from 'three';
import type { FeatureCollection, Feature } from 'geojson';
import { projectLonLat } from './project.js';

const TYPE_COLORS: Record<string, string> = {
  cafe:         '#6b3a1f',
  restaurant:   '#7a2a1a',
  fast_food:    '#8a3a10',
  bar:          '#2a1a4a',
  clothes:      '#1a3a5a',
  jewelry:      '#4a2a6a',
  furniture:    '#3a4a2a',
  supermarket:  '#1a5a2a',
  department_store: '#1a2a5a',
  default:      '#2a3a4a',
};

function makeShopSprite(name: string, type: string): THREE.Sprite {
  const W = 512, H = 72;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const bg = TYPE_COLORS[type] ?? TYPE_COLORS['default'];
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // White border inset
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(3, 3, W - 6, H - 6);

  // Accent dot on left
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(20, H / 2, 7, 0, Math.PI * 2); ctx.fill();

  ctx.font = 'bold 30px Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let label = name;
  while (ctx.measureText(label).width > W - 52 && label.length > 4) label = label.slice(0, -4) + '…';
  ctx.fillText(label, 38, H / 2);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(32, 4.5, 1);   // ~32m wide, 4.5m tall — visible from further away
  return sprite;
}

export function buildShopSigns(geojson: FeatureCollection): THREE.Group {
  const group = new THREE.Group();

  for (const feature of geojson.features as Feature[]) {
    if (feature.geometry?.type !== 'Point') continue;
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const name = String(props['name'] ?? '');
    if (!name) continue;
    const type = String(props['amenity'] ?? props['shop'] ?? '');
    if (!type) continue;

    const [lon, lat] = (feature.geometry as { type: 'Point'; coordinates: number[] }).coordinates;
    const [x, z] = projectLonLat(lon, lat);

    const sprite = makeShopSprite(name, type);
    sprite.position.set(x, 8.0, z);   // 8m up — above building awnings, visible from afar
    group.add(sprite);
  }

  return group;
}
