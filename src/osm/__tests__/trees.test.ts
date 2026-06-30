import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { FeatureCollection } from 'geojson';
import { buildTrees, stAlbansGreenspaceEdgeRows, parkLongEdgeTreeRows } from '../trees';
import { pointInRing, type BBox, type Pt } from '../util/geom';
import type { TreePrototype } from '../../scene/treeFactory';

// Distance from point (px,pz) to segment a→b.
function distToSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const L2 = dx * dx + dz * dz;
  if (L2 === 0) return Math.hypot(px - ax, pz - az);
  let t = ((px - ax) * dx + (pz - az) * dz) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

// Rectangular building box (closed ring + bbox) for isInsideAnyBuilding tests.
function mkBox(minX: number, maxX: number, minZ: number, maxZ: number): BBox {
  const ring: Pt[] = [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ], [minX, minZ]];
  return { minX, maxX, minZ, maxZ, ring };
}

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

describe('parkLongEdgeTreeRows', () => {
  // Parallelogram park in scene meters with DIAGONAL long edges (~92) + two
  // short edges (~38). Mirrors the real Midtown Park shape: the long edges run
  // east-to-west but slope in z, so a correct row must follow the diagonal, not
  // hold a constant z.
  const A: Pt = [340, 234], B: Pt = [255, 201], C: Pt = [241, 236], D: Pt = [327, 270];
  const park: Pt[] = [A, B, C, D, A];
  const longEdges = [[A, B], [C, D]];
  const shortEdges = [[B, C], [D, A]];

  it('places sparse trees along the two diagonal long edges, inside the park', () => {
    const pts = parkLongEdgeTreeRows(park, [], 16, 3);
    // 5 per long edge (floor(92/16)=5), none dropped → 10.
    expect(pts.length).toBe(10);
    // Every tree sits inside the park polygon (inward offset + centered placement).
    for (const [x, z] of pts) expect(pointInRing(x, z, park)).toBe(true);
    // Every tree is near a long edge and well clear of the short-edge midpoints
    // (i.e. trees line the long sides, not the short ends or the lawn interior).
    const shortMids = shortEdges.map(e => [(e[0][0] + e[1][0]) / 2, (e[0][1] + e[1][1]) / 2] as [number, number]);
    for (const [x, z] of pts) {
      const dLong = Math.min(...longEdges.map(e => distToSeg(x, z, e[0][0], e[0][1], e[1][0], e[1][1])));
      const dShortMid = Math.min(...shortMids.map(m => Math.hypot(x - m[0], z - m[1])));
      expect(dLong).toBeLessThan(6);
      expect(dShortMid).toBeGreaterThan(6);
    }
    // The rows FOLLOW the diagonal: each long edge's trees span >20 in z
    // (a horizontal row would span ~0). Both edges get trees.
    const ab = pts.filter(p => distToSeg(p[0], p[1], A[0], A[1], B[0], B[1]) < distToSeg(p[0], p[1], C[0], C[1], D[0], D[1]));
    const cd = pts.filter(p => distToSeg(p[0], p[1], C[0], C[1], D[0], D[1]) <= distToSeg(p[0], p[1], A[0], A[1], B[0], B[1]));
    expect(ab.length).toBeGreaterThanOrEqual(4);
    expect(cd.length).toBeGreaterThanOrEqual(4);
    const zSpan = (xs: Pt[]) => Math.max(...xs.map(p => p[1])) - Math.min(...xs.map(p => p[1]));
    expect(zSpan(ab)).toBeGreaterThan(20);
    expect(zSpan(cd)).toBeGreaterThan(20);
  });

  it('drops trees that fall inside a building footprint (benches-style guard)', () => {
    // Box overlapping the B-end of long edge A-B catches the tree nearest B.
    const boxes = [mkBox(255, 275, 200, 215)];
    const pts = parkLongEdgeTreeRows(park, boxes, 16, 3);
    // Fewer than the unobstructed 10, and no tree remains inside the box.
    expect(pts.length).toBeLessThan(10);
    for (const [x, z] of pts) {
      expect(!(x >= 255 && x <= 275 && z >= 200 && z <= 215)).toBe(true);
    }
    // The opposite long edge is unaffected.
    expect(pts.length).toBeGreaterThanOrEqual(8);
  });

  it('is deterministic', () => {
    expect(parkLongEdgeTreeRows(park, [], 16, 3)).toEqual(parkLongEdgeTreeRows(park, [], 16, 3));
  });
});
