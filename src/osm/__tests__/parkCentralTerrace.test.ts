import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildParkCentralTerrace } from '../parkCentralTerrace';

/**
 * Park Central north-wall terrace — geometry/placement/clearance tests.
 *
 * Orientation and clearance assert against the REFERENCE WALL, not the
 * module's own constants (per the plan's test posture and the
 * scene-object-placement documented learning, Guidance 5/6):
 *
 *   Wall edge: B=(204.9,236.4) west → A=(323.9,283.8) NE corner.
 *   Along-wall bearing ≈ 21.7° east-of-north; outward normal (toward the
 *   road "Park At North Hills Street", ~10 m north) ≈ (0.370,−0.929) = N 21.7° E.
 *
 * Clearance (R2 deviation, approved 2026-06-30): the plan's literal "world min
 * z ≥ 263" was a proxy for "don't cross the park". The geojson has no fence at
 * z≈263; the real northern limits are the road (~10 m north of the wall) and
 * the park polygon (~15 m north). The deck extends only ~4.7 m north of the
 * wall, so we assert the deck stays within ~6 m of the wall (clear of the road)
 * instead of the z≥263 proxy.
 *
 * Jubala storefront reference placement (from jubalaDecor.ts): centre
 * (291, 271.5), width 14, sits on the flat part of this terrace.
 */
const WALL_WEST = { x: 204.9, z: 236.4 };
const WALL_EAST = { x: 323.9, z: 283.8 };
const WALL_DX = WALL_EAST.x - WALL_WEST.x;
const WALL_DZ = WALL_EAST.z - WALL_WEST.z;
const WALL_LEN = Math.hypot(WALL_DX, WALL_DZ);
const WALL_UX = WALL_DX / WALL_LEN;
const WALL_UZ = WALL_DZ / WALL_LEN;
const WALL_NX = WALL_UZ;    // outward normal x (toward road/north)
const WALL_NZ = -WALL_UX;   // outward normal z
const WALL_BEARING_DEG = (Math.atan2(WALL_NX, -WALL_NZ) * 180) / Math.PI; // ~21.7

function build() {
  const scene = new THREE.Scene();
  const meshes = buildParkCentralTerrace(scene);
  scene.updateWorldMatrix(true, true);
  return { scene, meshes };
}

function bearingFromNorth(x: number, z: number): number {
  return (Math.atan2(x, -z) * 180) / Math.PI;
}

/** Perpendicular distance of a world point from the wall line, signed (+ = outward/north). */
function outwardDistance(wx: number, wz: number): number {
  return (wx - WALL_WEST.x) * WALL_NX + (wz - WALL_WEST.z) * WALL_NZ;
}

describe('buildParkCentralTerrace — contract & geometry', () => {
  it('returns a non-empty array whose terrace mesh is an ExtrudeGeometry', () => {
    const { meshes } = build();
    expect(meshes.length).toBeGreaterThanOrEqual(1);
    const terrace = meshes[0];
    expect(terrace).toBeInstanceOf(THREE.Mesh);
    expect(terrace.geometry instanceof THREE.ExtrudeGeometry).toBe(true);
  });

  it('terrace is wrapped in a THREE.Group added to the scene (not a loose mesh)', () => {
    const { scene, meshes } = build();
    const terrace = meshes[0];
    expect(terrace.parent).toBeInstanceOf(THREE.Group);
    const group = terrace.parent as THREE.Group;
    expect(group.parent).toBe(scene);
  });
});

describe('buildParkCentralTerrace — orientation vs the reference wall', () => {
  it('front (local -Z) faces the wall outward normal (≈21.7° E of N, not NW)', () => {
    const { meshes } = build();
    const group = meshes[0].parent as THREE.Group;
    const front = new THREE.Vector3(0, 0, -1).applyQuaternion(
      group.getWorldQuaternion(new THREE.Quaternion()),
    );
    const bearing = bearingFromNorth(front.x, front.z);
    expect(bearing).toBeCloseTo(WALL_BEARING_DEG, 0);
    expect(bearing).toBeGreaterThan(0); // east of north, not the +0.379 NW mirror
  });

  it('width axis (local +X) runs parallel to the wall edge', () => {
    const { meshes } = build();
    const group = meshes[0].parent as THREE.Group;
    const widthAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(
      group.getWorldQuaternion(new THREE.Quaternion()),
    );
    const angleDeg = (Math.atan2(widthAxis.z, widthAxis.x) * 180) / Math.PI;
    const normalized = ((angleDeg % 180) + 180) % 180;
    const wallAlongDeg = (Math.atan2(WALL_DZ, WALL_DX) * 180) / Math.PI;
    const wallNorm = ((wallAlongDeg % 180) + 180) % 180;
    const diff = Math.min(Math.abs(normalized - wallNorm), 180 - Math.abs(normalized - wallNorm));
    expect(diff).toBeLessThan(1.0);
  });
});

describe('buildParkCentralTerrace — clearance (R2 deviation: real road/park limits)', () => {
  it('deck stays within ~6 m of the wall (clear of the ~10 m road, not the z=263 proxy)', () => {
    const { meshes } = build();
    const terrace = meshes[0];
    const pos = terrace.geometry.attributes.position;
    const v = new THREE.Vector3();
    let maxOut = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      terrace.localToWorld(v);
      const d = outwardDistance(v.x, v.z);
      if (d > maxOut) maxOut = d;
    }
    // Deck extends ~4.7 m north of the wall; road is ~10 m north → ≥4 m clearance.
    expect(maxOut).toBeLessThanOrEqual(6.0);
    expect(maxOut).toBeGreaterThan(3.0); // sanity: the deck actually reaches toward the road
  });
});

describe('buildParkCentralTerrace — ramped west end, flat deck, sheer east', () => {
  /** Mesh-local profile vertices (x = along-wall length, y = height), pre-group-rotation. */
  function profileVertices(terrace: THREE.Mesh): { x: number; y: number }[] {
    const pos = terrace.geometry.attributes.position;
    const out: { x: number; y: number }[] = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      out.push({ x: v.x, y: v.y });
    }
    return out;
  }

  it('west end tapers to ground (top surface at y≈0 at the trim)', () => {
    const { meshes } = build();
    const verts = profileVertices(meshes[0]);
    const atWest = verts.filter((p) => p.x < 0.01);
    expect(atWest.length).toBeGreaterThan(0);
    for (const p of atWest) expect(p.y).toBeLessThan(0.05); // ramp foot at ground
  });

  it('ramp rises to the deck height over ≥12 m (slope ≤ ~9°)', () => {
    const { meshes } = build();
    const verts = profileVertices(meshes[0]);
    const foot = verts.filter((p) => p.x < 0.01 && p.y < 0.05)[0];
    const crest = verts.filter((p) => p.y > 1.7).sort((a, b) => a.x - b.x)[0];
    expect(foot).toBeTruthy();
    expect(crest).toBeTruthy();
    const run = crest.x - foot.x;
    const rise = crest.y - foot.y;
    expect(run).toBeGreaterThanOrEqual(11.9); // RAMP_LEN ≥ 12 (R3)
    const slopeDeg = (Math.atan2(rise, run) * 180) / Math.PI;
    expect(slopeDeg).toBeLessThanOrEqual(9.0);
  });

  it('flat deck top sits at y≈1.8 spanning the building-wide deck (>40 m)', () => {
    // ExtrudeGeometry places the flat-top edge as two corner vertices (ramp
    // crest and east end) at y=TERRACE_H; the quad between them is the deck
    // surface. We assert those y≈1.8 corners exist and span a wide x-range
    // (building-wide), with the westernmost one past the ramp (x ≥ 11).
    const { meshes } = build();
    const verts = profileVertices(meshes[0]);
    const top = verts.filter((p) => p.y > 1.7 && p.y < 1.9);
    expect(top.length).toBeGreaterThan(0);
    for (const p of top) expect(p.y).toBeCloseTo(1.8, 1);
    const xs = top.map((p) => p.x);
    const span = Math.max(...xs) - Math.min(...xs);
    expect(span).toBeGreaterThan(40); // building-wide flat deck
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(11); // starts after the ramp
  });

  it('east end is sheer: top at y≈1.8 (no ramp tapering to 0 on this end)', () => {
    const { meshes } = build();
    const verts = profileVertices(meshes[0]);
    const maxX = Math.max(...verts.map((p) => p.x));
    const atEast = verts.filter((p) => p.x > maxX - 0.01);
    expect(atEast.length).toBeGreaterThan(0);
    const maxY = Math.max(...atEast.map((p) => p.y));
    expect(maxY).toBeCloseTo(1.8, 1); // deck-top height, not a ramp-down
  });

  it('terrace top at the Jubala location (world x≈291) is flat at y≈1.8', () => {
    const { meshes } = build();
    const terrace = meshes[0];
    // Convert the Jubala storefront centre to the terrace mesh's local frame.
    const jubalaLocal = terrace.worldToLocal(new THREE.Vector3(291, 0, 271.5));
    // On the flat deck (past the ramp, before the NE corner): local x ∈ [12, L].
    expect(jubalaLocal.x).toBeGreaterThan(12);
    expect(jubalaLocal.x).toBeLessThan(60);
    // The flat deck top spans [ramp-crest, east-end] at y≈1.8; Jubala must fall
    // within that span so its body base (y=TERRACE_H) sits on the deck.
    const verts = profileVertices(terrace);
    const topXs = verts.filter((p) => p.y > 1.7 && p.y < 1.9).map((p) => p.x);
    const minX = Math.min(...topXs);
    const maxX = Math.max(...topXs);
    expect(jubalaLocal.x).toBeGreaterThanOrEqual(minX);
    expect(jubalaLocal.x).toBeLessThanOrEqual(maxX);
  });
});

describe('buildParkCentralTerrace — collision registration', () => {
  it('the terrace mesh is in the returned collision array', () => {
    const { meshes } = build();
    expect(meshes[0]).toBeInstanceOf(THREE.Mesh);
    expect(meshes[0].geometry instanceof THREE.ExtrudeGeometry).toBe(true);
  });
});