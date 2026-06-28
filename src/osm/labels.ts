import * as THREE from 'three';
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';
import { projectLonLat } from './project.js';

// Confirmed heights for North Hills landmarks (mirrors extrude.ts)
const KNOWN_HEIGHTS: Record<string, number> = {
  'The Eastern':                           115,
  'Captrust Tower':                         79,
  'Advanced Auto Parts Tower':              78,
  'Bank of America Tower':                  63,
  'Midtown Plaza':                          55,
  'Park Central North Hills':               56,
  'Hyatt House North Hills':                24,
  'Midtown Green':                          21,
  'Park & Market North Hills':              21,
  'Renaissance Raleigh North Hills Hotel':  35,
  'Landmark Center':                        18,
  'The Lassiter at North Hills':            14,
  'Restoration Hardware':                   12,
};

function getBuildingHeight(props: Record<string, unknown>): number {
  const name = String(props['name'] ?? '');
  if (name && KNOWN_HEIGHTS[name] !== undefined) return KNOWN_HEIGHTS[name];
  const h = parseFloat(String(props['height'] ?? ''));
  if (!isNaN(h) && h > 0) return h;
  const l = parseFloat(String(props['building:levels'] ?? ''));
  if (!isNaN(l) && l > 0) return l * 3.5;
  const type = String(props['building'] ?? '').toLowerCase();
  if (['apartments', 'residential'].includes(type)) return 18;
  if (['commercial', 'office'].includes(type)) return 22;
  return 10;
}

function polygonCentroid(ring: number[][]): [number, number] {
  let x = 0, z = 0;
  for (const coord of ring) {
    const [px, pz] = projectLonLat(coord[0], coord[1]);
    x += px;
    z += pz;
  }
  return [x / ring.length, z / ring.length];
}

function makeNameSprite(name: string, buildingHeight: number): THREE.Sprite {
  const W = 512, H = 72;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Dark pill background
  ctx.fillStyle = 'rgba(8, 14, 28, 0.82)';
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.fill();

  // Accent line at top
  ctx.fillStyle = buildingHeight >= 40 ? '#5aafff' : buildingHeight >= 20 ? '#aaddff' : '#ccddee';
  ctx.fillRect(0, 0, W, 3);

  // Name text
  const fontSize = buildingHeight >= 40 ? 38 : 30;
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  ctx.fillStyle = '#e8f4ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Truncate if too wide
  let label = name;
  while (ctx.measureText(label).width > W - 24 && label.length > 6) {
    label = label.slice(0, -4) + '…';
  }
  ctx.fillText(label, W / 2, H / 2 + 2);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);

  // World height scales with building importance; width follows canvas aspect
  const worldH = buildingHeight >= 40 ? 18 : buildingHeight >= 20 ? 13 : 9;
  sprite.scale.set(worldH * (W / H), worldH, 1);
  return sprite;
}

export function buildBuildingLabels(geojson: FeatureCollection): THREE.Group {
  const group = new THREE.Group();

  for (const feature of geojson.features as Feature[]) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    if (!props['building'] || !props['name']) continue;

    const name = String(props['name']);
    const height = getBuildingHeight(props);

    const geomType = feature.geometry?.type;
    let ring: number[][] | null = null;
    if (geomType === 'Polygon') {
      ring = (feature.geometry as Polygon).coordinates[0] as number[][];
    } else if (geomType === 'MultiPolygon') {
      ring = (feature.geometry as MultiPolygon).coordinates[0][0] as number[][];
    }
    if (!ring || ring.length < 2) continue;

    const [cx, cz] = polygonCentroid(ring);
    const sprite = makeNameSprite(name, height);
    // Float label just above the roofline
    sprite.position.set(cx, height + 12, cz);
    group.add(sprite);
  }

  return group;
}
