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

  it('raycastDown from above the ground plane returns origin.y', () => {
    const system = new CollisionSystem();
    expect(system.raycastDown(new THREE.Vector3(0, 5, 0), 10)).toBe(5);
  });

  it('raycastDown returns null when ground plane is out of range', () => {
    const system = new CollisionSystem();
    expect(system.raycastDown(new THREE.Vector3(0, 5, 0), 2)).toBeNull();
  });

  it('raycastDown returns null below the ground plane', () => {
    const system = new CollisionSystem();
    expect(system.raycastDown(new THREE.Vector3(0, -1, 0), 5)).toBeNull();
  });

  it('raycastDown hits a building roof before the implicit plane', () => {
    const system = new CollisionSystem();
    const roof = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 10));
    roof.position.set(0, 5.5, 0);
    roof.updateMatrixWorld(true);
    system.build(roof);
    expect(system.raycastDown(new THREE.Vector3(0, 20, 0), 50)).toBeCloseTo(14, 1);
  });

  it('raycastUp returns null in open sky', () => {
    const system = new CollisionSystem();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    box.position.set(100, 100, 100);
    box.updateMatrixWorld(true);
    system.build(box);
    expect(system.raycastUp(new THREE.Vector3(0, 0, 0), 50)).toBeNull();
  });

  it('raycastUp hits geometry overhead', () => {
    const system = new CollisionSystem();
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 10));
    ceiling.position.set(0, 10, 0);
    ceiling.updateMatrixWorld(true);
    system.build(ceiling);
    expect(system.raycastUp(new THREE.Vector3(0, 0, 0), 20)).toBeCloseTo(9.5, 1);
  });
});
