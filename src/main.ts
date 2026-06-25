import * as THREE from 'three';
import { createRenderer, updateCameraAspect } from './scene/renderer';

// ── Scene bootstrap ──────────────────────────────────────────────────────────

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  2000,
);
camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);

const renderer = createRenderer();

// Placeholder ground plane (replaced by U3 environment)
const groundGeo = new THREE.PlaneGeometry(1000, 1000);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x334422 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(50, 100, 50);
scene.add(sun);

window.addEventListener('resize', () => updateCameraAspect(camera));

// ── Render loop ──────────────────────────────────────────────────────────────
// Fixed tick order (placeholders for units U2–U8, filled in as units land):
//   (1) keyboard state  → U5 keyboardState.update()
//   (2) character move  → U5 updateCharacter()
//   (3) collision       → U7 resolveCollision()
//   (4) camera follow   → U6 cameraRig.update()
//   (5) gyro orient     → U8 gyroscopeUpdate()
//   (6) render

const timer = new THREE.Timer();

function animate(): void {
  requestAnimationFrame(animate);
  timer.update();
  const delta = timer.getDelta();

  // (1)-(5) will be wired by later units
  void delta;

  renderer.render(scene, camera);
}

animate();

// Hide loading overlay immediately on scaffold (U2 will manage it properly)
const overlay = document.getElementById('loading-overlay');
if (overlay) overlay.classList.add('hidden');

export { scene, camera, renderer };
