import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { FeatureCollection } from 'geojson';
import { buildTrees } from '../trees';
import type { TreePrototype } from '../../scene/treeFactory';

// Stub prototypes so buildTrees is testable without running ez-tree (needs DOM).
function stubProtos(n: number): TreePrototype[] {
  return Array.from({ length: n }, () => ({
    branchGeo: new THREE.CylinderGeometry(0.2, 0.3, 4, 5),
    branchMat: new THREE.MeshPhongMaterial(),
    leafGeo: new THREE.PlaneGeometry(1, 1),
    leafMat: new THREE.MeshPhongMaterial({ alphaTest: 0.5 }),
    normScale: 1,
  }));
}

function mkPark(): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { leisure: 'park', name: 'Some Park' },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-78.6402, 35.8383],
            [-78.6398, 35.8383],
            [-78.6398, 35.8387],
            [-78.6402, 35.8387],
            [-78.6402, 35.8383],
          ]],
        },
      },
    ],
  };
}

const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };

function instanced(g: THREE.Group): THREE.InstancedMesh[] {
  const out: THREE.InstancedMesh[] = [];
  g.traverse((c) => { if (c instanceof THREE.InstancedMesh) out.push(c); });
  return out;
}

function branchTotal(g: THREE.Group): number {
  return instanced(g)
    .filter((m) => (m.geometry as THREE.BufferGeometry).type === 'CylinderGeometry')
    .reduce((n, m) => n + m.count, 0);
}

function leafTotal(g: THREE.Group): number {
  return instanced(g)
    .filter((m) => (m.geometry as THREE.BufferGeometry).type === 'PlaneGeometry')
    .reduce((n, m) => n + m.count, 0);
}

describe('buildTrees', () => {
  it('returns a THREE.Group (signature preserved)', () => {
    expect(buildTrees(empty, stubProtos(4))).toBeInstanceOf(THREE.Group);
    expect(buildTrees(mkPark(), stubProtos(4))).toBeInstanceOf(THREE.Group);
  });

  it('instances one tree per placed position (branch count == leaf count > 0)', () => {
    const g = buildTrees(mkPark(), stubProtos(5));
    const b = branchTotal(g);
    expect(b).toBeGreaterThan(0);
    expect(leafTotal(g)).toBe(b);
  });

  it('preserves placement deterministically across builds', () => {
    const a = branchTotal(buildTrees(mkPark(), stubProtos(5)));
    const b = branchTotal(buildTrees(mkPark(), stubProtos(5)));
    expect(a).toBe(b);
  });

  it('casts shadows on every instanced mesh', () => {
    const meshes = instanced(buildTrees(mkPark(), stubProtos(4)));
    expect(meshes.length).toBeGreaterThan(0);
    expect(meshes.every((m) => m.castShadow)).toBe(true);
  });

  it('uses a small instanced prototype set, not per-tree geometry', () => {
    const g = buildTrees(mkPark(), stubProtos(4));
    const branchMeshes = instanced(g).filter(
      (m) => (m.geometry as THREE.BufferGeometry).type === 'CylinderGeometry',
    );
    expect(branchMeshes.length).toBeLessThanOrEqual(4);
  });
});
