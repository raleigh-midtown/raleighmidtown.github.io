import * as THREE from 'three';
import { createRenderer, updateCameraAspect } from './scene/renderer';
import { setupEnvironment } from './scene/environment';
import { fetchBuildings } from './osm/fetch';
import { extrudeBuildings } from './osm/extrude';
import { loadCharacter } from './character/loader';
import { CharacterController } from './character/controller';
import { CameraRig } from './scene/cameraRig';
import { KeyboardState } from './controls/keyboard';
import { CollisionSystem } from './collision/bvh';
import { GyroscopeControls } from './controls/gyroscope';

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
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

// Async startup: load buildings and character, then start loop
async function init(): Promise<void> {
  // Load OSM buildings
  let buildingMesh: THREE.Mesh | null = null;
  try {
    const geojson = await fetchBuildings();
    const geo = extrudeBuildings(geojson);
    const mat = new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.8 });
    buildingMesh = new THREE.Mesh(geo, mat);
    scene.add(buildingMesh);
    collision.build(buildingMesh);
  } catch (e) {
    console.warn('Building load failed:', e);
  }

  // Load character
  const handle = await loadCharacter(scene);
  handle.model.position.set(0, 0, 0);
  const controller = new CharacterController(handle);

  // Hide loading overlay
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.add('hidden');

  // Show gyro button on mobile
  if (navigator.maxTouchPoints > 0 && gyroBtn) {
    gyroBtn.classList.remove('hidden');
  }

  // Fixed tick order: U5 → U7 → U6 → U8 → render
  function animate(): void {
    requestAnimationFrame(animate);
    timer.update();
    const delta = Math.min(timer.getDelta(), 0.1); // cap at 100ms to avoid tunnelling

    // U5: character movement (uses previous frame's camera yaw — intentional)
    const yaw = gyro.getCameraYaw() ?? cameraRig.getCameraYaw();
    controller.update(delta, keyboard, yaw, cameraRig.ready);

    // Apply gyro tilt as forward movement on mobile
    if (gyro.isActive()) {
      const tilt = gyro.getTiltForward();
      if (Math.abs(tilt) > 0.01) {
        // Simulate forward/backward key by directly nudging position along camera direction
        const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        handle.model.position.addScaledVector(dir, tilt * 5 * delta);
      }
    }

    // U7: collision resolution
    const correction = collision.resolveCollision(handle.model.position, 0.4, 0.6);
    handle.model.position.add(correction);

    // U6: camera follows character
    cameraRig.update(controller.getPosition(), delta);

    renderer.render(scene, camera);
  }

  animate();
}

// Show error overlay on fatal failure
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
