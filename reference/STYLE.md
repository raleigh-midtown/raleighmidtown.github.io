# Style Brief — Midtown Raleigh Low-Poly Cityscape

## Goal
A **stylized, low-poly** cityscape inspired by the Midtown / North Hills district
of Raleigh, NC. This is not a photorealistic or architecturally exact replica —
it should read as "clearly inspired by this real place" through massing,
proportion, and layout, not through surface detail.

## Reference area
North Hills / Midtown district, Raleigh NC, centered roughly at
35.839 N, -78.642 W. See `buildings.json` for the building list, estimated
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
- Don't use real building names/branding as in-scene labels/signage.
- Don't aim for real-world scale accuracy in the final render — proportions
  (height vs. footprint ratio) matter far more than literal meters.

## File reference
- `buildings.json` — building list with lat/lng, local x/z scene coordinates,
  estimated height/stories, footprint shape, and role-in-scene notes.
- `images/` — reference photos per building (see README.md for status/sourcing).
