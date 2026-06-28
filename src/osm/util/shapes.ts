import * as THREE from 'three';
import { projectLonLat } from '../project.js';

/** Build a closed THREE.Shape from a ring of lon/lat coords (projected to scene metres). */
export function ringToShape(ring: number[][]): THREE.Shape {
  const shape = new THREE.Shape();
  const [x0, z0] = projectLonLat(ring[0][0], ring[0][1]);
  shape.moveTo(x0, -z0);
  for (let i = 1; i < ring.length; i++) {
    const [x, z] = projectLonLat(ring[i][0], ring[i][1]);
    shape.lineTo(x, -z);
  }
  shape.closePath();
  return shape;
}

/** Build a closed THREE.Shape from a ring of already-projected scene-metre XZ points. */
export function sceneRingToShape(points: number[][]): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], -points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], -points[i][1]);
  shape.closePath();
  return shape;
}

/**
 * Finish a shape into a flat ground geometry at height `y`. ShapeGeometry stores
 * the raw shape-space coordinates as UVs (world metres, not [0,1]), so a texture
 * with a metre-based repeat tiles correctly across the surface regardless of its
 * size. Shared by lon/lat polygon rendering and scene-space aprons.
 */
export function shapeToGroundGeometry(shape: THREE.Shape, y: number): THREE.BufferGeometry {
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y, 0);
  return geo;
}

export function ringsToGeometry(rings: number[][][], y: number): THREE.BufferGeometry | null {
  if (rings[0].length < 4) return null; // <4 because closed rings repeat first vertex
  try {
    const shape = ringToShape(rings[0]);
    for (let i = 1; i < rings.length; i++) {
      shape.holes.push(ringToShape(rings[i]) as unknown as THREE.Path);
    }
    return shapeToGroundGeometry(shape, y);
  } catch {
    return null;
  }
}
