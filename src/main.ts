import * as THREE from 'three';
import { createRenderer, updateCameraAspect } from './scene/renderer';
import { setupEnvironment } from './scene/environment';
import { fetchBuildings } from './osm/fetch';
import { extrudeBuildingsGroup } from './osm/extrude';
import { buildRoadsGroup } from './osm/roads';
import { buildGreenspaceGroup } from './osm/greenspace';
import { buildBuildingLabels } from './osm/labels';
import { buildBuildingDetails } from './osm/buildingDetails';
import { materialForType } from './scene/buildingMaterials';
import { loadCharacter } from './character/loader';
import { CharacterController } from './character/controller';
import { CameraRig } from './scene/cameraRig';
import { KeyboardState } from './controls/keyboard';
import { CollisionSystem } from './collision/bvh';
import { GyroscopeControls } from './controls/gyroscope';
import { buildTrees } from './osm/trees';
import { buildShopSigns } from './osm/shopSigns';
import { buildChuysDecor } from './osm/chuysDecor';
import { buildFences } from './osm/fences';
import { buildStreetscape } from './osm/streetscape';
import { buildParkStage } from './osm/parkStage';
import { buildBenches } from './osm/benches';

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.5,    // bumped from 0.1 — improves depth precision for thin ground layers at altitude
  2000,
);

const renderer = createRenderer();
window.addEventListener('resize', () => updateCameraAspect(camera));

setupEnvironment(scene);

const keyboard = new KeyboardState();
const gyro = new GyroscopeControls();
const collision = new CollisionSystem();
const cameraRig = new CameraRig(camera, scene);
const timer = new THREE.Timer();

// View toggle: Ground (chase cam) ↔ Aerial (top-down bird's-eye)
const viewBtn = document.getElementById('view-toggle-btn');
viewBtn?.addEventListener('click', () => {
  const next = cameraRig.getMode() === 'ground' ? 'aerial' : 'ground';
  cameraRig.setMode(next);
  viewBtn.textContent = next === 'aerial' ? 'Ground view' : 'Aerial view';
});

// Wire gyro button (iOS permission requires user gesture)
const gyroBtn = document.getElementById('gyro-btn');
gyroBtn?.addEventListener('click', async () => {
  const result = await gyro.requestPermission();
  if (result === 'granted') {
    gyroBtn.classList.add('hidden');
  } else if (result === 'unavailable') {
    gyroBtn.classList.add('hidden');
  }
});

// Show controls hint on desktop
if (navigator.maxTouchPoints === 0) {
  const hint = document.getElementById('controls-hint');
  if (hint) hint.classList.remove('hidden');
}

async function init(): Promise<void> {
  // Fetch combined OSM data (buildings + roads + parks)
  const mapData = await fetchBuildings();

  // Green spaces (parks, grass, woods) — rendered below roads
  const greenGroup = buildGreenspaceGroup(mapData);
  greenGroup.children.forEach(c => { (c as THREE.Mesh).receiveShadow = true; });
  scene.add(greenGroup);

  // Roads
  const roadGroup = buildRoadsGroup(mapData);
  scene.add(roadGroup);

  // Buildings — extrude + apply canvas-texture materials
  const buildingGroup = extrudeBuildingsGroup(mapData);
  const buildingMeshes: THREE.Mesh[] = [];
  buildingGroup.children.forEach(child => {
    const mesh = child as THREE.Mesh;
    const typeIndex = (mesh.userData['buildingType'] as number) ?? 2;
    const height = (mesh.userData['maxHeight'] as number) ?? 10;
    mesh.material = materialForType(typeIndex, height);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    buildingMeshes.push(mesh);
  });
  scene.add(buildingGroup);

  // Balconies, railings, and doors on building facades
  scene.add(buildBuildingDetails(mapData));

  // Concrete sidewalks + curbs + street trees filling the road-to-building setback
  scene.add(buildStreetscape(mapData));

  // Iron perimeter fences around building footprints
  scene.add(buildFences(mapData));

  // Trees around parks and Midtown Green
  scene.add(buildTrees(mapData));

  // Chuy's outdoor patio — orange barrel-arch canopy at NW corner of Midtown Park
  buildChuysDecor(scene);

  // Midtown Park stage + perimeter benches
  buildParkStage(scene);
  scene.add(buildBenches(mapData));

  // Ground-level shop signs from OSM POI points (opacity managed by proximity in animate)
  const shopSignGroup = buildShopSigns(mapData);
  scene.add(shopSignGroup);

  // Building name labels — start fully hidden; opacity driven by proximity in animate()
  const labelGroup = buildBuildingLabels(mapData);
  labelGroup.children.forEach(c => {
    ((c as THREE.Sprite).material as THREE.SpriteMaterial).opacity = 0;
  });
  scene.add(labelGroup);

  // Build BVH collision from all building meshes
  if (buildingMeshes.length > 0) {
    // Buildings are added to scene, so world matrices are available after scene.add
    buildingGroup.updateWorldMatrix(true, true);
    collision.build(...buildingMeshes);
    cameraRig.setRaycastFn((from, to) => collision.raycastTo(from, to));
  }

  // Toast: show building count
  const toast = document.getElementById('toast');
  if (toast) {
    toast.textContent = `${buildingMeshes.length} building types · ${mapData.features.length} OSM features`;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 5000);
  }

  // Load character
  const handle = await loadCharacter(scene);
  // Spawn on Park At North Hills Street, just south of Midtown Green apartments
  // (Midtown Green bounds: x[229,369] z[147,225])
  handle.model.position.set(280, 0, 245);
  handle.model.rotation.y = Math.PI; // face north toward Midtown Green

  // For Mixamo-rigged GLBs without bundled animations, drop arms to A-pose.
  // T-pose → A-pose for Mixamo skeletons without bundled locomotion clips.
  if (!handle.actions.idle) {
    handle.model.updateMatrixWorld(true);
    const dropArm = (boneName: string) => {
      const bone = handle.model.getObjectByName(boneName);
      if (!bone || !bone.parent) return;
      const parentInverse = new THREE.Matrix4().copy(bone.parent.matrixWorld).invert();
      const localDown = new THREE.Vector3(0, -1, 0).transformDirection(parentInverse);
      bone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), localDown);
    };
    dropArm('mixamorigLeftArm');
    dropArm('mixamorigRightArm');
  }

  const controller = new CharacterController(handle);

  // Hide loading overlay
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.add('hidden');

  // Show gyro button on mobile
  if (navigator.maxTouchPoints > 0 && gyroBtn) {
    gyroBtn.classList.remove('hidden');
  }

  const gyroDir = new THREE.Vector3();   // scratch, reused per frame

  function animate(): void {
    requestAnimationFrame(animate);
    timer.update();
    const delta = Math.min(timer.getDelta(), 0.1);

    controller.update(delta, keyboard, cameraRig.ready, collision);

    // Ctrl + Up/Down → tilt camera (look up / look down), 1.4 rad/s
    const pitchInput = keyboard.getPitchInput();
    if (pitchInput !== 0) cameraRig.adjustPitch(pitchInput * 1.4 * delta);

    if (gyro.isActive()) {
      const tilt = gyro.getTiltForward();
      if (Math.abs(tilt) > 0.01) {
        const yaw = controller.getYaw();
        gyroDir.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        handle.model.position.addScaledVector(gyroDir, tilt * 5 * delta);
      }
    }

    const correction = collision.resolveCollision(handle.model.position, 0.4, 0.6);
    handle.model.position.add(correction);

    // Proximity labels: compare XZ only — labels float high in Y so 3D distance is misleading
    const charPos = handle.model.position;
    labelGroup.children.forEach(child => {
      const s = child as THREE.Sprite;
      const dx = s.position.x - charPos.x;
      const dz = s.position.z - charPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const mat = s.material as THREE.SpriteMaterial;
      mat.opacity = dist < 60 ? 1 : dist < 80 ? 1 - (dist - 60) / 20 : 0;
    });

    // Shop signs: fade in from 80m, full opacity within 45m
    shopSignGroup.children.forEach(child => {
      const s = child as THREE.Sprite;
      const dx = s.position.x - charPos.x;
      const dz = s.position.z - charPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const mat = s.material as THREE.SpriteMaterial;
      mat.opacity = dist < 45 ? 1 : dist < 80 ? 1 - (dist - 45) / 35 : 0;
    });

    cameraRig.update(controller.getPosition(), delta, controller.getYaw());

    renderer.render(scene, camera);
  }

  // Debug hook: expose scene/camera/renderer for headless inspection — dev only.
  if ((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV) {
    (window as unknown as Record<string, unknown>).__three = { scene, camera, renderer };
  }

  animate();
}

function showError(msg: string): void {
  const el = document.getElementById('error-overlay');
  if (el) {
    el.textContent = msg;
    el.classList.remove('hidden');
  }
}

init().catch((err) => {
  console.error('Init failed:', err);
  showError('Failed to load. Please refresh.');
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.add('hidden');
});
