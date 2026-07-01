import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildNorthWallStorefronts } from '../northWallStorefronts';

/**
 * North-wall storefronts — placement/contract tests.
 *
 * Asserts against the REFERENCE WALL (not the module's own constants), matching
 * the posture of parkCentralTerrace.test.ts and jubalaDecor.test.ts:
 *   Wall: B=(204.9,236.4) west → A=(323.9,283.8) NE corner, length ≈ 128.1 m,
 *   along-wall unit u=(0.9290,0.3700), outward normal N 21.7° E, JROT ≈ -0.379.
 *   Jubala sits at s≈93 (width 14 → s∈[86,100]); flat deck east of Jubala is
 *   s∈[100,128.1] (≈28 m).
 */
const WALL_WEST = { x: 204.9, z: 236.4 };
const WALL_EAST = { x: 323.9, z: 283.8 };
const WALL_DX = WALL_EAST.x - WALL_WEST.x;
const WALL_DZ = WALL_EAST.z - WALL_WEST.z;
const WALL_LEN = Math.hypot(WALL_DX, WALL_DZ);
const WALL_UX = WALL_DX / WALL_LEN;
const WALL_UZ = WALL_DZ / WALL_LEN;
const TERRACE_H = 1.8;
const WALL_BEARING_DEG = (Math.atan2(WALL_UZ, WALL_UX) * 180) / Math.PI; // along-edge atan2(z,x) ≈ 21.7

// Tenant widths in west-to-east order (must mirror northWallStorefronts.ts).
const WIDTHS = [14, 10, 6, 12];

function build() {
  const scene = new THREE.Scene();
  const meshes = buildNorthWallStorefronts(scene);
  scene.updateWorldMatrix(true, true);
  return { scene, meshes };
}

function bearingFromNorth(x: number, z: number): number {
  return (Math.atan2(x, -z) * 180) / Math.PI;
}

/** Along-wall projection s of a world point (metres from the wall's west end). */
function alongS(wx: number, wz: number): number {
  return (wx - WALL_WEST.x) * WALL_UX + (wz - WALL_WEST.z) * WALL_UZ;
}

function isGlassPane(o: THREE.Object3D): o is THREE.Mesh {
  if (!(o instanceof THREE.Mesh)) return false;
  if (!(o.geometry instanceof THREE.PlaneGeometry)) return false;
  const mat = o.material as THREE.MeshStandardMaterial;
  return (
    mat instanceof THREE.MeshStandardMaterial &&
    mat.transparent === true &&
    mat.opacity > 0.25 &&
    mat.opacity < 0.45 &&
    mat.side === THREE.DoubleSide
  );
}

describe('buildNorthWallStorefronts — collision contract (R4/R5/R8)', () => {
  it('returns exactly 4 BoxGeometry bodies that cast shadows', () => {
    const { meshes } = build();
    expect(meshes).toHaveLength(4);
    for (const m of meshes) {
      expect(m.geometry instanceof THREE.BoxGeometry).toBe(true);
      expect(m.castShadow).toBe(true);
    }
  });

  it('glass panes across all four storefronts are NOT in the returned set (R5)', () => {
    const { scene, meshes } = build();
    const returned = new Set(meshes.map((m) => m));
    const panes: THREE.Mesh[] = [];
    scene.traverse((o) => { if (isGlassPane(o)) panes.push(o); });
    expect(panes.length).toBe(4 * 4); // 4 panes per storefront
    for (const p of panes) expect(returned.has(p)).toBe(false);
  });
});

describe('buildNorthWallStorefronts — Group convention (R7)', () => {
  it('each body is a child of a Group that is a direct child of the scene', () => {
    const { scene, meshes } = build();
    for (const m of meshes) {
      expect(m.parent).toBeInstanceOf(THREE.Group);
      const group = m.parent as THREE.Group;
      expect(group.parent).toBe(scene);
    }
  });
});

describe('buildNorthWallStorefronts — orientation (shared JROT)', () => {
  it('each storefront front (local -Z) faces the wall outward normal (~21.7° E of N)', () => {
    const { meshes } = build();
    for (const m of meshes) {
      const front = new THREE.Vector3(0, 0, -1).applyQuaternion(
        m.getWorldQuaternion(new THREE.Quaternion()),
      );
      const bearing = bearingFromNorth(front.x, front.z);
      expect(bearing).toBeCloseTo(21.7, 0);
      expect(bearing).toBeGreaterThan(0); // east of north, not the NW mirror
    }
  });

  it('each storefront width axis (local +X) runs parallel to the wall edge', () => {
    const { meshes } = build();
    for (const m of meshes) {
      const widthAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(
        m.getWorldQuaternion(new THREE.Quaternion()),
      );
      const angleDeg = (Math.atan2(widthAxis.z, widthAxis.x) * 180) / Math.PI;
      const normalized = ((angleDeg % 180) + 180) % 180;
      const wallNorm = ((WALL_BEARING_DEG % 180) + 180) % 180;
      const diff = Math.min(
        Math.abs(normalized - wallNorm),
        180 - Math.abs(normalized - wallNorm),
      );
      expect(diff).toBeLessThan(1.0);
    }
  });
});

describe('buildNorthWallStorefronts — placement along the wall (R9/R10/R11)', () => {
  it('returns bodies in west-to-east order with the expected along-wall s', () => {
    const { meshes } = build();
    const sValues = meshes.map((m) => {
      const p = new THREE.Vector3();
      m.getWorldPosition(p);
      return alongS(p.x, p.z);
    });
    // west-to-east (strictly increasing)
    for (let i = 1; i < sValues.length; i++) {
      expect(sValues[i]).toBeGreaterThan(sValues[i - 1]);
    }
    // furniture rental west of Jubala (s < 86)
    expect(sValues[0]).toBeLessThan(86);
    // leasing + ice cream east of Jubala, west of One Medical
    expect(sValues[1]).toBeGreaterThanOrEqual(100);
    expect(sValues[1]).toBeLessThan(119);
    expect(sValues[2]).toBeGreaterThanOrEqual(100);
    expect(sValues[2]).toBeLessThan(119);
    // One Medical at the NE corner (s ∈ [116,128]) and easternmost
    expect(sValues[3]).toBeGreaterThanOrEqual(116);
    expect(sValues[3]).toBeLessThanOrEqual(128);
  });

  it('no two body centres are closer than (wi+wj)/2 − 0.5 (no overlap)', () => {
    const { meshes } = build();
    const sValues = meshes.map((m) => {
      const p = new THREE.Vector3();
      m.getWorldPosition(p);
      return alongS(p.x, p.z);
    });
    for (let i = 0; i < sValues.length; i++) {
      for (let j = i + 1; j < sValues.length; j++) {
        const minGap = (WIDTHS[i] + WIDTHS[j]) / 2 - 0.5;
        expect(Math.abs(sValues[i] - sValues[j])).toBeGreaterThanOrEqual(minGap);
      }
    }
  });

  it('One Medical does not cross the sheer east edge (s ≤ 128.1 + half-width)', () => {
    const { meshes } = build();
    const last = meshes[meshes.length - 1];
    const p = new THREE.Vector3();
    last.getWorldPosition(p);
    const s = alongS(p.x, p.z);
    expect(s + WIDTHS[3] / 2).toBeLessThanOrEqual(128.1 + 0.01);
  });
});

describe('buildNorthWallStorefronts — terrace seating', () => {
  it('all four bodies sit on the terrace (body base world y ≈ TERRACE_H)', () => {
    const { meshes } = build();
    for (const m of meshes) {
      const geo = m.geometry as THREE.BoxGeometry;
      const height = geo.parameters.height;
      const p = new THREE.Vector3();
      m.getWorldPosition(p);
      const baseY = p.y - height / 2;
      expect(baseY).toBeCloseTo(TERRACE_H, 1);
    }
  });
});