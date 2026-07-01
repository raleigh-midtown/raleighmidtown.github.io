import * as THREE from 'three';
import { makeStorefront, StorefrontOpts } from './storefront';
import {
  JROT, TERRACE_H,
  WALL_WEST_X, WALL_WEST_Z, WALL_UX, WALL_UZ,
} from './parkCentralTerrace';

/**
 * North-wall storefronts flanking Jubala — four new tenants placed along Park
 * Central's north-wall terrace via the shared `makeStorefront` factory, sharing
 * Jubala's placement convention (world centre = wall west end + along-wall
 * distance · along-wall unit; `rotation.y = JROT`; body base at `y = TERRACE_H`;
 * local -Z is the street-facing front). See `jubalaDecor.ts` and
 * `parkCentralTerrace.ts` for the wall reference and coordinate conventions.
 *
 * Tenants, west → east (along-wall `s`, metres from the wall's west end):
 *   - Furniture rental: s = 50, width 14  (s ∈ [43, 57])   — west of Jubala
 *   - Jubala (unchanged): s = 93, width 14 (s ∈ [86, 100]) — in jubalaDecor.ts
 *   - Leasing office:    s = 105, width 10 (s ∈ [100, 110]) — east of Jubala
 *   - Ice cream:         s = 113, width 6  (s ∈ [110, 116])
 *   - One Medical:       s = 122, width 12 (s ∈ [116, 128]) — NE corner
 *
 * The three east-side storefronts form a contiguous row with Jubala (the user
 * asked for stores "continuously on left and right of Jubala"): they fit the
 * 28 m of flat deck east of Jubala (s ∈ [100, 128.1]) exactly, with One Medical
 * ending at the sheer east edge (s = 128.1, ~0.1 m clearance). The west side
 * carries the single furniture-rental storefront centred on the west flat deck.
 *
 * Coordinate conventions: +X east, +Z south, +Y up.
 */

interface Tenant {
  alongS: number;
  width: number;
  bodyColor: number;
  signText: string;
  signTextColor: string;
  signBgColor?: string;
  blade?: { text: string; bg: string; fg: string };
}

const TENANTS: Tenant[] = [
  {
    alongS: 50,
    width: 14,
    bodyColor: 0xC9B79C,        // warm beige facade
    signText: 'FURNITURE RENTAL',
    signTextColor: '#2F4F4F',   // dark slate on transparent
  },
  {
    alongS: 105,
    width: 10,
    bodyColor: 0xCBB89A,        // light stone
    signText: 'LEASING OFFICE',
    signTextColor: '#1A3A5F',   // dark blue on transparent
  },
  {
    alongS: 113,
    width: 6,
    bodyColor: 0xF4D7B8,        // warm cream
    signText: 'ICE CREAM',
    signTextColor: '#7A3F1A',   // brown on transparent
    blade: { text: 'ICE CREAM', bg: '#F0A0C0', fg: '#FFFFFF' },
  },
  {
    alongS: 122,
    width: 12,
    bodyColor: 0xE8ECEF,        // clinical off-white
    signText: 'ONE MEDICAL',
    signTextColor: '#FFFFFF',   // white on dark
    signBgColor: '#1F3A5F',
  },
];

/**
 * Build the four north-wall tenant storefronts (furniture rental, leasing
 * office, ice cream, One Medical) and add them to `scene`. Returns their body
 * meshes for collision registration, in west-to-east order.
 */
export function buildNorthWallStorefronts(scene: THREE.Scene): THREE.Mesh[] {
  const bodies: THREE.Mesh[] = [];
  for (const t of TENANTS) {
    const worldX = WALL_WEST_X + t.alongS * WALL_UX;
    const worldZ = WALL_WEST_Z + t.alongS * WALL_UZ;
    const opts: StorefrontOpts = {
      worldX,
      worldZ,
      rotY: JROT,
      terraceH: TERRACE_H,
      width: t.width,
      bodyColor: t.bodyColor,
      signText: t.signText,
      signTextColor: t.signTextColor,
    };
    if (t.signBgColor !== undefined) opts.signBgColor = t.signBgColor;
    if (t.blade !== undefined) opts.blade = t.blade;
    bodies.push(makeStorefront(scene, opts));
  }
  return bodies;
}