import * as THREE from 'three';

// Procedural tree-canopy geometry (douges threejs-trees-1 technique): a
// subdivided icosahedron whose vertices are pushed in/out by deterministic
// pseudo-noise, giving a faceted, organic crown. Geometry only — consumers
// apply their own (flat-shaded) materials and per-instance variation.

// Self-contained RNG so this module has no dependency on src/osm/trees.ts
// (which imports from here — a back-import would be circular). Mirrors the
// same xorshift-style generator used for tree placement.
function seededRng(seed: number) {
  let s = seed >>> 0;
  return () => { s = Math.imul(s ^ (s >>> 15), s | 1); s ^= s + Math.imul(s ^ (s >>> 7), s | 61); return ((s ^ (s >>> 14)) >>> 0) / 0xffffffff; };
}

// Vertices are keyed by their direction on the unit sphere, rounded to this
// many units. IcosahedronGeometry is non-indexed (each corner is duplicated
// per adjacent face), so the per-face copies of one corner must receive the
// SAME displacement to stay coincident — otherwise the canopy tears at seams.
// 1000 (3 decimals) absorbs per-face float error (~1e-6) while keeping the
// well-separated detail=1 vertices (~0.3 apart on the unit sphere) distinct.
const DIR_KEY_PRECISION = 1000;

// Fraction by which a vertex may move in/out from the base radius.
const DISPLACE_AMP = 0.5;

function displacedCanopy(radius: number, rng: () => number): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, 1);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const factorByKey = new Map<string, number>();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const len = v.length() || 1;
    const kx = Math.round((v.x / len) * DIR_KEY_PRECISION);
    const ky = Math.round((v.y / len) * DIR_KEY_PRECISION);
    const kz = Math.round((v.z / len) * DIR_KEY_PRECISION);
    const key = `${kx},${ky},${kz}`;
    let f = factorByKey.get(key);
    if (f === undefined) { f = 1 + (rng() - 0.5) * DISPLACE_AMP; factorByKey.set(key, f); }
    v.multiplyScalar(f);
    pos.setXYZ(i, v.x, v.y * 0.92, v.z); // slight vertical flatten — natural crown
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generate `count` distinct canopy geometries deterministically. The same
 * `(count, seed, radius)` always yields identical geometries, so the scene
 * renders the same on every load. Consumers instance these across many trees.
 */
export function makeCanopyPrototypes(count: number, seed: number, radius = 3): THREE.BufferGeometry[] {
  const rng = seededRng(seed);
  const protos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) protos.push(displacedCanopy(radius, rng));
  return protos;
}
