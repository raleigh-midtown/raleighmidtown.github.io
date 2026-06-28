import * as THREE from 'three';
import type { FeatureCollection, Feature } from 'geojson';
import { projectLonLat } from './project.js';
import { type Pt, getRings, polygonCentroid, edgeInwardNormal } from './util/geom.js';

const MIDTOWN_PARK_NAME = 'Midtown Park';

function findMidtownPark(geojson: FeatureCollection): Pt[] | null {
  for (const f of geojson.features as Feature[]) {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    if (String(p['name'] ?? '') !== MIDTOWN_PARK_NAME) continue;
    const rings = getRings(f as Feature);
    if (rings.length === 0) continue;
    return rings[0].map(c => projectLonLat(c[0], c[1]));
  }
  return null;
}

export function buildParkStage(scene: THREE.Scene, geojson: FeatureCollection): void {
  const matPlatform = new THREE.MeshStandardMaterial({ color: 0xc8b89a, flatShading: true, roughness: 0.85 });
  const matRoof     = new THREE.MeshStandardMaterial({ color: 0x4a5a6a, flatShading: true, roughness: 0.7, metalness: 0.1 });
  const matColumn   = new THREE.MeshStandardMaterial({ color: 0x9a9490, flatShading: true, roughness: 0.8 });

  // Stage placed on the EAST side of Midtown Park, facing inward (toward Chuy's patio
  // at the NW corner). Placement is derived from the park polygon east edge at runtime.
  // The stage is built inside a Group so position and rotation can be set as a unit.
  const group = new THREE.Group();

  // Local coords: stage faces +Z (audience side), back wall at -Z.
  // After rotation.y = atan2(inX, inZ), local +Z aligns with the inward normal.
  const PLAT_W = 14, PLAT_H = 1.2, PLAT_D = 9;

  // Platform
  const platform = new THREE.Mesh(new THREE.BoxGeometry(PLAT_W, PLAT_H, PLAT_D), matPlatform);
  platform.position.set(0, PLAT_H / 2, 0);
  platform.castShadow = true; platform.receiveShadow = true;
  group.add(platform);

  // Back wall
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(12, 4.5, 0.4), matPlatform);
  backWall.position.set(0, 2.25 + PLAT_H, -PLAT_D / 2 + 0.2);
  backWall.castShadow = true;
  group.add(backWall);

  // Roof canopy
  const roof = new THREE.Mesh(new THREE.BoxGeometry(15, 0.35, 10), matRoof);
  roof.position.set(0, PLAT_H + 5.2, 0);
  roof.castShadow = true;
  group.add(roof);

  // 4 support columns
  const colGeo = new THREE.CylinderGeometry(0.22, 0.26, 5.2, 7);
  [[-5.5, -3.5], [5.5, -3.5], [-5.5, 3.5], [5.5, 3.5]].forEach(([dx, dz]) => {
    const col = new THREE.Mesh(colGeo, matColumn);
    col.position.set(dx, PLAT_H + 2.6, dz);
    col.castShadow = true;
    group.add(col);
  });

  // Steps at front (audience side, +Z local)
  [0, 1, 2].forEach(i => {
    const step = new THREE.Mesh(new THREE.BoxGeometry(5, 0.38, 0.55), matPlatform);
    step.position.set(0, 0.19 + i * 0.38, PLAT_D / 2 + 0.275 + i * 0.55);
    group.add(step);
  });

  // Derive placement from the Midtown Park polygon east edge.
  // East edge = segment with the highest average X midpoint.
  // Inset group origin inward by PLAT_D/2 so the back wall (local z = -PLAT_D/2)
  // sits flush with the park boundary. Falls back to hardcoded values if OSM data
  // is unavailable so the stage always renders.
  const park = findMidtownPark(geojson);
  if (park && park.length >= 4) {
    const [cx, cz] = polygonCentroid(park);

    // Find the segment with the highest average X midpoint (east edge).
    let bestMidX = -Infinity;
    let eastAx = 0, eastAz = 0, eastBx = 0, eastBz = 0;
    for (let i = 0; i < park.length - 1; i++) {
      const [ax, az] = park[i];
      const [bx, bz] = park[i + 1];
      const midX = (ax + bx) / 2;
      if (midX > bestMidX) {
        bestMidX = midX;
        eastAx = ax; eastAz = az; eastBx = bx; eastBz = bz;
      }
    }

    const edgeMidX = (eastAx + eastBx) / 2;
    const edgeMidZ = (eastAz + eastBz) / 2;
    const [inX, inZ] = edgeInwardNormal(eastAx, eastAz, eastBx, eastBz, cx, cz);

    group.rotation.y = Math.atan2(inX, inZ);
    group.position.set(
      edgeMidX + inX * (PLAT_D / 2),
      0,
      edgeMidZ + inZ * (PLAT_D / 2),
    );
  } else {
    // Fallback: hardcoded placement from original implementation.
    group.position.set(335, 0, 235);
    group.rotation.y = -Math.PI / 2;
  }

  scene.add(group);
}
