import * as THREE from 'three';

// 4-step toon gradient: deep shadow → shadow → mid → highlight
export function makeToonGradient(): THREE.DataTexture {
  const colors = new Uint8Array([
    40, 35, 30,     // deep shadow
    110, 95, 80,    // shadow
    200, 185, 165,  // mid
    255, 252, 245,  // highlight
  ]);
  const tex = new THREE.DataTexture(colors, 4, 1, THREE.RGBFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

const _toonGradient = makeToonGradient();

export function toonMat(color: number): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: _toonGradient });
}

/**
 * Adds a dark back-face outline mesh as a child of the given mesh.
 * This is the classic anime outline trick — no post-processing needed.
 */
export function addOutline(
  mesh: THREE.Mesh,
  thickness = 0.015,
  color = 0x1a1a2e,
): THREE.Mesh {
  const outlineMat = new THREE.MeshBasicMaterial({
    color,
    side: THREE.BackSide,
  });
  const outline = new THREE.Mesh(mesh.geometry, outlineMat);
  outline.scale.setScalar(1 + thickness);
  mesh.add(outline);
  return outline;
}

/**
 * Wrap a THREE.Group's Mesh children with toon materials and outlines.
 * Colors: 0=residential warm cream, 1=commercial cool blue-gray, 2=unknown warm gray
 */
export function applyToonToBuildings(group: THREE.Group): void {
  const palette = [0xf2e8d5, 0xadc4cc, 0xd4c4b0]; // cream, steel-teal, warm gray
  let typeIdx = 0;
  for (const child of group.children) {
    if (!(child instanceof THREE.Mesh)) continue;
    const color = palette[typeIdx % palette.length];
    child.material = toonMat(color);
    addOutline(child, 0.008, 0x1a1a2e);
    typeIdx++;
  }
}
