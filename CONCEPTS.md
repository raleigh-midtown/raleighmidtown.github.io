# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Scene entities

### Midtown Park
The open central lawn the scene revolves around. Bounded approximately by `x[241..346] z[201..270]` in scene coordinates, but partially overlapped on its north and south edges by adjacent buildings (Midtown Green to the north, Park Central to the south), so the **usable open lawn** is narrower than the OSM polygon suggests — roughly `z[225..270]` once building footprints are excluded.

### Midtown Green
The large residential apartment complex occupying the north side of Midtown Park. Footprint `x[229..369] z[147..225]`. Tagged in OSM as `building=apartments`, not `leisure=park` — meaning it does **not** produce any greenspace geometry, despite the misleading name.

### Park Central
Mixed-use building bordering Midtown Park to the south, footprint `x[188..324] z[236..327]`. Its north wall is the south boundary of the usable open lawn.

### Chuy's patio
Decorative outdoor seating deck east of the Chuy's restaurant building. Centered around `(251, _, 211)`, at the NW corner of Midtown Park. Geometry: raised deck, three orange barrel arches running N–S, a continuous flat roof slab capping the arches, perimeter walls on N/W/S, and approach steps on the east side.

### Park stage
Performance pavilion at the east end of Midtown Park, positioned across the lawn from Chuy's patio. Built inside a `THREE.Group` so the whole pavilion can be re-oriented with a single `rotation.y`; currently rotated `-π/2` to face west.

### Road-level parking
Ground-level surface parking placed along the street-facing frontage of Park & Market North Hills — the single longest perimeter edge whose outward normal points `+Z` (toward The Eastern and the frontage road). An asphalt apron with painted stall stripes (shared `makeStallTexture`, sitting on the `y = 0.08` parking surface layer) carries a perpendicular row of low-poly parked cars (one `InstancedMesh`, white base material tinted per-instance via `setColorAt`). Offset outward by a sidewalk gap and bounded in depth so it leaves walking space against the building and keeps the road clear. Distinct from the multi-storey garage surface lots (the unnamed `building=parking` footprints rendered by `buildParkingLots`). Decorative — the car mesh is never added to the BVH, so the character walks through it.

## Coordinate conventions

### Scene XZ frame
World coordinates are local metres relative to the bbox center `(CENTER_LON=-78.640, CENTER_LAT=35.8385)` projected through UTM Zone 17. `+X` is east, `+Z` is south (because `projectLonLat` negates northing). `+Y` is up. The character controller treats `−Z` as "forward" (W key), and Mixamo character GLBs export facing `+Z`, so the character mesh is wrapped in a Group rotated `π` around Y so the controller's yaw convention is preserved.

### Ground layer Y values
Coplanar ground geometries are separated vertically to avoid z-fighting from high altitudes (aerial view):
- ground plane: `y = 0`
- greenspace (parks, grass): `y = 0.02..0.04`
- sidewalk: `y = 0.05`
- parking surface: `y = 0.08` (rendered above sidewalk, below road, to prevent z-fighting at aerial altitude)
- road asphalt: `y = 0.10`
- lane stripe: `y = 0.14`

New ground-level layers must slot into this stack.

### View modes
The CameraRig operates in two named modes — `ground` (chase cam following the character) and `aerial` (top-down bird's-eye with drag-to-pan and wheel-zoom). Switching is exposed via the `#view-toggle-btn` UI button. The `aerialPan` offset is reset whenever the mode flips to aerial.

## Character

### Air state
A character is `grounded` or `airborne`. Transitions: jump take-off (`grounded → airborne`), landing-on-surface (`airborne → grounded`), and walk-off-edge (`grounded → airborne` when the ground probe shows clearance > land-skin). Only the take-off transition enters the tuck-pose blend; walk-off transitions do not. Mid-air, horizontal WASD input still affects velocity (default game-feel), but locomotion mixer actions are suspended so they don't compete with the manual bone overlay.

### Posed bones
The subset of Mixamo skeleton bones the controller writes directly during airborne state, layered on top of the mixer's locomotion clip. The overlay slerps from each bone's bind quaternion toward a hand-tuned tuck target during ascent, and from the current (post-mixer) pose back to bind on landing — see [docs/solutions/design-patterns/mixamo-bone-overlay-on-mixer-driven-animation.md](docs/solutions/design-patterns/mixamo-bone-overlay-on-mixer-driven-animation.md) for the full rules.
