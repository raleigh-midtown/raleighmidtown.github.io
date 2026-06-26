import * as THREE from 'three';
import { createRenderer, updateCameraAspect } from './scene/renderer';
import { setupEnvironment } from './scene/environment';
import { buildMidtownScene } from './scene/midtownScene';
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
  // Build Midtown Raleigh scene from inline data
  const buildingMeshes = buildMidtownScene(scene);
  if (buildingMeshes.length > 0) {
    collision.build(...buildingMeshes);
    cameraRig.setRaycastFn((from, to) => collision.raycastTo(from, to));
  }

  // Toast: show building count
  const toast = document.getElementById('toast');
  if (toast) {
    toast.textContent = `${buildingMeshes.length} buildings loaded`;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 4000);
  }

  // Load character — loader normalises GLB to ≈1.8 m; placeholder is already that height
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

    // U5: character turns with A/D, moves forward/back with W/S
    controller.update(delta, keyboard, cameraRig.ready);

    // Gyro tilt → forward/back movement on mobile
    if (gyro.isActive()) {
      const tilt = gyro.getTiltForward();
      if (Math.abs(tilt) > 0.01) {
        const yaw = controller.getYaw();
        const dir = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        handle.model.position.addScaledVector(dir, tilt * 5 * delta);
      }
    }

    // U7: collision resolution
    const correction = collision.resolveCollision(handle.model.position, 0.4, 0.6);
    handle.model.position.add(correction);

    // U6: camera swings behind character's facing direction
    cameraRig.update(controller.getPosition(), delta, controller.getYaw());

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
