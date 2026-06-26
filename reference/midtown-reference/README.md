# Midtown Raleigh Reference Pack — for Claude Code

This folder is meant to be dropped into your Three.js project and pointed at
from a Claude Code session, e.g.:

> "Use the reference pack in `reference/midtown/` to build a low-poly
> cityscape. Read STYLE.md for the visual direction and the JSON files for
> layout."

## Contents

- **`buildings.json`** — 12 named buildings: real lat/lng, flattened local
  x/z position (meters), estimated height/story count, footprint shape,
  facade type, rotation estimate, and a `role_in_scene` hint. Includes
  office towers (One North Hills Tower, Bank of America Tower, North Hills
  Tower II), residential towers (Capital Towers, The Eastern), mid-rise
  apartment blocks (Midtown Green, Park & Market, Park Central, The
  Dartmouth), a distinctive low-rise landmark (RH Raleigh showroom), and the
  general retail core cluster.
- **`roads.json`** — named roads (Six Forks Rd, Lassiter Mill Rd, Park at
  N Hills St, St Albans Dr, Dartmouth Rd, plus the internal pedestrian loop)
  as multi-point `path_xz` curves, each with a `label` block describing how
  to render street signage. Also includes **intersections**, each flagging
  whether it has a traffic light or a stop sign.
- **`park.json`** — Midtown Park broken into **zones** (central lawn, shaded
  grove, plaza promenade, play edge), **paths** (multi-point walkways through
  the park), and **features** (fountain/centerpiece, bench clusters, string
  lights, planters, scattered trees) — each with its own position, not just
  one big park footprint.
- **`shops.json`** — named ground-floor restaurants/storefronts (STIR, Yard
  House, RH Rooftop Restaurant, Village Tavern, Leo's Italian Social, Sixty
  Vines, Barking Dog) plus a few generic filler retail blocks for variety.
- **`STYLE.md`** — the art direction brief: palette, materials, lighting,
  massing rules, road/streetscape guidance, what to avoid.
- **`images/`** — reference photos, flat list, named
  `<building_id>_01.jpg`, `_02.jpg` per `buildings.json`.

All four JSON files share the **same `local_xz` coordinate system**
(origin at lat 35.8390, lng -78.6420) — load all of them and place every
layer (buildings, roads, intersections, park zones/paths/features, shops)
into one consistent scene without any unit conversion.

### ⚠️ About data accuracy

Building names, road names, and restaurant/shop names are real. **Positions,
footprint dimensions, rotations, road curve points, and the internal park
layout are reasonable approximations** built from the general known layout
of the area — not surveyed or GIS-accurate data. They're meant to give
Claude Code enough real structure to build a believable, recognizable scene,
not to be dimensionally exact. For precise real-world layout, check Google
Maps satellite view directly over `origin_lat`/`origin_lng`.

## ⚠️ About the images folder

This sandbox doesn't have internet access, so I couldn't actually download
the building photos for you — the `images/` folder is currently empty for
most entries. You'll need to add them yourself (takes about a minute per
building):

1. Search the building name + "Raleigh NC" on Google Maps, or use the link
   in `buildings.json`'s original entries if present.
2. Save 1–2 useful images — ideally one straight-on facade shot and one
   wider/aerial-ish shot.
3. Save into `images/` using the filenames already listed in
   `buildings.json`'s `images` array for that building.

Buildings with empty `images` arrays in `buildings.json` (Bank of America
Tower, North Hills Tower II, The Eastern, Park & Market, Park Central, The
Dartmouth, RH Raleigh) don't have filenames pre-assigned — pick a consistent
naming convention (e.g. `<id>_01.jpg`) and add the paths into that
building's `images` array yourself once saved.

If you'd rather skip real photos entirely, that's fine — the JSON files and
`STYLE.md` alone are enough for Claude Code to generate the scene; images
are only useful for fine-tuning silhouette/color afterward.

## Suggested first prompt to Claude Code

```
I have a reference pack at reference/midtown/ for a Three.js scene.
Read buildings.json, roads.json, park.json, shops.json, and STYLE.md,
then generate a low-poly cityscape:
- roads as extruded ribbon geometry following each road's path_xz points,
  with street name labels per the label block in roads.json
- traffic lights only at intersections where has_traffic_light is true,
  stop signs at the others
- all buildings from buildings.json positioned via local_xz and rotated
  by rotation_deg_est
- Midtown Park built from park.json's zones/paths/features, not just a
  flat green rectangle
- named shop frontages from shops.json on the ground floor of the retail
  core
- flat-shaded materials per the palette in STYLE.md
- instanced window geometry, not individual meshes
- soft ambient + directional sun light with shadows
```
