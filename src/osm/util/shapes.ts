import * as THREE from 'three';
import { projectLonLat } from '../project.js';

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

export function ringsToGeometry(rings: number[][][], y: number): THREE.BufferGeometry | null {
  if (rings[0].length < 4) return null; // <4 because closed rings repeat first vertex
  try {
    const shape = ringToShape(rings[0]);
    for (let i = 1; i < rings.length; i++) {
      shape.holes.push(ringToShape(rings[i]) as unknown as THREE.Path);
    }
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, y, 0);
    return geo;
  } catch {
    return null;
  }
}
