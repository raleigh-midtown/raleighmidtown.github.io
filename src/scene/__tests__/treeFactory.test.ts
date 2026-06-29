import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildTreeInstances, type TreePrototype } from '../treeFactory';

// Stub prototypes so the instancing logic is testable without running ez-tree,
// which needs a DOM (texture/image pipeline) to generate().
function stubProto(): TreePrototype {
  return {
    branchGeo: new THREE.CylinderGeometry(0.2, 0.3, 4, 5),
    branchMat: new THREE.MeshPhongMaterial(),
    leafGeo: new THREE.PlaneGeometry(1, 1),
    leafMat: new THREE.MeshPhongMaterial({ alphaTest: 0.5, map: new THREE.Texture() }),
    normScale: 1,
  };
}

function protos(n: number): TreePrototype[] {
  return Array.from({ length: n }, stubProto);
}

function positions(n: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => [i * 3, (i % 5) * 2] as [number, number]);
}

function branchMeshes(g: THREE.Group): THREE.InstancedMesh[] {
  return g.children.filter(
    (c): c is THREE.InstancedMesh =>
      c instanceof THREE.InstancedMesh &&
      (c.geometry as THREE.BufferGeometry).type === 'CylinderGeometry',
  );
}

function leafMeshes(g: THREE.Group): THREE.InstancedMesh[] {
  return g.children.filter(
    (c): c is THREE.InstancedMesh =>
      c instanceof THREE.InstancedMesh &&
      (c.geometry as THREE.BufferGeometry).type === 'PlaneGeometry',
  );
}

function allInstanced(g: THREE.Group): THREE.InstancedMesh[] {
  return g.children.filter((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh);
}

describe('buildTreeInstances', () => {
  it('totals branch instances equal to position count', () => {
    const g = buildTreeInstances(protos(4), positions(40), 1);
    const total = branchMeshes(g).reduce((n, m) => n + m.count, 0);
    expect(total).toBe(40);
  });

  it('emits at most one branch + one leaf InstancedMesh per prototype', () => {
    const g = buildTreeInstances(protos(4), positions(40), 1);
    expect(branchMeshes(g).length).toBeLessThanOrEqual(4);
    expect(leafMeshes(g).length).toBe(branchMeshes(g).length);
  });

  it('is deterministic for the same seed', () => {
    const a = buildTreeInstances(protos(3), positions(30), 77777);
    const b = buildTreeInstances(protos(3), positions(30), 77777);
    const am = branchMeshes(a);
    const bm = branchMeshes(b);
    expect(am.length).toBe(bm.length);
    am.forEach((mesh, i) => {
      expect(Array.from(mesh.instanceMatrix.array)).toEqual(Array.from(bm[i].instanceMatrix.array));
    });
  });

  it('varies per-instance scale/rotation and leaf tint', () => {
    const g = buildTreeInstances(protos(2), positions(30), 5);
    const branch = branchMeshes(g).find((m) => m.count > 1)!;
    const m0 = new THREE.Matrix4().fromArray(branch.instanceMatrix.array, 0);
    const m1 = new THREE.Matrix4().fromArray(branch.instanceMatrix.array, 16);
    expect(Array.from(m0.elements)).not.toEqual(Array.from(m1.elements));

    const leaf = leafMeshes(g).find((m) => m.count > 1 && m.instanceColor)!;
    expect(leaf.instanceColor).toBeTruthy();
    const c0 = [leaf.instanceColor!.array[0], leaf.instanceColor!.array[1], leaf.instanceColor!.array[2]];
    let varies = false;
    for (let i = 1; i < leaf.count; i++) {
      const c = [leaf.instanceColor!.array[i * 3], leaf.instanceColor!.array[i * 3 + 1], leaf.instanceColor!.array[i * 3 + 2]];
      if (c[0] !== c0[0] || c[1] !== c0[1] || c[2] !== c0[2]) { varies = true; break; }
    }
    expect(varies).toBe(true);
  });

  it('casts branch shadows but not leaf shadows (perf)', () => {
    const g = buildTreeInstances(protos(3), positions(20), 1);
    expect(branchMeshes(g).length).toBeGreaterThan(0);
    expect(branchMeshes(g).every((m) => m.castShadow)).toBe(true);
    expect(leafMeshes(g).every((m) => m.castShadow === false)).toBe(true);
  });

  it('normScale scales instance matrices', () => {
    const big = protos(1);
    big[0].normScale = 2;
    const g = buildTreeInstances(big, [[0, 0]], 1);
    const m = new THREE.Matrix4().fromArray(branchMeshes(g)[0].instanceMatrix.array, 0);
    const scale = new THREE.Vector3();
    m.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    // normScale 2 * per-instance [0.85,1.25] → well above 1
    expect(scale.x).toBeGreaterThan(1.5);
  });

  it('returns an empty group for empty inputs', () => {
    expect(buildTreeInstances([], positions(5), 1).children).toHaveLength(0);
    expect(buildTreeInstances(protos(2), [], 1).children).toHaveLength(0);
  });
});
