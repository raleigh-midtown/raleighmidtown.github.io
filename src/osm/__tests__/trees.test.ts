import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { FeatureCollection } from 'geojson';
import { buildTrees } from '../trees';

// Minimal park polygon near the scene origin so projectLonLat yields small XZ
// offsets and the OSM-polygon scatter path produces trees.
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

function canopyMeshes(g: THREE.Group): THREE.InstancedMesh[] {
  return g.children.filter(
    (c): c is THREE.InstancedMesh =>
      c instanceof THREE.InstancedMesh &&
      (c.geometry as THREE.BufferGeometry).type === 'IcosahedronGeometry',
  );
}

function instancedMeshes(g: THREE.Group): THREE.InstancedMesh[] {
  return g.children.filter((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh);
}

function totalCanopyInstances(g: THREE.Group): number {
  return canopyMeshes(g).reduce((n, m) => n + m.count, 0);
}

describe('buildTrees', () => {
  it('returns a THREE.Group (signature preserved)', () => {
    expect(buildTrees(empty)).toBeInstanceOf(THREE.Group);
  });

  it('returns a Group without throwing on empty input', () => {
    const g = buildTrees(empty);
    // No OSM trees, but the hardcoded park-perimeter / Commons rows still run.
    expect(g).toBeInstanceOf(THREE.Group);
  });

  it('is deterministic across builds (identical instance matrices)', () => {
    const a = buildTrees(mkPark());
    const b = buildTrees(mkPark());
    const am = canopyMeshes(a);
    const bm = canopyMeshes(b);
    expect(am.length).toBe(bm.length);
    am.forEach((mesh, i) => {
      expect(Array.from(mesh.instanceMatrix.array)).toEqual(
        Array.from(bm[i].instanceMatrix.array),
      );
    });
  });

  it('renders canopies as a small number of instanced prototypes', () => {
    const g = buildTrees(mkPark());
    // At most PROTO_COUNT (4) canopy InstancedMeshes regardless of tree count.
    expect(canopyMeshes(g).length).toBeGreaterThan(0);
    expect(canopyMeshes(g).length).toBeLessThanOrEqual(4);
  });

  it('varies per-instance scale and rotation', () => {
    const g = buildTrees(mkPark());
    const mesh = canopyMeshes(g).find(m => m.count > 1);
    expect(mesh).toBeTruthy();
    const m0 = new THREE.Matrix4().fromArray(mesh!.instanceMatrix.array, 0);
    const m1 = new THREE.Matrix4().fromArray(mesh!.instanceMatrix.array, 16);
    expect(Array.from(m0.elements)).not.toEqual(Array.from(m1.elements));
  });

  it('casts shadows on every instanced mesh (canopy and trunk)', () => {
    const meshes = instancedMeshes(buildTrees(mkPark()));
    expect(meshes.length).toBeGreaterThan(0);
    expect(meshes.every(m => m.castShadow)).toBe(true);
  });

  it('keeps trunk instance count equal to total canopy instance count', () => {
    const g = buildTrees(mkPark());
    const trunk = instancedMeshes(g).find(
      m => (m.geometry as THREE.BufferGeometry).type === 'CylinderGeometry',
    );
    expect(trunk).toBeTruthy();
    expect(trunk!.count).toBe(totalCanopyInstances(g));
  });
});
