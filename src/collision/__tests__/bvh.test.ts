import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CollisionSystem } from '../bvh';

describe('CollisionSystem', () => {
  it('resolveCollision returns zero vector when bvh not built', () => {
    const system = new CollisionSystem();
    const result = system.resolveCollision(new THREE.Vector3(0, 0, 0), 0.5, 1.0);
    expect(result).toBeInstanceOf(THREE.Vector3);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.z).toBe(0);
  });

  it('build() succeeds with a simple box geometry', () => {
    const system = new CollisionSystem();
    const geometry = new THREE.BoxGeometry(10, 10, 10);
    const mesh = new THREE.Mesh(geometry);
    expect(() => system.build(mesh)).not.toThrow();
  });

  it('resolveCollision returns Vector3 after build', () => {
    const system = new CollisionSystem();
    const geometry = new THREE.BoxGeometry(10, 10, 10);
    const mesh = new THREE.Mesh(geometry);
    system.build(mesh);

    const result = system.resolveCollision(new THREE.Vector3(0, 0, 0), 0.5, 1.0);
    expect(result).toBeInstanceOf(THREE.Vector3);
  });

  it('character outside geometry gets zero correction', () => {
    const system = new CollisionSystem();
    // Small box at origin
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry);
    system.build(mesh);

    // Character far away at (100, 0, 100) — should have no collision
    const result = system.resolveCollision(new THREE.Vector3(100, 0, 100), 0.5, 1.0);
    expect(result).toBeInstanceOf(THREE.Vector3);
    // Correction should be effectively zero (far from any geometry)
    const correctionLength = result.length();
    expect(correctionLength).toBeCloseTo(0, 5);
  });
});
