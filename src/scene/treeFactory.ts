import * as THREE from 'three';
import { Tree } from '@dgreenheck/ez-tree';

// Shared factory for ez-tree procedural trees. `generateTreePrototypes` builds a
// few full trees once; `buildTreeInstances` fans a prototype set out across many
// positions via InstancedMesh. Both the OSM trees and the hand-authored scene
// grove/lawn trees use this.

export interface TreePrototype {
  branchGeo: THREE.BufferGeometry;
  branchMat: THREE.Material;
  leafGeo: THREE.BufferGeometry;
  leafMat: THREE.Material;
  /** Scale that brings this prototype to the target scene height. */
  normScale: number;
}

const DEFAULT_PRESET = 'Oak Small'; // lighter than Medium — fewer leaf cards/branches for perf
const TARGET_HEIGHT = 20; // approximate tree height in scene units (tune in dev)

// Shadow casting is the dominant GPU cost at scene scale (hundreds of instanced
// trees in the shadow pass). Branches cast; alpha-tested leaf cards do NOT — the
// leaf depth pass with alpha is by far the most expensive part. Flip these to
// trade FPS for fidelity.
const BRANCH_CAST_SHADOW = true;
const LEAF_CAST_SHADOW = false;

// Prototypes are expensive to generate (ez-tree builds full geometry) and are
// identical for every consumer. Generate one shared set lazily and reuse it
// across all tree sources — avoids regenerating ~13 trees across modules and
// lets the GPU upload each geometry once.
const SHARED_COUNT = 4;
const SHARED_SEED = 24601;
let _sharedPrototypes: TreePrototype[] | null = null;

export function getSharedTreePrototypes(): TreePrototype[] {
  if (!_sharedPrototypes) _sharedPrototypes = generateTreePrototypes(SHARED_COUNT, SHARED_SEED);
  return _sharedPrototypes;
}

const LEAF_TINTS = [0xffffff, 0xe6f0d4, 0xd2e3b0].map((c) => new THREE.Color(c));

function singleMaterial(m: THREE.Material | THREE.Material[]): THREE.Material {
  return Array.isArray(m) ? m[0] : m;
}

// Small deterministic RNG (mulberry32) so a given seed always produces the same
// instance layout — the scene renders identically on every load.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ez-tree's wind shader replaces `#include <project_vertex>` WITHOUT the
// instanceMatrix multiply, so its stock materials ignore per-instance transforms
// on an InstancedMesh (every instance would render at the origin). Re-insert the
// instance transform ahead of the model-view transform so instancing works.
function patchInstancing(mat: THREE.Material): THREE.Material {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (typeof prev === 'function') prev(shader, renderer);
    const marker = 'mvPosition = modelViewMatrix * mvPosition;';
    const patched = shader.vertexShader.replace(
      marker,
      '#ifdef USE_INSTANCING\n  mvPosition = instanceMatrix * mvPosition;\n#endif\n  ' + marker,
    );
    if (patched === shader.vertexShader) {
      // Marker absent — ez-tree changed its GLSL. Every instance will render at origin.
      console.warn('[treeFactory] patchInstancing: GLSL marker not found — instancing broken. Check ez-tree version.');
    }
    shader.vertexShader = patched;
  };
  mat.needsUpdate = true;
  return mat;
}

/**
 * Generate `count` deterministic ez-tree prototypes from a preset. Requires a
 * DOM (ez-tree loads textures via the browser image pipeline), so this runs at
 * scene-build time in the browser, not in a headless/node context.
 */
export function generateTreePrototypes(
  count: number,
  seedBase: number,
  preset: string = DEFAULT_PRESET,
): TreePrototype[] {
  const protos: TreePrototype[] = [];
  for (let i = 0; i < count; i++) {
    const tree = new Tree();
    tree.loadPreset(preset); // copies preset options (also generates once)
    tree.options.seed = seedBase + i;
    tree.generate(); // regenerate with our seed for determinism

    const branchGeo = tree.branchesMesh.geometry;
    const leafGeo = tree.leavesMesh.geometry;
    branchGeo.computeBoundingBox();
    leafGeo.computeBoundingBox();
    const bb = branchGeo.boundingBox!.clone().union(leafGeo.boundingBox!);
    const height = bb.max.y - bb.min.y || 1;

    protos.push({
      branchGeo,
      branchMat: patchInstancing(singleMaterial(tree.branchesMesh.material)),
      leafGeo,
      leafMat: patchInstancing(singleMaterial(tree.leavesMesh.material)),
      normScale: TARGET_HEIGHT / height,
    });
  }
  return protos;
}

/**
 * Build a THREE.Group of instanced trees from a prototype set and a list of
 * ground positions. One branch + one leaf InstancedMesh per prototype; per
 * instance the matrix carries position, yaw, and a height-normalized scale, and
 * leaves carry a per-instance tint so repeated prototypes don't read as clones.
 */
export function buildTreeInstances(
  prototypes: TreePrototype[],
  positions: [number, number][],
  seed: number,
): THREE.Group {
  const group = new THREE.Group();
  if (prototypes.length === 0 || positions.length === 0) return group;

  const rng = makeRng(seed);
  const buckets: [number, number][][] = prototypes.map(() => []);
  for (const p of positions) {
    buckets[Math.floor(rng() * prototypes.length) % prototypes.length].push(p);
  }

  const obj = new THREE.Object3D();
  const col = new THREE.Color();

  buckets.forEach((bpts, pi) => {
    if (bpts.length === 0) return;
    const proto = prototypes[pi];

    const branchInst = new THREE.InstancedMesh(proto.branchGeo, proto.branchMat, bpts.length);
    const leafInst = new THREE.InstancedMesh(proto.leafGeo, proto.leafMat, bpts.length);
    branchInst.castShadow = BRANCH_CAST_SHADOW;
    leafInst.castShadow = LEAF_CAST_SHADOW;
    if (LEAF_CAST_SHADOW) {
      // Leaf-shaped (not square) shadows need the leaf alpha map in the depth pass.
      const leafPhong = proto.leafMat as THREE.MeshPhongMaterial;
      const leafDepth = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
        alphaTest: leafPhong.alphaTest,
        side: THREE.DoubleSide,
      });
      if (leafPhong.map) leafDepth.map = leafPhong.map;
      leafInst.customDepthMaterial = leafDepth;
    }

    bpts.forEach(([x, z], i) => {
      const sc = proto.normScale * (0.85 + rng() * 0.4);
      const ry = rng() * Math.PI * 2;
      obj.position.set(x, 0, z);
      obj.scale.setScalar(sc);
      obj.rotation.set(0, ry, 0);
      obj.updateMatrix();
      branchInst.setMatrixAt(i, obj.matrix);
      leafInst.setMatrixAt(i, obj.matrix);
      col.copy(LEAF_TINTS[Math.floor(rng() * LEAF_TINTS.length)]);
      leafInst.setColorAt(i, col);
    });

    branchInst.instanceMatrix.needsUpdate = true;
    leafInst.instanceMatrix.needsUpdate = true;
    if (leafInst.instanceColor) leafInst.instanceColor.needsUpdate = true;
    group.add(branchInst, leafInst);
  });

  return group;
}
