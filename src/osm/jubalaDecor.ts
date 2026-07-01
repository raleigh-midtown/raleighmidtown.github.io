import * as THREE from 'three';
import { TERRACE_H } from './parkCentralTerrace';
import { makeStorefront } from './storefront';

/**
 * Jubala Coffee storefront — gold name sign, floor-to-ceiling glass panes,
 * red vertical blade sign, mounted on the shared Park Central north-wall
 * terrace (see parkCentralTerrace.ts).
 *
 * Built via the shared `makeStorefront` factory (src/osm/storefront.ts) so all
 * north-wall storefronts share one structure. The factory wraps the assembly in
 * a single `THREE.Group` (AGENTS.md: "Hand-placed scene props belong inside a
 * THREE.Group, positioned + rotated as a unit") placed at (JX, 0, JZ) and
 * rotated JROT once; every storefront mesh is a child with LOCAL coordinates,
 * where local -Z is the street-facing front.
 *
 * Wall reference: polygon edge (323.9,283.8)→(240.3,250.5) in scene space. That
 * edge runs at +21.7° (atan2(z,x)); its OUTWARD normal (away from the Park
 * Central bbox centroid, toward the street) is (0.370, 0, -0.929) = N 21.7° E.
 * Under three.js rotation.y(JROT), local -Z (the storefront front) faces
 * (-sin JROT, 0, -cos JROT); for that to equal the outward normal, JROT must
 * be -0.379 rad. (A +0.379 sign mirrors it to N 21.7° W — NW — and skews the
 * width 43.4° across the wall; that was the prior bug.)
 *
 * The storefront no longer carries its own entry terrace: the full-wall
 * Park Central terrace (parkCentralTerrace.ts) provides the raised platform,
 * so the body base sits on that shared deck at y = TERRACE_H. TERRACE_H is
 * imported from the terrace module so the two stay coplanar.
 *
 * Coordinate conventions: +X east, +Z south, +Y up.
 */

// ── Jubala storefront constants ─────────────────────────────────────────────
const JX   = 291;      // centre X  (from OSM node -78.6368506, 35.8359373)
const JZ   = 271.5;    // centre Z  (north wall at x=291 is z≈270.7)
const JW   = 14;       // width  (m) along wall
const JD   = 2;        // depth  (m) — thin facade slab
const JH   = 5;        // height (m) above terrace
const JROT = -0.379;   // wall angle — applied once to the group (−: front faces N 21.7° E)

// ── Main export ─────────────────────────────────────────────────────────────

export function buildJubalaDecor(scene: THREE.Scene): THREE.Mesh[] {
  // Delegated to the shared makeStorefront factory (src/osm/storefront.ts) so
  // Jubala and the new north-wall tenants share one structure. The factory
  // builds the body + glass panes + mullions + rails + gold name sign + red
  // "COFFEE" blade inside their own THREE.Group and returns the body mesh for
  // collision; glass/sign/blade are added to the scene but not returned (R5).
  const body = makeStorefront(scene, {
    worldX: JX,
    worldZ: JZ,
    rotY: JROT,
    terraceH: TERRACE_H,
    width: JW,
    height: JH,
    depth: JD,
    bodyColor: 0xC2B8A3,
    paneCols: 4,
    signText: 'JUBALA',
    signTextColor: '#C8A84B',
    blade: { text: 'COFFEE', bg: '#CC1111', fg: '#FFFFFF' },
  });
  return [body];
}
