import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeCanopyPrototypes } from '../treeCanopy';

function positions(geo: THREE.BufferGeometry): Float32Array {
  return (geo.attributes.position as THREE.BufferAttribute).array as Float32Array;
}

describe('makeCanopyPrototypes', () => {
  it('returns exactly the requested number of geometries', () => {
    expect(makeCanopyPrototypes(4, 99, 3)).toHaveLength(4);
    expect(makeCanopyPrototypes(1, 99, 3)).toHaveLength(1);
  });

  it('is deterministic for the same (count, seed, radius)', () => {
    const a = makeCanopyPrototypes(3, 24601, 3);
    const b = makeCanopyPrototypes(3, 24601, 3);
    a.forEach((geo, i) => {
      expect(Array.from(positions(geo))).toEqual(Array.from(positions(b[i])));
    });
  });

  it('produces different geometry for different seeds', () => {
    const a = positions(makeCanopyPrototypes(1, 1, 3)[0]);
    const b = positions(makeCanopyPrototypes(1, 2, 3)[0]);
    let differs = false;
    for (let i = 0; i < a.length; i++) {
      if (Math.abs(a[i] - b[i]) > 1e-6) { differs = true; break; }
    }
    expect(differs).toBe(true);
  });

  it('keeps vertices that share a direction coincident (no seam split)', () => {
    // IcosahedronGeometry is non-indexed; corners are duplicated per face.
    // After displacement, duplicates of one corner must land on the same point.
    const geo = makeCanopyPrototypes(1, 7, 3)[0];
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    const byKey = new Map<string, THREE.Vector3>();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const len = v.length() || 1;
      // Key by the ORIGINAL (pre-displacement) direction is unavailable here,
      // so detect duplicates by displaced position proximity instead: group by
      // rounded displaced position and assert each group is internally exact.
      const key = `${Math.round(v.x * 1000)},${Math.round(v.y * 1000)},${Math.round(v.z * 1000)}`;
      const seen = byKey.get(key);
      if (seen) {
        expect(Math.abs(v.x - seen.x)).toBeLessThan(1e-4);
        expect(Math.abs(v.y - seen.y)).toBeLessThan(1e-4);
        expect(Math.abs(v.z - seen.z)).toBeLessThan(1e-4);
      } else {
        byKey.set(key, v.clone());
      }
    }
    // Sanity: the geometry actually had duplicate corners to merge.
    expect(byKey.size).toBeLessThan(pos.count);
  });

  it('recomputes vertex normals', () => {
    const geo = makeCanopyPrototypes(1, 5, 3)[0];
    expect(geo.attributes.normal).toBeTruthy();
    expect((geo.attributes.normal as THREE.BufferAttribute).count).toBe(
      (geo.attributes.position as THREE.BufferAttribute).count,
    );
  });

  it('displaces within the expected radius band', () => {
    const radius = 3;
    const geo = makeCanopyPrototypes(1, 11, radius)[0];
    geo.computeBoundingSphere();
    const r = geo.boundingSphere!.radius;
    // Vertices move by up to +/-25% (DISPLACE_AMP/2); allow generous bounds.
    expect(r).toBeGreaterThan(radius * 0.6);
    expect(r).toBeLessThan(radius * 1.4);
  });
});
