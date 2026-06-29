import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { FeatureCollection } from 'geojson';
import { buildTrees, stAlbansGreenspaceEdgeRows } from '../trees';
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

// Park near scene center — projects to z≈+20..+50, outside St Albans corridor.
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

// Park polygon inside the St Albans corridor.
// Vertices project (via proj4 UTM17N) to approx:
//   lon=-78.6388 → x≈110   lon=-78.6373 → x≈240
//   lat=35.8401  → z≈-175  lat=35.8399  → z≈-155
// Inner (road-facing) edge runs from (110,-175) to (240,-175) — south of road center
// which is at z≈-190 at x=175.  dist≈15 < 60 ✓.
function mkStAlbansCorridor(): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { leisure: 'park', name: 'St Albans Greenspace' },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-78.638779, 35.839893],  // SW outer
            [-78.637336, 35.839893],  // SE outer
            [-78.637336, 35.840072],  // NE inner  ← inner boundary
            [-78.638779, 35.840072],  // NW inner  ← inner boundary
            [-78.638779, 35.839893],  // close
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

  it('casts branch shadows (leaf shadows disabled for perf)', () => {
    const g = buildTrees(mkPark(), stubProtos(4));
    const branches = instanced(g).filter(
      (m) => (m.geometry as THREE.BufferGeometry).type === 'CylinderGeometry',
    );
    expect(branches.length).toBeGreaterThan(0);
    expect(branches.every((m) => m.castShadow)).toBe(true);
  });

  it('uses a small instanced prototype set, not per-tree geometry', () => {
    const g = buildTrees(mkPark(), stubProtos(4));
    const branchMeshes = instanced(g).filter(
      (m) => (m.geometry as THREE.BufferGeometry).type === 'CylinderGeometry',
    );
    expect(branchMeshes.length).toBeLessThanOrEqual(4);
  });

  it('still produces trees when no greenspace is in the St Albans corridor (fallback)', () => {
    // mkPark() is outside the corridor — buildTrees must fall back to fixed rows.
    const g = buildTrees(mkPark(), stubProtos(4));
    expect(branchTotal(g)).toBeGreaterThan(0);
  });
});

describe('stAlbansGreenspaceEdgeRows', () => {
  it('returns empty array when no greenspace feature is in the corridor', () => {
    expect(stAlbansGreenspaceEdgeRows(empty, 8, 511)).toHaveLength(0);
    expect(stAlbansGreenspaceEdgeRows(mkPark(), 8, 511)).toHaveLength(0);
  });

  it('returns positions along the inner polygon boundary when a corridor feature is present', () => {
    const pts = stAlbansGreenspaceEdgeRows(mkStAlbansCorridor(), 8, 511);
    expect(pts.length).toBeGreaterThan(5);
    // Inner boundary edge projects to z≈-175. Trees placed along it should cluster there.
    // Accept generous tolerance for proj4 approximation errors and 0.8-unit jitter.
    const nearInner = pts.filter(([, z]) => z >= -180 && z <= -170);
    expect(nearInner.length).toBeGreaterThan(0);
  });

  it('is deterministic for the same inputs', () => {
    const a = stAlbansGreenspaceEdgeRows(mkStAlbansCorridor(), 8, 511);
    const b = stAlbansGreenspaceEdgeRows(mkStAlbansCorridor(), 8, 511);
    expect(a).toEqual(b);
  });

  it('ignores non-greenspace features in the corridor', () => {
    const geojson: FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { building: 'yes' },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-78.638779, 35.839893],
            [-78.637336, 35.839893],
            [-78.637336, 35.840072],
            [-78.638779, 35.840072],
            [-78.638779, 35.839893],
          ]],
        },
      }],
    };
    expect(stAlbansGreenspaceEdgeRows(geojson, 8, 511)).toHaveLength(0);
  });
});
