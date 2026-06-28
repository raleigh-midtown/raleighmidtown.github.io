// Shared parking-surface constants for the multi-storey garage surface lots
// (parkingLots.ts) and the road-level parking apron (roadParking.ts). Keeping
// the ground-stack Y layer, asphalt colour, and stall cadence in one place keeps
// both renderers visually consistent and the stall texture tiling correct.

export const PARKING_Y     = 0.08;     // parking-surface layer in the ground Y-stack (CONCEPTS.md)
export const PARKING_COLOR = 0x2a2826; // dark asphalt, distinct from road asphalt (#444 in roads.ts)
export const STALL_WIDTH   = 2.5;      // world metres per stall column / stripe cadence
export const STALL_DEPTH   = 5.0;      // world metres per stall row
