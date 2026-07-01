import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Park Central north-wall terrace — a raised, wall-oriented deck that extends
 * the Jubala storefront's entry terrace building-wide along Park Central's
 * north wall and terminates at its west end in a walkable ramp down to ground.
 *
 * The deck is one `ExtrudeGeometry`: a 2D profile in the local-X (along-wall
 * length) × local-Y (height) plane — `(0,0) → (RAMP_LEN, TERRACE_H) → (L,
 * TERRACE_H) → (L,0)` — extruded along local-Z by the deck depth. The profile
 * rises from ground at the wall's west end / point B (local X=0) to the deck
 * height over `RAMP_LEN`, then stays flat at `TERRACE_H` to the building's NE
 * corner (local X=L). The east end (X=L) is a sheer vertical face; the west
 * end is the ramped descent. Extruding along Z turns each profile edge into a
 * lateral face: the ramp edge becomes the sloped walkable ramp, the flat edge
 * becomes the deck top, and the east edge becomes the sheer wall — all without
 * a `rotateX(-π/2)` (the shape is already Y-up; that flip is only for footprint
 * extrudes in `extrude.ts`).
 *
 * Placement follows AGENTS.md "Hand-placed scene props belong inside a
 * THREE.Group": one group positioned at the wall's west end (point B) and
 * rotated `JROT` once, so local +X runs east along the wall and local -Z is
 * the wall's outward normal (toward the road). Children use local coordinates.
 *
 * ── Clearance (R2 superseded, see plan deviation) ──────────────────────────
 * The plan's R2 literal "world min z ≥ 263" was a conservative proxy for "don't
 * cross the park fence". The geojson has NO fence/barrier at z≈263 — that was
 * Jubala's own clearance estimate — and the park polygon's south boundary runs
 * ~14 m north of the wall, ~parallel to it, for the FULL wall length (verified
 * at s = 0,30,60,93,128). The real northern limit is therefore the park
 * polygon (~14 m north); the road "Park At North Hills Street" sits ~32 m
 * north. The deck extends only ~4.7 m north of the wall (road-side front),
 * leaving ~9 m of park clearance everywhere, so R2's intent (don't cross the
 * park) holds while giving the full-depth deck + full-wall ramp the plan asked
 * for. The literal z≥263 bound is unsatisfiable with R3+R5 (see plan risk note)
 * and is superseded by these real limits per the user's 2026-06-30 decision.
 *
 * ── Derived placement (record per Guidance 5/6) ────────────────────────────
 *   Wall: B=(204.9,236.4) west end → A=(323.9,283.8) NE corner, length 128.1 m,
 *   bearing 21.7° east-of-north. Along-wall unit u=(0.9290,0.3700); outward
 *   normal n=(0.3700,-0.9290) (toward the road/north); JROT=atan2(-nx,-nz)=-0.379.
 *   Jubala storefront centre projects to along-wall s≈93 (width 14 → s∈[86,100]).
 *   The terrace spans the FULL north wall: the 12 m ramp sits at the west end
 *   (s∈[0,12], foot at point B) and the flat deck runs s∈[12,128.1] to the NE
 *   corner, so Jubala (s≈93) sits well on the flat top. Group origin = B =
 *   (204.9, 236.4); L = 128.1 m. (An earlier s=72 trim was an artifact of the
 *   superseded z≥263 park-fence proxy — see clearance note — and is removed.)
 *
 * Coordinate conventions: +X east, +Z south, +Y up. Character treats -Z as
 * forward; local -Z here is the wall outward normal (toward the road), the same
 * convention `jubalaDecor.ts` uses for its storefront front.
 */

// ── Wall reference (scene-space, projected from OSM) ──────────────────────────
// Exported so the north-wall storefronts module (northWallStorefronts.ts) can
// derive tenant world positions from the same wall reference the terrace uses.
export const WALL_WEST_X = 204.9;
export const WALL_WEST_Z = 236.4;
const WALL_EAST_X = 323.9;
const WALL_EAST_Z = 283.8;

// Along-wall unit vector and length.
const WALL_DX = WALL_EAST_X - WALL_WEST_X;
const WALL_DZ = WALL_EAST_Z - WALL_WEST_Z;
const WALL_LEN = Math.hypot(WALL_DX, WALL_DZ);
export const WALL_UX = WALL_DX / WALL_LEN; // 0.9290
export const WALL_UZ = WALL_DZ / WALL_LEN; // 0.3700
// Outward normal (toward the road/north): rotate the along-wall unit by -90° in xz.
const WALL_NX = WALL_UZ;            // 0.3700
const WALL_NZ = -WALL_UX;           // -0.9290

/** Wall angle applied once to the group so local -Z faces the outward normal. */
export const JROT = Math.atan2(-WALL_NX, -WALL_NZ); // ≈ -0.379

/** Raised deck height (m) — shared with `jubalaDecor.ts` so the body sits flush. */
export const TERRACE_H = 1.8;

// ── Terrace geometry ─────────────────────────────────────────────────────────
const RAMP_LEN = 12;        // ramp run (m) — ≥ 12 per R3 → ≤ ~8.6° grade
export const DECK_ROAD = 4.7; // deck extends this far OUTWARD (north, toward road) from the wall
const DECK_BACK = 1.3;      // deck extends this far INWARD (south, into the wall line) to sit under the Jubala body (body centre ~0.8 m inward)
const EXTRUDE_DEPTH = DECK_ROAD + DECK_BACK; // 6.0 — extrude length along local +Z
// Deck ends "a little before" the NE corner (full wall ≈ 128.1 m): the easternmost
// tenant (ice cream, s=113) clears the sheer east edge with ~7 m to spare, and
// the NE corner stays open. Exported so fences.ts can suppress the buried
// north-wall fence segment that falls under the deck.
export const TERRACE_LEN = 120;

// Group origin: the wall's west end (point B). The ramp foot sits here; the
// flat deck runs east to the NE corner (point A).
const GROUP_X = WALL_WEST_X; // 204.9
const GROUP_Z = WALL_WEST_Z; // 236.4

export function buildParkCentralTerrace(scene: THREE.Scene): THREE.Mesh[] {
  const group = new THREE.Group();
  group.position.set(GROUP_X, 0, GROUP_Z);
  group.rotation.y = JROT;
  scene.add(group);

  // 2D profile in the local-X (along-wall length) × local-Y (height) plane.
  // West end (X=0, wall's west end / point B) is ground level; the surface
  // ramps up to TERRACE_H over RAMP_LEN, then stays flat to the NE corner (X=L).
  // The east edge (X=L) is a sheer drop to ground (R4). Extruding along +Z
  // sweeps each profile edge into a lateral face: ramp edge → sloped walkable
  // ramp, flat edge → deck top, east edge → sheer wall.
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(RAMP_LEN, TERRACE_H);
  shape.lineTo(TERRACE_LEN, TERRACE_H);
  shape.lineTo(TERRACE_LEN, 0);
  shape.closePath();

  const terrace = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: EXTRUDE_DEPTH, bevelEnabled: false }),
    new THREE.MeshStandardMaterial({ color: 0xB8B4AE, flatShading: true }),
  );
  // ExtrudeGeometry spans local Z [0, EXTRUDE_DEPTH]; shift so the deck runs
  // from -DECK_ROAD (road-side front, toward local -Z / outward) to +DECK_BACK
  // (wall-side back, just inward of the wall line, under the Jubala body).
  terrace.position.z = -DECK_ROAD;
  terrace.receiveShadow = true;
  group.add(terrace);

  // ── Metal grill — child of the terrace group, on the deck near the road edge
  // A small barrel-style grill standing on the deck, near the road-side (north)
  // edge. Inherits JROT from the group so it stays oriented to the wall. Local
  // X is along-wall (mid-terrace, east of the ramp), local Z is toward the road
  // (-Z); the grill sits just inboard of the road-side front edge.
  const grillX = 30;        // along-wall, mid-terrace flat region (ramp ends at X=12)
  const grillZ = -3.5;     // near the road-side edge (deck spans Z ∈ [-4.7, +1.3])
  const grillMat = new THREE.MeshStandardMaterial({
    color: 0x2A2A2E,
    metalness: 0.85,
    roughness: 0.35,
  });
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, 0.9, 16),
    grillMat,
  );
  barrel.position.set(grillX, TERRACE_H + 0.45, grillZ);
  barrel.castShadow = true;
  group.add(barrel);

  const grate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 0.06, 16),
    grillMat,
  );
  grate.position.set(grillX, TERRACE_H + 0.93, grillZ);
  grate.castShadow = true;
  group.add(grate);

  // ── Terrace-edge iron railing (relocated fence)
  // The iron perimeter fence (fences.ts) around Park Central's north wall was
  // buried inside the solid deck (its Y∈[0,1.3] sat below the deck top at 1.8).
  // Per the user's direction, the fence is relocated to the flat-deck front
  // edge at deck-top level: an iron railing along local X ∈ [RAMP_LEN,
  // TERRACE_LEN] at the road-side front edge (local Z = −DECK_ROAD), standing
  // on the deck top (Y base = TERRACE_H). The buried north-wall fence segment is
  // suppressed in fences.ts (see skipUnderDeck there). These railing meshes are
  // decorative (not returned for collision), matching the fence convention.
  const RAIL_H = 1.1;            // railing height above the deck
  const R_POST_SPACING = 2.2;
  const R_POST_THICK = 0.10;
  const R_RAIL_THICK = 0.06;
  const R_RAIL_DEPTH = 0.05;
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1c,
    roughness: 0.55,
    metalness: 0.65,
  });
  const edgeZ = -DECK_ROAD;          // road-side front edge
  const startX = RAMP_LEN;           // flat deck starts after the ramp
  const endX = TERRACE_LEN;          // deck east end

  // Rails: three horizontal bars spanning the flat-deck front edge.
  const railGeos: THREE.BufferGeometry[] = [];
  const railYs = [
    TERRACE_H + 0.08,
    TERRACE_H + RAIL_H * 0.55,
    TERRACE_H + RAIL_H - R_RAIL_THICK / 2,
  ];
  for (const ry of railYs) {
    const g = new THREE.BoxGeometry(endX - startX, R_RAIL_THICK, R_RAIL_DEPTH);
    g.translate((startX + endX) / 2, ry, edgeZ);
    railGeos.push(g);
  }
  const railMesh = new THREE.Mesh(mergeGeometries(railGeos, false)!, railMat);
  railMesh.castShadow = true;
  group.add(railMesh);

  // Posts: vertical bars every R_POST_SPACING along the edge, standing on the deck.
  const postGeos: THREE.BufferGeometry[] = [];
  const span = endX - startX;
  const numPosts = Math.max(2, Math.floor(span / R_POST_SPACING) + 1);
  for (let p = 0; p < numPosts; p++) {
    const x = startX + (span * p) / (numPosts - 1);
    const g = new THREE.BoxGeometry(R_POST_THICK, RAIL_H, R_POST_THICK);
    g.translate(x, TERRACE_H + RAIL_H / 2, edgeZ);
    postGeos.push(g);
  }
  const postMesh = new THREE.Mesh(mergeGeometries(postGeos, false)!, railMat);
  postMesh.castShadow = true;
  group.add(postMesh);

  return [terrace, barrel, grate];
}