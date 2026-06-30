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

  it('build() merges mixed-attribute geometries (buildingType + plain) into a working BVH', () => {
    // Building meshes carry a buildingType Int32Array (extrude.ts) that hand-placed
    // props lack. Without stripping it, mergeGeometries(useGroups=false) returns
    // null and the BVH is never built — raycastDown would fall back to the ground
    // plane (distance 20), not the roof (distance 14).
    const system = new CollisionSystem();
    const roof = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 10));
    roof.position.set(0, 5.5, 0);
    roof.updateMatrixWorld(true);
    const arr = new Int32Array(roof.geometry.attributes.position.count).fill(1);
    roof.geometry.setAttribute('buildingType', new THREE.BufferAttribute(arr, 1));
    const prop = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2)); // plain, no buildingType
    prop.position.set(50, 1, 50); // far from the raycast so it does not shadow the roof
    prop.updateMatrixWorld(true);
    system.build(roof, prop);
    expect(system.raycastDown(new THREE.Vector3(0, 20, 0), 50)).toBeCloseTo(14, 1);
  });

  it('build() with a single buildingType-tagged geometry still works (regression)', () => {
    const system = new CollisionSystem();
    const roof = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 10));
    roof.position.set(0, 5.5, 0);
    roof.updateMatrixWorld(true);
    const arr = new Int32Array(roof.geometry.attributes.position.count).fill(1);
    roof.geometry.setAttribute('buildingType', new THREE.BufferAttribute(arr, 1));
    system.build(roof);
    expect(system.raycastDown(new THREE.Vector3(0, 20, 0), 50)).toBeCloseTo(14, 1);
  });
});
