# Style Brief — Midtown Raleigh Low-Poly Cityscape

## Goal
A **stylized, low-poly** cityscape inspired by the Midtown / North Hills district
of Raleigh, NC. This is not a photorealistic or architecturally exact replica —
it should read as "clearly inspired by this real place" through massing,
proportion, and layout, not through surface detail.

## Reference area
North Hills / Midtown district, Raleigh NC, centered roughly at
35.839 N, -78.642 W. See `buildings.json`, `roads.json`, `park.json`, and
`shops.json` for the full layout: building list, named roads with
intersections, the park's internal zones/paths/features, and named shop
frontages.
heights, footprints, and local x/z positions to place meshes in scene-space.

## Visual style
- **Geometry**: flat-shaded low-poly. Buildings are simple extruded boxes /
  stacked boxes. No curved surfaces, no fine architectural ornament.
- **Materials**: `MeshStandardMaterial` or `MeshToonMaterial`, no photo
  textures on building facades. Flat color fills + maybe one emissive
  accent color for windows at night.
- **Palette** (suggested starting point — adjust to taste):
  - Glass towers: cool grey-blue (`#7FA8C9`, `#5C7E99`)
  - Concrete / panel midrises: warm grey (`#A8A29A`, `#8C8780`)
  - Residential brick/balcony blocks: muted terracotta (`#B97A56`)
  - Low retail blocks: mixed light tones (`#D8CFC0`, `#C2B8A3`)
  - Windows (if separated as own material): pale yellow / warm white emissive
  - Ground / streets: dark neutral (`#2E2E33`) with lighter sidewalks
- **Windows**: do NOT model individual window meshes. Use one of:
  - A repeating tiled texture mapped onto the facade, or
  - `InstancedMesh` of a single small plane, repeated across a grid
- **Lighting**: soft ambient + one directional "sun" light with shadows.
  Late-afternoon angle (long shadows) reads well for a stylized skyline.
- **Roofs**: mostly flat; a couple of buildings can have a slight setback
  or single roof "cap" box for variation. Avoid pitched roofs except on the
  low retail cluster.

## Roads, intersections & streetscape
- Each road in `roads.json` now has a `lane_markings` block (center line
  type, lane dividers, edge lines, crosswalks, stop bars) — render these as
  thin emissive or bright-white decal strips along the road surface, not
  separate geometry. Respect per-road differences: arterials get a double
  yellow center + dashed dividers, locals get a single dashed yellow line,
  and `midtown_internal_loop` (the park's pedestrian lane) gets **no**
  vehicle lane lines at all — distinguish it with a paving texture/color
  change instead.
- Roads are defined in `roads.json` as `path_xz` point arrays — build them as
  a flat extruded ribbon following those points, not as straight segments
  between endpoints only. Slight curves matter for read.
- Use 2 road materials: a darker arterial color for `six_forks_rd` /
  `lassiter_mill_rd`, and a lighter, narrower one for local/pedestrian roads
  like `midtown_internal_loop`.
- At each intersection in `roads.json`, place a simple traffic light prop
  (a thin pole + 3 stacked colored boxes) only where `has_traffic_light`
  is `true`; use a small stop-sign prop (octagon on a pole) elsewhere.
  Don't add lights/signs anywhere not listed in `intersections`.
- Render street name signage per each road's `label` block in `roads.json` —
  most roads label at intersections only; the internal park loop uses small
  pedestrian wayfinding signs instead of vehicle street signs.
- Sidewalks: a thin, slightly raised strip running parallel to each road
  path, lighter color than the road surface.

## Massing / variety rules
- 1 tall hero tower (One North Hills Tower) — tallest point in the scene,
  placed off-center.
- 1 twin-tower silhouette (Capital Towers) — repeat a single tower mesh,
  mirrored, with a gap between.
- 2–3 mid-rise blocks (Landmark at North Hills, Midtown Green Apartments) —
  boxy, some with small balcony protrusions.
- A scattered low-rise cluster (North Hills retail district) — several
  small 1–3 story boxes of varying width, irregular spacing, for street-level
  texture and walkability.
- Fill remaining scene space with **generic filler buildings**: reuse the
  same handful of base meshes at varied scale/color rather than modeling
  unique buildings for every lot. This is what real low-poly city scenes do —
  5–6 unique "hero" buildings, dozens of repeated/varied filler boxes.

## What NOT to do
- Don't try to match exact architectural details from the reference photos
  (window mullions, signage, materials close-up).
- Don't use real building/restaurant names/branding as in-scene signage —
  exception: real street names ARE intended to appear on street signs per
  `roads.json`'s `label` blocks, since street identity is part of what makes
  the layout recognizable.
- Don't aim for real-world scale accuracy in the final render — proportions
  (height vs. footprint ratio) matter far more than literal meters.

## File reference
- `buildings.json` — building list with lat/lng, local x/z scene coordinates,
  estimated height/stories, footprint shape, rotation estimate, and
  role-in-scene notes.
- `roads.json` — named roads as multi-point paths, label/signage guidance,
  and intersections with traffic-light vs. stop-sign flags.
- `park.json` — Midtown Park's zones, internal paths, and individual
  features (fountain, benches, lights, planters, trees).
- `shops.json` — named restaurant/storefront frontages plus generic filler
  retail blocks.
- `images/` — reference photos per building (see README.md for status/sourcing).
