import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildJubalaDecor } from '../jubalaDecor';

/**
 * Jubala Coffee storefront — geometry/contract tests.
 *
 * The plan (docs/plans/2026-06-29-003-...) defines units U1-U5. Two of these
 * guard the placement convention that the module originally violated:
 *
 *   - The storefront must be wrapped in a THREE.Group (plan R7 / AGENTS.md
 *     "Hand-placed scene props belong inside a THREE.Group"), positioned and
 *     rotated as a unit — not added per-mesh with hand-rotated world coords.
 *   - The glass panes must form one flat wall, coplanar and just in front of
 *     the body's front face. A hand-rolled applyY() that rotated positions by
 *     -ry while rotation.y oriented by +ry left the panes spread across ~7 m
 *     of depth (some embedded inside the body) instead of a flat wall.
 *
 * Constants mirror src/osm/jubalaDecor.ts: JX=291, JZ=271.5, JW=14, JD=2,
 * JH=5, JROT=0.379, TERRACE_H=1.8, glassFaceZ = JD/2 + 0.08 = 1.08.
 */
const JROT = 0.379;
const JD = 2;
const GLASS_FACE_Z = JD / 2 + 0.08; // 1.08 — panes sit this far (local) in front of body centre

function build() {
  const scene = new THREE.Scene();
  const meshes = buildJubalaDecor(scene);
  scene.updateWorldMatrix(true, true);
  return { scene, meshes };
}

function isMesh(o: THREE.Object3D): o is THREE.Mesh {
  return o instanceof THREE.Mesh;
}

/** Glass panes: PlaneGeometry + transparent MeshStandardMaterial, opacity ~0.30. */
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

/** Red "COFFEE" blade: PlaneGeometry + DoubleSide MeshBasicMaterial. */
function isBlade(o: THREE.Object3D): o is THREE.Mesh {
  if (!isMesh(o)) return false;
  if (!(o.geometry instanceof THREE.PlaneGeometry)) return false;
  const mat = o.material as THREE.MeshBasicMaterial;
  return mat instanceof THREE.MeshBasicMaterial && mat.side === THREE.DoubleSide;
}

function collect<T extends THREE.Object3D>(scene: THREE.Scene, pred: (o: THREE.Object3D) => boolean): T[] {
  const out: T[] = [];
  scene.traverse((o) => {
    if (pred(o)) out.push(o as T);
  });
  return out;
}

describe('buildJubalaDecor — collision contract (U1/U5, R4/R5)', () => {
  it('returns exactly [body, terrace] for collision.build()', () => {
    const { meshes } = build();
    expect(meshes).toHaveLength(2);
    expect(meshes[0]).toBeInstanceOf(THREE.Mesh);
    expect(meshes[1]).toBeInstanceOf(THREE.Mesh);
    // body is the facade slab (BoxGeometry); terrace is the raised platform (BoxGeometry)
    expect(meshes[0].geometry instanceof THREE.BoxGeometry).toBe(true);
    expect(meshes[1].geometry instanceof THREE.BoxGeometry).toBe(true);
  });

  it('body is a shadow-casting facade slab', () => {
    const { meshes } = build();
    const body = meshes[0];
    expect(body.castShadow).toBe(true);
    expect(body.receiveShadow).toBe(true);
  });

  it('glass, sign, and blade are NOT in the returned collision array (R5)', () => {
    const { scene, meshes } = build();
    const returned = new Set(meshes.map((m) => m));
    const panes = collect<THREE.Mesh>(scene, isGlassPane);
    const blades = collect<THREE.Mesh>(scene, isBlade);
    expect(panes.length).toBe(4);
    expect(blades.length).toBe(1);
    for (const p of panes) expect(returned.has(p)).toBe(false);
    for (const b of blades) expect(returned.has(b)).toBe(false);
  });
});

describe('buildJubalaDecor — Group convention (R7 / AGENTS.md)', () => {
  it('wraps the storefront in a THREE.Group added to the scene', () => {
    const { scene } = build();
    const groups = scene.children.filter((c) => c instanceof THREE.Group);
    expect(groups.length).toBeGreaterThanOrEqual(1);
    // The facade body and at least one glass pane are children of a group,
    // not direct children of the scene.
    const { meshes } = build();
    const body = meshes[0];
    expect(body.parent).toBeInstanceOf(THREE.Group);
    const panes = collect<THREE.Mesh>(scene, isGlassPane);
    expect(panes.every((p) => p.parent instanceof THREE.Group)).toBe(true);
  });
});

describe('buildJubalaDecor — glass wall coplanarity (R2/R6, the applyY bug)', () => {
  it('all glass panes are coplanar and just in front of the body face', () => {
    const { scene, meshes } = build();
    const body = meshes[0];
    const panes = collect<THREE.Mesh>(scene, isGlassPane);
    expect(panes.length).toBe(4);

    const bodyWorld = new THREE.Vector3();
    body.getWorldPosition(bodyWorld);
    // body front face = local -Z, under the body's world rotation
    const frontNormal = new THREE.Vector3(0, 0, -1).applyQuaternion(
      body.getWorldQuaternion(new THREE.Quaternion()),
    );
    const bodyHalfDepth = JD / 2; // front face is this far along +frontNormal from centre

    const paneWorld = new THREE.Vector3();
    const projections = panes.map((p) => {
      p.getWorldPosition(paneWorld);
      return paneWorld.clone().sub(bodyWorld).dot(frontNormal);
    });

    // Coplanar: all panes share the same front-normal projection.
    const spread = Math.max(...projections) - Math.min(...projections);
    expect(spread).toBeLessThan(0.05);

    // In front of the body face: every pane's projection exceeds the body
    // half-depth (1.0 m). The applyY bug left panes as deep as -2.8 m (inside
    // the body); a correct flat wall sits at ~GLASS_FACE_Z = 1.08 m.
    for (const d of projections) {
      expect(d).toBeGreaterThan(bodyHalfDepth);
    }
    // And specifically at the intended offset (within a small tolerance).
    for (const d of projections) {
      expect(d).toBeCloseTo(GLASS_FACE_Z, 1);
    }
  });

  it('glass material is semi-transparent blue-grey DoubleSide (R2)', () => {
    const { scene } = build();
    const panes = collect<THREE.Mesh>(scene, isGlassPane);
    expect(panes.length).toBeGreaterThan(0);
    const mat = panes[0].material as THREE.MeshStandardMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBeGreaterThanOrEqual(0.25);
    expect(mat.opacity).toBeLessThanOrEqual(0.5);
    expect(mat.side).toBe(THREE.DoubleSide);
  });
});

describe('buildJubalaDecor — signs (R1/R3, R9)', () => {
  it('blade sign is DoubleSide with a vertical 64x256 canvas texture', () => {
    const { scene } = build();
    const blades = collect<THREE.Mesh>(scene, isBlade);
    expect(blades.length).toBe(1);
    const mat = blades[0].material as THREE.MeshBasicMaterial;
    expect(mat.side).toBe(THREE.DoubleSide);
    const tex = mat.map as THREE.CanvasTexture;
    expect(tex).toBeInstanceOf(THREE.CanvasTexture);
    const img = tex.image as HTMLCanvasElement;
    expect(img.width).toBe(64);
    expect(img.height).toBe(256); // tall — vertical orientation
  });

  it('gold name sign is a PlaneGeometry with a canvas texture', () => {
    const { scene } = build();
    // name sign: PlaneGeometry + MeshBasicMaterial, NOT DoubleSide (FrontSide), transparent + alphaTest
    const signs: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if (!isMesh(o)) return;
      if (!(o.geometry instanceof THREE.PlaneGeometry)) return;
      const mat = o.material as THREE.MeshBasicMaterial;
      if (
        mat instanceof THREE.MeshBasicMaterial &&
        mat.side === THREE.FrontSide &&
        mat.transparent === true
      ) {
        signs.push(o as THREE.Mesh);
      }
    });
    expect(signs.length).toBe(1);
    const mat = signs[0].material as THREE.MeshBasicMaterial;
    expect(mat.map).toBeInstanceOf(THREE.CanvasTexture);
  });
});