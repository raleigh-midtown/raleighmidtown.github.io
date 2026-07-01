import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeStorefront } from '../storefront';

/**
 * Shared makeStorefront factory — contract/geometry tests.
 *
 * Mirrors the Jubala regression guards (src/osm/__tests__/jubalaDecor.test.ts):
 * the factory must reproduce the Jubala assembly exactly — body BoxGeometry in
 * collision, glass panes coplanar and just in front of the body face, optional
 * blade, Group-wrapped, and the storefront front (local -Z) pointing along the
 * yaw passed in.
 */
const ROTY = -0.379;          // Park Central wall outward-normal yaw (JROT)
const TERRACE_H = 1.8;
const WIDTH = 14;
const HEIGHT = 5;
const DEPTH = 2;
const GLASS_FACE_Z = DEPTH / 2 + 0.08; // 1.08 — panes sit this far (local) in front of body centre

function build(overrides: Partial<Parameters<typeof makeStorefront>[1]> = {}) {
  const scene = new THREE.Scene();
  const body = makeStorefront(scene, {
    worldX: 100, worldZ: 100, rotY: ROTY, terraceH: TERRACE_H,
    width: WIDTH, height: HEIGHT, depth: DEPTH, bodyColor: 0xC2B8A3,
    paneCols: 4, signText: 'TEST', signTextColor: '#C8A84B',
    ...overrides,
  });
  scene.updateWorldMatrix(true, true);
  return { scene, body };
}

function isMesh(o: THREE.Object3D): o is THREE.Mesh {
  return o instanceof THREE.Mesh;
}

function isGlassPane(o: THREE.Object3D): o is THREE.Mesh {
  if (!isMesh(o)) return false;
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

function isBlade(o: THREE.Object3D): o is THREE.Mesh {
  if (!isMesh(o)) return false;
  if (!(o.geometry instanceof THREE.PlaneGeometry)) return false;
  const mat = o.material as THREE.MeshBasicMaterial;
  return mat instanceof THREE.MeshBasicMaterial && mat.side === THREE.DoubleSide;
}

function collect<T extends THREE.Object3D>(scene: THREE.Scene, pred: (o: THREE.Object3D) => boolean): T[] {
  const out: T[] = [];
  scene.traverse((o) => { if (pred(o)) out.push(o as T); });
  return out;
}

describe('makeStorefront — collision contract (R4/R5)', () => {
  it('returns a BoxGeometry body that casts + receives shadows', () => {
    const { body } = build();
    expect(body).toBeInstanceOf(THREE.Mesh);
    expect(body.geometry instanceof THREE.BoxGeometry).toBe(true);
    expect(body.castShadow).toBe(true);
    expect(body.receiveShadow).toBe(true);
  });

  it('glass panes and blade are NOT the returned body (R5)', () => {
    const { scene, body } = build({ blade: { text: 'X', bg: '#CC1111', fg: '#FFFFFF' } });
    const panes = collect<THREE.Mesh>(scene, isGlassPane);
    const blades = collect<THREE.Mesh>(scene, isBlade);
    expect(panes.length).toBe(4);
    expect(blades.length).toBe(1);
    for (const p of panes) expect(p).not.toBe(body);
    for (const b of blades) expect(b).not.toBe(body);
  });
});

describe('makeStorefront — Group convention (R7)', () => {
  it('body and glass panes are children of a Group that is a direct child of the scene', () => {
    const { scene, body } = build();
    expect(body.parent).toBeInstanceOf(THREE.Group);
    const group = body.parent as THREE.Group;
    expect(group.parent).toBe(scene);
    const panes = collect<THREE.Mesh>(scene, isGlassPane);
    expect(panes.every((p) => p.parent instanceof THREE.Group)).toBe(true);
  });
});

describe('makeStorefront — glass wall coplanarity (R2/R6)', () => {
  it('all glass panes are coplanar and just in front of the body face', () => {
    const { scene, body } = build();
    const panes = collect<THREE.Mesh>(scene, isGlassPane);
    expect(panes.length).toBe(4);

    const bodyWorld = new THREE.Vector3();
    body.getWorldPosition(bodyWorld);
    const frontNormal = new THREE.Vector3(0, 0, -1).applyQuaternion(
      body.getWorldQuaternion(new THREE.Quaternion()),
    );
    const bodyHalfDepth = DEPTH / 2;

    const paneWorld = new THREE.Vector3();
    const projections = panes.map((p) => {
      p.getWorldPosition(paneWorld);
      return paneWorld.clone().sub(bodyWorld).dot(frontNormal);
    });

    const spread = Math.max(...projections) - Math.min(...projections);
    expect(spread).toBeLessThan(0.05);

    for (const d of projections) expect(d).toBeGreaterThan(bodyHalfDepth);
    for (const d of projections) expect(d).toBeCloseTo(GLASS_FACE_Z, 1);
  });
});

describe('makeStorefront — blade (R3)', () => {
  it('with blade: exactly one DoubleSide blade plane is present', () => {
    const { scene } = build({ blade: { text: 'COFFEE', bg: '#CC1111', fg: '#FFFFFF' } });
    const blades = collect<THREE.Mesh>(scene, isBlade);
    expect(blades.length).toBe(1);
    const mat = blades[0].material as THREE.MeshBasicMaterial;
    expect(mat.side).toBe(THREE.DoubleSide);
    const tex = mat.map as THREE.CanvasTexture;
    expect(tex).toBeInstanceOf(THREE.CanvasTexture);
    const img = tex.image as HTMLCanvasElement;
    expect(img.width).toBe(64);
    expect(img.height).toBe(256);
  });

  it('without blade: no blade plane is present', () => {
    const { scene } = build();
    const blades = collect<THREE.Mesh>(scene, isBlade);
    expect(blades.length).toBe(0);
  });
});

describe('makeStorefront — orientation (yaw passed in)', () => {
  function bearingFromNorth(x: number, z: number): number {
    return (Math.atan2(x, -z) * 180) / Math.PI;
  }

  it('storefront front (local -Z) faces the yaw passed in (~21.7° E of N for rotY=-0.379)', () => {
    const { body } = build();
    const front = new THREE.Vector3(0, 0, -1).applyQuaternion(
      body.getWorldQuaternion(new THREE.Quaternion()),
    );
    const bearing = bearingFromNorth(front.x, front.z);
    expect(bearing).toBeCloseTo(21.7, 0);
    expect(bearing).toBeGreaterThan(0); // east of north, not the +0.379 NW mirror
  });

  it('storefront width axis (local +X) runs parallel to the wall (~21.7° atan2(z,x))', () => {
    const { body } = build();
    const widthAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(
      body.getWorldQuaternion(new THREE.Quaternion()),
    );
    const angleDeg = (Math.atan2(widthAxis.z, widthAxis.x) * 180) / Math.PI;
    const normalized = ((angleDeg % 180) + 180) % 180;
    const wallNorm = ((21.7 % 180) + 180) % 180;
    const diff = Math.min(Math.abs(normalized - wallNorm), 180 - Math.abs(normalized - wallNorm));
    expect(diff).toBeLessThan(1.0);
  });
});

describe('makeStorefront — pane count is parametrized', () => {
  it('paneCols=6 produces exactly 6 glass panes', () => {
    const { scene } = build({ paneCols: 6 });
    const panes = collect<THREE.Mesh>(scene, isGlassPane);
    expect(panes.length).toBe(6);
  });
});