import * as THREE from 'three';

export function setupEnvironment(scene: THREE.Scene): void {
  // Ground plane (1000x1000m)
  const groundGeo = new THREE.PlaneGeometry(1000, 1000);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x334422 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(50, 100, -30); // above and slightly south
  scene.add(sun);

  // Fog
  const skyColor = 0x87ceeb;
  scene.fog = new THREE.Fog(skyColor, 100, 500);
  scene.background = new THREE.Color(skyColor);

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
