import * as THREE from 'three';

export function buildParkStage(scene: THREE.Scene): void {
  const matPlatform = new THREE.MeshStandardMaterial({ color: 0xc8b89a, flatShading: true, roughness: 0.85 });
  const matRoof     = new THREE.MeshStandardMaterial({ color: 0x4a5a6a, flatShading: true, roughness: 0.7, metalness: 0.1 });
  const matColumn   = new THREE.MeshStandardMaterial({ color: 0x9a9490, flatShading: true, roughness: 0.8 });

  // Stage placed on EAST side of Midtown Park, facing WEST toward Chuy's patio
  // (Chuy's patio sits at the NW corner: px=251, pz=211).
  // Park lawn east edge ~x=343. Stage centered north-south in the open lawn (z≈235).
  // The stage is built inside a Group so it can be rotated to face west.
  const group = new THREE.Group();

  // Local coords: stage faces +Z (audience south of platform), backwall at -Z.
  // Group is then rotated -90° around Y so the stage faces -X (west) in world.
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

  // Position on east side of park, rotate so front (+Z local) faces -X world (west)
  group.position.set(335, 0, 235);
  group.rotation.y = -Math.PI / 2;

  scene.add(group);
}
