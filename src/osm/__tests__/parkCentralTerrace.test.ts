import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildParkCentralTerrace, TERRACE_LEN, TERRACE_H } from '../parkCentralTerrace';

/**
 * Park Central north-wall terrace — geometry/placement/clearance tests.
 *
 * Orientation and clearance assert against the REFERENCE WALL, not the
 * module's own constants (per the plan's test posture and the
 * scene-object-placement documented learning, Guidance 5/6):
 *
 *   Wall edge: B=(204.9,236.4) west → A=(323.9,283.8) NE corner.
 *   Along-wall bearing ≈ 21.7° east-of-north; outward normal (toward the
 *   road "Park At North Hills Street", ~32 m north) ≈ (0.370,−0.929) = N 21.7° E.
 *
 * Clearance (R2 deviation, approved 2026-06-30): the plan's literal "world min
 * z ≥ 263" was a proxy for "don't cross the park". The geojson has no fence at
 * z≈263; the real northern limit is the park polygon (~14 m north of the wall,
 * ~parallel, verified for the FULL wall length). The deck extends only ~4.7 m
 * north of the wall, so we assert the deck stays within ~6 m of the wall (clear
 * of the ~14 m park boundary) instead of the z≥263 proxy.
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
  it('deck stays within ~6 m of the wall (clear of the ~14 m park boundary, not the z=263 proxy)', () => {
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
    // Deck extends ~4.7 m north of the wall; park boundary is ~14 m north → ≥9 m clearance.
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

  it('west end tapers to ground (top surface at y≈0 at the wall west end, point B)', () => {
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

  it('ramp foot at the west end (point B); deck runs to its shortened east end (≈120, a little before the NE corner)', () => {
    // The ramp foot (local x≈0, y≈0) must map to the wall's west end B. The deck
    // east end is deliberately shortened from the full wall (128.1) to ~120 per
    // the user's "a little before eastwards" direction, so the NE corner is open.
    const { meshes } = build();
    const terrace = meshes[0];
    const group = terrace.parent as THREE.Group;
    // Group origin must be the wall's west end (point B), not s=72 along it.
    const gp = group.getWorldPosition(new THREE.Vector3());
    expect(gp.x).toBeCloseTo(WALL_WEST.x, 1);
    expect(gp.z).toBeCloseTo(WALL_WEST.z, 1);
    // The terrace length must equal the (shortened) deck length, not the full wall.
    const verts = profileVertices(terrace);
    const maxX = Math.max(...verts.map((p) => p.x));
    expect(maxX).toBeCloseTo(TERRACE_LEN, 0); // ≈ 120, not 128.1
    expect(maxX).toBeLessThan(WALL_LEN - 5); // clearly short of the NE corner
  });

  it('terrace top at the Jubala location (world x≈291) is flat at y≈1.8', () => {
    const { meshes } = build();
    const terrace = meshes[0];
    // Convert the Jubala storefront centre to the terrace mesh's local frame.
    const jubalaLocal = terrace.worldToLocal(new THREE.Vector3(291, 0, 271.5));
    // On the flat deck (past the ramp, before the NE corner): local x ∈ [12, L].
    expect(jubalaLocal.x).toBeGreaterThan(12);
    expect(jubalaLocal.x).toBeLessThan(TERRACE_LEN);
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

describe('buildParkCentralTerrace — metal grill (U3, R7-R10)', () => {
  function isGrillMesh(o: THREE.Object3D): o is THREE.Mesh {
    if (!(o instanceof THREE.Mesh)) return false;
    if (!(o.geometry instanceof THREE.CylinderGeometry)) return false;
    const mat = o.material as THREE.MeshStandardMaterial;
    return mat instanceof THREE.MeshStandardMaterial && mat.metalness >= 0.6;
  }

  it('a grill mesh is present as a descendant of the terrace group', () => {
    const { scene } = build();
    const grills: THREE.Mesh[] = [];
    scene.traverse((o) => { if (isGrillMesh(o)) grills.push(o); });
    expect(grills.length).toBeGreaterThanOrEqual(1);
    for (const g of grills) {
      // descendant of the terrace group (not a direct scene child)
      let p: THREE.Object3D | null = g.parent;
      let inGroup = false;
      while (p) { if (p instanceof THREE.Group && p.parent === scene) { inGroup = true; break; } p = p.parent; }
      expect(inGroup).toBe(true);
    }
  });

  it('the grill shares the terrace group orientation (same world yaw)', () => {
    const { scene, meshes } = build();
    scene.updateWorldMatrix(true, true);
    const group = meshes[0].parent as THREE.Group;
    const groupYaw = new THREE.Euler().setFromQuaternion(
      group.getWorldQuaternion(new THREE.Quaternion()), 'YXZ',
    ).y;
    const grills: THREE.Mesh[] = [];
    scene.traverse((o) => { if (isGrillMesh(o)) grills.push(o); });
    expect(grills.length).toBeGreaterThan(0);
    for (const g of grills) {
      const yaw = new THREE.Euler().setFromQuaternion(
        g.getWorldQuaternion(new THREE.Quaternion()), 'YXZ',
      ).y;
      // CylinderGeometry is rotationally symmetric about Y, so compare the
      // group's rotation channel the grill inherits (parent group yaw).
      expect(Math.abs(yaw - groupYaw) % (2 * Math.PI)).toBeLessThan(0.01);
    }
  });

  it('grill material is metal (metalness ≥ 0.6) and dark grey', () => {
    const { scene } = build();
    const grills: THREE.Mesh[] = [];
    scene.traverse((o) => { if (isGrillMesh(o)) grills.push(o); });
    expect(grills.length).toBeGreaterThan(0);
    const mat = grills[0].material as THREE.MeshStandardMaterial;
    expect(mat.metalness).toBeGreaterThanOrEqual(0.6);
    const c = mat.color;
    // dark grey: all channels low and roughly equal
    expect(c.r).toBeLessThan(0.35);
    expect(c.g).toBeLessThan(0.35);
    expect(c.b).toBeLessThan(0.35);
  });

  it('grill base sits on the deck (world y ≈ TERRACE_H) near the road-side edge', () => {
    const { scene } = build();
    scene.updateWorldMatrix(true, true);
    const grills: THREE.Mesh[] = [];
    scene.traverse((o) => { if (isGrillMesh(o)) grills.push(o); });
    expect(grills.length).toBeGreaterThan(0);
    const terrace = scene.getObjectByProperty('type', 'Mesh') as THREE.Mesh | undefined;
    // Convert the grill's world position into the terrace mesh's local frame to
    // check it is on the deck (y ≈ TERRACE_H) and in the road-side (−Z) half.
    const barrel = grills
      .map((g) => ({ g, r: (g.geometry as THREE.CylinderGeometry).parameters.radiusTop }))
      .sort((a, b) => a.r - b.r)[0].g; // the narrower barrel, not the grate
    const local = barrel.worldToLocal(new THREE.Vector3()); // origin in local frame
    // Grill is a child of the group, so its local origin is already in the
    // terrace-group frame (position set via group.add). Use barrel.position
    // (local-to-group) directly: y base = position.y - halfHeight.
    const geo = barrel.geometry as THREE.CylinderGeometry;
    const baseY = barrel.position.y - geo.parameters.height / 2;
    expect(baseY).toBeCloseTo(1.8, 1); // on the deck top
    expect(barrel.position.z).toBeLessThan(-1.0); // road-side (-Z) half of the deck
    expect(barrel.castShadow).toBe(true);
  });

  it('the grill meshes are in the returned collision array', () => {
    const { meshes, scene } = build();
    const returned = new Set(meshes.map((m) => m));
    const grills: THREE.Mesh[] = [];
    scene.traverse((o) => { if (isGrillMesh(o)) grills.push(o); });
    expect(grills.length).toBeGreaterThan(0);
    for (const g of grills) expect(returned.has(g)).toBe(true);
  });
});

describe('buildParkCentralTerrace — terrace-edge iron railing (relocated fence)', () => {
  // The iron perimeter fence (fences.ts) around Park Central's north wall was
  // buried inside the solid deck (Y∈[0,1.3] below the deck top at Y=1.8). The fix
  // relocates it to the flat-deck front edge at deck-top level. These railing
  // meshes are BoxGeometry + iron material (distinct from the CylinderGeometry
  // barbecue grill above) and sit at the road-side edge (local Z ≈ −4.7) at
  // Y ≈ TERRACE_H — not buried at Y=0.

  const DECK_ROAD = 4.7; // deck extends this far outward (local −Z)

  // Railing meshes are merged BufferGeometry (rails + posts) with an iron
  // material — distinct from the barbecue grill (CylinderGeometry) and the
  // terrace (ExtrudeGeometry). Filter by iron material + non-barbecue/terrace
  // geometry so only the relocated fence is matched.
  function isRailingMesh(o: THREE.Object3D): o is THREE.Mesh {
    if (!(o instanceof THREE.Mesh)) return false;
    const geo = o.geometry;
    if (geo instanceof THREE.ExtrudeGeometry) return false;
    if (geo instanceof THREE.CylinderGeometry) return false;
    if (!(geo instanceof THREE.BufferGeometry)) return false;
    const mat = o.material as THREE.MeshStandardMaterial;
    if (!(mat instanceof THREE.MeshStandardMaterial)) return false;
    return mat.metalness >= 0.6 && mat.color.r < 0.2; // dark iron
  }

  it('iron railing meshes exist as descendants of the terrace group', () => {
    const { scene, meshes } = build();
    const group = meshes[0].parent as THREE.Group;
    const railings: THREE.Mesh[] = [];
    scene.traverse((o) => { if (isRailingMesh(o)) railings.push(o); });
    expect(railings.length).toBeGreaterThanOrEqual(2);
    for (const r of railings) {
      let p: THREE.Object3D | null = r.parent;
      let inGroup = false;
      while (p) { if (p === group) { inGroup = true; break; } p = p.parent; }
      expect(inGroup).toBe(true);
    }
  });

  it('railing sits at deck-top level (Y ≈ TERRACE_H), not buried at Y=0', () => {
    const { scene, meshes } = build();
    scene.updateWorldMatrix(true, true);
    const railings: THREE.Mesh[] = [];
    scene.traverse((o) => { if (isRailingMesh(o)) railings.push(o); });
    expect(railings.length).toBeGreaterThan(0);
    for (const r of railings) {
      // The railing position is in the merged geometry (mesh position is the
      // group origin), so read the geometry bounding-box centre's world Y.
      r.geometry.computeBoundingBox();
      const center = new THREE.Vector3();
      r.geometry.boundingBox!.getCenter(center);
      const wy = r.localToWorld(center.clone()).y;
      // The railing stands on the deck top: its centre sits well above ground
      // (a buried fence would centre at Y≈0.65) and within the railing band.
      expect(wy).toBeGreaterThan(1.5); // deck-top level, not buried at Y≈0.65
      expect(wy).toBeLessThan(TERRACE_H + 2.0); // within the railing height band
    }
  });

  it('railing runs along the flat-deck front edge (group-local X ∈ [RAMP_LEN, TERRACE_LEN], Z ≈ −DECK_ROAD)', () => {
    const { scene, meshes } = build();
    scene.updateWorldMatrix(true, true);
    const group = meshes[0].parent as THREE.Group;
    const railings: THREE.Mesh[] = [];
    scene.traverse((o) => { if (isRailingMesh(o)) railings.push(o); });
    expect(railings.length).toBeGreaterThan(0);
    for (const r of railings) {
      // The railing position is encoded in the merged geometry (mesh position
      // is the group origin), so read the geometry bounding-box centre and
      // express it in the terrace group's local frame (X along the wall, Z
      // outward; the road-side front edge is at Z ≈ −DECK_ROAD).
      r.geometry.computeBoundingBox();
      const center = new THREE.Vector3();
      r.geometry.boundingBox!.getCenter(center);
      const worldCenter = r.localToWorld(center.clone());
      const gl = group.worldToLocal(worldCenter);
      expect(gl.x).toBeGreaterThanOrEqual(11); // flat deck (past the ramp)
      expect(gl.x).toBeLessThanOrEqual(TERRACE_LEN + 0.1);
      expect(gl.z).toBeLessThan(-3.5); // road-side front edge
      expect(gl.z).toBeGreaterThan(-DECK_ROAD - 0.3);
    }
  });
});