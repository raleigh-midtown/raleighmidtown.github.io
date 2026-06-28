import * as THREE from 'three';

/**
 * Chuy's outdoor patio — elevated seating deck with red barrel-arch canopy.
 *
 * Building footprint (given): x[209,246], z[193,230]
 * East side is +X.
 */
export function buildChuysDecor(scene: THREE.Scene): void {
  const px = 251;   // patio center X (east of building)
  const pz = 211;   // patio center Z
  const PW = 18;    // patio width in X
  const PD = 16;    // patio depth in Z

  // ── Materials ──────────────────────────────────────────────────────────
  const matDeck = new THREE.MeshToonMaterial({ color: 0xc89860 });
  const matArch = new THREE.MeshToonMaterial({ color: 0xc03010, side: THREE.DoubleSide });
  const matWall = new THREE.MeshToonMaterial({ color: 0x904020 });
  const matTrim = new THREE.MeshToonMaterial({ color: 0x2255bb });
  const matStep = new THREE.MeshToonMaterial({ color: 0xb88050 });
  const matPost = new THREE.MeshToonMaterial({ color: 0xa06030 });

  // ── Elevated platform ──────────────────────────────────────────────────
  const deckH = 0.75;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(PW, deckH, PD), matDeck);
  deck.position.set(px, deckH / 2, pz);
  deck.receiveShadow = true;
  scene.add(deck);

  // ── Approach steps on EAST side (+X, park-facing) ─────────────────────
  const stepW = 8;           // span across Z
  const numSteps = 3;
  const stepH = deckH / numSteps;
  const stepD = 0.5;         // run in X

  for (let s = 0; s < numSteps; s++) {
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(stepD, stepH * (s + 1), stepW),
      matStep
    );

    // Outermost step is farthest east; innermost meets deck edge.
    step.position.set(
      px + PW / 2 + stepD * (numSteps - s - 0.5),
      (stepH * (s + 1)) / 2,
      pz
    );
    step.receiveShadow = true;
    scene.add(step);
  }

  // ── Low perimeter retaining walls (N, S, W; EAST open for steps) ─────
  const wallH = 0.7;
  const wallY = deckH + wallH / 2;

  const addWall = (x: number, z: number, w: number, d: number) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), matWall);
    wall.position.set(x, wallY, z);
    wall.receiveShadow = true;
    scene.add(wall);

    const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, 0.12, d + 0.05), matTrim);
    trim.position.set(x, wallY + wallH / 2 + 0.06, z);
    scene.add(trim);
  };

  // North/South along X, West along Z
  addWall(px, pz - PD / 2, PW, 0.32);          // north
  addWall(px, pz + PD / 2, PW, 0.32);          // south
  addWall(px - PW / 2, pz, 0.32, PD);          // west
  // East side intentionally open

  // ── Barrel arch canopy (FIXED ALIGNMENT) ──────────────────────────────
  // 3 arches side-by-side in X, tunnel axis along Z (N-S), openings face ±X.
  const numArches = 3;
  const archR = PW / (2 * numArches);          // = 3
  const archLen = PD;
  const archBaseY = deckH + wallH;             // spring line at wall top

  // Half-cylinder oriented as a barrel arch: axis along Z, curve UP.
  // CylinderGeometry default axis is Y, cross-section in XZ plane.
  // thetaStart=0,length=π gives the +Z half (the upper half in XZ).
  // rotateX(-π/2) maps that +Z hump onto +Y → curve faces up after rotation,
  // and the cylinder's height axis (was Y) ends up along Z.
  const archGeo = new THREE.CylinderGeometry(
    archR, archR, archLen,
    20, 1,
    true,
    0, Math.PI,
  );
  archGeo.rotateX(-Math.PI / 2);

  for (let i = 0; i < numArches; i++) {
    const archX = px - PW / 2 + archR + i * (2 * archR);
    const arch = new THREE.Mesh(archGeo, matArch);
    arch.position.set(archX, archBaseY + archR, pz);
    arch.castShadow = true;
    scene.add(arch);
  }

  // ── Continuous flat roof spanning all arches ──────────────────────────
  // The 3 half-cylinders dip to base height where they meet, leaving "valleys"
  // that look like gaps from above. A thin slab just above the arch crowns
  // closes the canopy so it reads as one unified roof in plan view.
  const roofThk = 0.18;
  const roofY = archBaseY + 2 * archR + roofThk / 2;
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(PW + 0.4, roofThk, PD + 0.4),
    matArch,
  );
  roof.position.set(px, roofY, pz);
  roof.castShadow = true;
  roof.receiveShadow = true;
  scene.add(roof);

  // ── Support columns at arch spring points ──────────────────────────────
  const colH = wallH + archR * 1.05;
  const colGeo = new THREE.CylinderGeometry(0.14, 0.18, colH, 10);
  const colY = deckH + colH / 2;
  const colZs = [pz - PD / 2 + 0.3, pz + PD / 2 - 0.3]; // near N/S edges

  for (let i = 0; i <= numArches; i++) {
    const colX = px - PW / 2 + i * (2 * archR);
    for (const cz of colZs) {
      const col = new THREE.Mesh(colGeo, matPost);
      col.position.set(colX, colY, cz);
      col.castShadow = true;
      scene.add(col);
    }
  }
}