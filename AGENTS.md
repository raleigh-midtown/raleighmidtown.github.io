# AGENTS.md

A walkable Three.js explorer of Midtown Raleigh built from OpenStreetMap data. Vite + vanilla TypeScript, no framework. Character locomotion via Mixamo skeleton retargeted from Soldier's animations.

## Stack

- **Vite + vanilla TypeScript** — no framework, `npm create vite@latest -- --template vanilla-ts`
- **Three.js** with addons from `three/addons/` only (never `three/examples/`)
- **three-mesh-bvh** for character collision (capsule shapecast against merged building geometry, plus a downward raycast for ground detection during jumps)
- **proj4js (UTM Zone 17N)** for WGS84 → local-meter projection of OSM lon/lat
- **osmtogeojson** for Overpass-JSON → GeoJSON conversion
- **Vitest** for tests — `npx vitest run`

Lazy-loaded at OSM-load time: `proj4js`, `osmtogeojson`. Eagerly loaded: `three`, `three-mesh-bvh`.

## Repository layout

```
threejs-midtownraleigh/
├── index.html                           # entry; controls hint, view-toggle button, loading overlay
├── public/
│   ├── models/
│   │   ├── character.glb                # Mixamo Michelle (visuals + skeleton; no animations)
│   │   └── animations.glb               # Three.js Soldier (Idle/Walk/Run clips for retarget)
│   └── data/midtown-fallback.geojson    # offline fallback when Overpass is rate-limited / down
├── src/
│   ├── main.ts                          # scene setup, animate loop, system wiring
│   ├── scene/
│   │   ├── renderer.ts                  # WebGLRenderer + SRGBColorSpace + resize
│   │   ├── environment.ts               # ground plane, lighting, fog, mobile banner
│   │   ├── cameraRig.ts                 # chase-cam + aerial-cam + drag/zoom
│   │   ├── buildingMaterials.ts         # memoized canvas-textured materials by height band
│   │   └── toon.ts                      # toon helpers (procedural fallback character only)
│   ├── osm/
│   │   ├── fetch.ts                     # Overpass query + retry + fallback (cache key v2)
│   │   ├── project.ts                   # proj4js WGS84 → UTM 17N (BBOX + CENTER)
│   │   ├── extrude.ts                   # Shape + ExtrudeGeometry + merge → single BufferGeometry
│   │   ├── roads.ts                     # mitered ribbon roads with lane-stripe atlas
│   │   ├── greenspace.ts                # parks, grass polygons
│   │   ├── streetscape.ts               # sidewalk band around each building, tree placement w/ road & building rejection
│   │   ├── trees.ts                     # InstancedMesh tree forest
│   │   ├── fences.ts                    # iron perimeter fences around buildings
│   │   ├── parkingLots.ts               # flat asphalt surface lots + isUnnamedParkingGarage predicate (shared with extrude.ts)
│   │   ├── roadParking.ts               # road-level parking apron + angled parked cars (Park & Market North Hills frontage)
│   │   ├── parkedCars.ts                # low-poly parked-car geometry + per-instance colour palette
│   │   ├── benches.ts                   # Midtown Park benches + street benches for named buildings
│   │   ├── chuysDecor.ts                # Chuy's patio (3 barrel arches + flat roof + columns)
│   │   ├── parkStage.ts                 # Midtown Park performance stage (Group-wrapped, rotatable)
│   │   ├── labels.ts                    # building name sprites (proximity-faded)
│   │   ├── shopSigns.ts                 # POI sprites for shops
│   │   ├── buildingDetails.ts           # balconies, railings, doors
│   │   └── util/
│   │       ├── geom.ts                  # shared polygon geometry helpers (pointInRing, isInsideAnyBuilding, polygonCentroid, edgeOutwardNormal, edgeInwardNormal, collectBuildingBoxes, findBuildingByName)
│   │       ├── osmPredicates.ts         # shared OSM tag predicates (isUnnamedParkingGarage)
│   │       ├── shapes.ts                # ring → ShapeGeometry helpers (world-metre UVs)
│   │       └── stallTexture.ts          # CanvasTexture stall-stripe painter (shared by parkingLots + roadParking)
│   ├── character/
│   │   ├── loader.ts                    # GLTFLoader + Group-wrapper (Mixamo faces +Z; controller wants -Z)
│   │   └── controller.ts                # state machine (idle/walk/run × grounded/airborne), jump physics, tuck-pose blend
│   ├── controls/
│   │   ├── keyboard.ts                  # key set + edge-triggered consumeJump()
│   │   └── gyroscope.ts                 # DeviceOrientationEvent w/ iOS permission gate
│   └── collision/
│       └── bvh.ts                       # CollisionSystem: capsule shapecast + raycastDown/raycastUp
├── docs/
│   ├── plans/                           # ce-plan output (one plan per feature)
│   └── solutions/                       # documented learnings — see "Documented knowledge" below
├── CONCEPTS.md                          # shared domain vocabulary (scene entities, coordinate conventions, character states)
└── STRATEGY.md                          # product strategy and roadmap
```

## Coordinate conventions

Scene is in metres relative to `CENTER_LON=-78.640, CENTER_LAT=35.8385`, projected through UTM Zone 17N. **+X is east**, **+Z is south** (because `projectLonLat` negates northing), **+Y is up**. The character controller treats **-Z as forward** (W key), and Mixamo GLBs export facing **+Z**, so the character mesh is wrapped in a Group rotated 180° around Y so the controller's yaw convention is preserved.

Coplanar ground layers are vertically separated to avoid z-fighting from the aerial view's 220 m altitude:

| Layer | Y |
|---|---|
| ground plane | 0 |
| greenspace | 0.02–0.04 |
| sidewalk | 0.05 |
| parking surface | 0.08 |
| road asphalt | 0.10 |
| lane stripe | 0.14 |

Hard-coded throughout `src/osm/{roads,greenspace,streetscape,parkingLots}.ts`. New ground-level layers must slot into this stack.

See [CONCEPTS.md](CONCEPTS.md) for full glossary including named scene entities (Midtown Park, Midtown Green, Park Central, Chuy's patio, Park stage) and character state semantics.

## Documented knowledge

`docs/solutions/` — captured learnings from prior sessions, organized by category with YAML frontmatter (`module`, `tags`, `problem_type`). Relevant when implementing features, debugging issues, or making decisions in documented areas. Existing entries:

- `architecture-patterns/scene-object-placement-and-orientation.md` — wrap composite props in `THREE.Group` for cheap re-orientation; cross-check hardcoded coords against OSM building footprints; verify spatial layout with top-down Playwright screenshots
- `design-patterns/mixamo-bone-overlay-on-mixer-driven-animation.md` — five rules for layering hand-tuned bone poses (jump tuck, crouch, lean, etc.) over `AnimationMixer`-driven Mixamo locomotion

## Running

```bash
npm install            # first time
npm run dev            # Vite dev server (default http://localhost:5173/)
npm run build          # production build to dist/
npm run preview        # serve dist/
npx vitest run         # full test suite
```

Two pre-existing test failures in `src/osm/__tests__/fetch.test.ts` from an earlier cache-key bump (`midtown-osm-cache` → `midtown-osm-cache-v2`); unrelated to current feature work.

## Plans

`docs/plans/` — implementation plans created by `/ce-plan`. Plans are decision artifacts (intent, requirements, units, test scenarios), not execution scripts. Execution progress is derived from git, not stored in the plan body.

## Conventions

- **Scratch fields, not per-frame allocations.** Camera, controller, collision, and main-loop code all use reusable `Vector3` / `Quaternion` / `Euler` scratch fields. Any new per-frame work that needs a `new Vector3()` should hoist it to a constructor-time scratch field instead. (`docs/solutions/architecture-patterns/...` and the cameraRig refactor are the canonical examples.)
- **Hand-placed scene props** belong inside a `THREE.Group`, positioned + rotated as a unit. Direct `scene.add()` of multiple meshes with hardcoded world coordinates is the anti-pattern; see the documented-knowledge entry above.
- **Tests with mocked collision** must pass a mock that implements `raycastDown` and `raycastUp`, not the boolean `true`. The controller branches on `collision && verticalVelocity > 0` for overhead clamp; a bare boolean silently skips that branch.

## Debug hook

`main.ts` exposes `window.__three = { scene, camera, renderer }` only when `import.meta.env.DEV` — used by Playwright scripts (`page.evaluate(...)`) for headless inspection. Stripped from `npm run build` output.
