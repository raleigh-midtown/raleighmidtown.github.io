import * as THREE from 'three';

// Anime palette from reference: teal sky, warm cream/tan ground, muted shadows
const SKY_COLOR = 0x8ed8d2;   // soft teal
const GROUND_COLOR = 0xc8a87a; // warm tan/sand

export function setupEnvironment(scene: THREE.Scene): void {
  // Ground — warm tan like the dock/street in reference
  const groundGeo = new THREE.PlaneGeometry(3000, 3000);
  const groundMat = new THREE.MeshToonMaterial({ color: GROUND_COLOR });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Lighting: cool blue-sky ambient + directional sun with shadows
  const ambient = new THREE.AmbientLight(0x8090B8, 0.55);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff8e0, 2.0);
  sun.position.set(150, 200, -100);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.left = -800;
  sun.shadow.camera.right = 800;
  sun.shadow.camera.top = 800;
  sun.shadow.camera.bottom = -800;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // Teal sky matching reference
  scene.fog = new THREE.Fog(SKY_COLOR, 120, 1200);
  scene.background = new THREE.Color(SKY_COLOR);

  // Mobile banner (R21)
  if (navigator.maxTouchPoints > 0) {
    const dismissed = localStorage.getItem('midtown-mobile-banner-dismissed');
    if (!dismissed) {
      const banner = document.getElementById('mobile-banner');
      if (banner) {
        banner.classList.remove('hidden');
        const closeBtn = document.getElementById('mobile-banner-close');
        closeBtn?.addEventListener('click', () => {
          banner.classList.add('hidden');
          localStorage.setItem('midtown-mobile-banner-dismissed', '1');
        });
      }
    }
  }
}
