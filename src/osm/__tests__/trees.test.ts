import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { FeatureCollection } from 'geojson';
import { buildTrees, stAlbansGreenspaceEdgeRows, midtownParkRows } from '../trees';
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

describe('midtownParkRows', () => {
  // Midtown Park lawn strip is z[225,236] — between Midtown Green (south face
  // z≈225) and Park Central (north face z≈236). The two long-edge rows line it.
  it('is sparse: ~7 trees per long row, not the old dense ~78', () => {
    const pts = midtownParkRows();
    // 14 expected (7 north + 7 south). Range allows modest spacing tuning but
    // fails hard if spacing is tightened (→ ~78) or short-edge rows are re-added.
    expect(pts.length).toBeGreaterThanOrEqual(10);
    expect(pts.length).toBeLessThanOrEqual(16);
  });

  it('lines only the two long edges within the lawn strip (no short-end rows)', () => {
    const pts = midtownParkRows();
    // Every tree sits in the lawn strip z[225,236]. The old east-edge short row
    // ran to z=268 — this rejects any such overflow.
    for (const [, z] of pts) {
      expect(z).toBeGreaterThanOrEqual(225);
      expect(z).toBeLessThanOrEqual(236);
    }
    // Both long rows present: a north row (z<230) and a south row (z>=230).
    const north = pts.filter(([, z]) => z < 230).length;
    const south = pts.filter(([, z]) => z >= 230).length;
    expect(north).toBeGreaterThanOrEqual(5);
    expect(south).toBeGreaterThanOrEqual(5);
    expect(north + south).toBe(pts.length);
    // Rows span the long way across the park (x[241,346]); last tree lands
    // near t=96 of the 105-unit row, so max x ≈ 337.
    const xs = pts.map(p => p[0]);
    expect(Math.min(...xs)).toBeLessThanOrEqual(245);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(330);
  });

  it('is deterministic', () => {
    expect(midtownParkRows()).toEqual(midtownParkRows());
  });
});
