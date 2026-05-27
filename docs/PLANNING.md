# Eagle Eye — Planning Doc

Personal golf GPS rangefinder. Built for the author and friends. Sideloaded as an APK. No ads, no signup, no nags. Big buttons.

## Goals

- **Replace existing golf-GPS apps for personal use.** The author currently uses commercial apps (18Birdies / theGrint) and is frustrated by ad interstitials and feature creep. Eagle Eye exists to give a quiet, glanceable rangefinder experience.
- **Work fully offline at the course.** Cell signal is unreliable on most golf courses. Distances, satellite map, and vector map all work without connectivity once a course is installed.
- **Cover specific local courses first.** Bundled course set covers the author's home courses. Other courses can be added via in-app discovery later.
- **Be shareable with friends.** Sideload an APK over Drive/Signal. No Play Store account, no review process.
- **Stay simple enough to debug without a test suite.** Architecture (deep modules, narrow interfaces) is the primary debugging aid.

## Non-goals

- Multi-user accounts, social features, leaderboards.
- Real-time pin location (impossible without course operator integration).
- Universal course coverage on launch. Five well-modeled courses beats five thousand badly-modeled ones.
- Live, in-round score entry. Author wears a glove on phone hand and prefers paper scorecards. Scores are entered post-round only.
- Per-shot tracking beyond tee shots in MVP. Tee shot capture is opt-in, two big buttons, dismissible.
- Tee box selection / posted-yardage display in MVP. Distances are to the pin and green polygon; same number regardless of tee.
- Background GPS / continuous tracking. Foreground only.

## MVP scope

A single "MVP done" line at the end of Phase 4 below. The MVP delivers:

- Distance to pin, front of green, back of green — live, three big numbers stacked at the top of the screen.
- Pin position defaults to the green's centroid; tap on the green polygon in the map to move it. Persists per hole within the current round.
- Manual hole navigation — Prev / Next buttons. Hole header tappable to jump to any hole 1–18.
- Map view (vector + satellite, toggleable on the map). Both layers pre-downloaded per course for offline use.
- Tee shot capture: "Start Tee Shot" → "Mark Tee Shot" two-tap flow. Dismissible. Distance computed.
- Round persistence: SQLite-backed, single active round at a time, resumes on app open.
- Post-round scorecard entry: one screen, 18 boxes, save.
- Round history: list of past rounds with date / course / score.

## Tech stack

| Layer                 | Choice                             | Reason                                                                                                              |
| --------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Framework             | Expo (managed) + custom dev client | Native modules accessible via config plugins; managed-workflow ergonomics.                                          |
| Language              | TypeScript, strict mode            | Geospatial code is null-and-edge-case heavy; types are cheap and catch real bugs.                                   |
| Map renderer          | `@maplibre/maplibre-react-native`  | Free, MIT-licensed, supports both vector and raster tiles. No API-key lock-in. Offline-pack API hides tile caching. |
| Vector tile source    | OpenFreeMap                        | Free hosted vector tiles. Swappable to Protomaps or self-hosted with no code-architecture change.                   |
| Satellite tile source | ESRI World Imagery                 | Free, no API key, high quality. Mapbox Satellite is the fallback if ESRI ever changes terms.                        |
| Location              | `expo-location`                    | Foreground only, 1 Hz, balanced accuracy. Plenty for golf.                                                          |
| Storage               | `expo-sqlite` + Drizzle ORM        | Typed schema, typed queries, migrations. Drizzle is internal to data modules — never leaks into interfaces.         |
| State                 | Zustand                            | Tiny, no provider boilerplate. One store per concept (`useRoundStore`, `useSettingsStore`).                         |
| Routing               | Expo Router (file-based)           | Conventions match wider ecosystem. Type-safe routes.                                                                |
| Geo math              | Turf.js (`@turf/turf`)             | Tree-shakeable. Wrapped by `lib/geo` — Turf never appears in `lib/geo`'s interface.                                 |
| Build / distribution  | EAS Build → preview APK            | Free tier covers hobby use. Sideload via Drive/Signal.                                                              |

See [ADR-005](adr/0005-maplibre-offline-packs.md) for the renderer choice rationale.

## Architecture

### Deep modules

Modules are grouped by domain concept, not by layer. Each one earns its place by the deletion test: removing it would scatter complexity across multiple callers. Interfaces are small; implementations are substantial. Internal seams (Drizzle, Turf, MapLibre's native APIs) are not exposed through the external interface.

| Module       | What it owns                                                                                                                                           | External interface (rough)                                                                                                                                                                    | Internal seams                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `lib/geo`    | Pure geospatial computation.                                                                                                                           | `distanceMeters(a, b)`, `nearestPointOnPolygon(here, poly)`, `farthestPointOnPolygon(here, poly)`, `centroid(poly)`, `pointInPolygon(pt, poly)`, `lzInitPositions(tee, greenCentroid, count)` | Turf.js                                                |
| `lib/course` | Course data loading and normalization. Shape is source-agnostic — bundled JSON, Overpass fetch, and future ML inference all produce the same `Course`. | `loadBundledCourse(slug)`, `loadInstalledCourse(id)`, `findNearby(here, radiusKm)` (Phase 5), `addCourseFromOverpass(osmId)` (Phase 5), `normalize(osmElements)` (shared with build script)   | OSM tag parsing, Drizzle queries, Overpass HTTP client |
| `lib/round`  | Round lifecycle. Owns the single-active-round invariant. State machine: `idle → active → ended`.                                                       | `startRound(courseId)`, `endRound(round, scores)`, `useActiveRound()`, `setPin(holeNum, latLng)`, `getHoleState(round, holeNum)`, `history()`                                                 | Drizzle, Zustand store, stale-round detection          |
| `lib/tiles`  | Offline tile management. Wraps MapLibre's offline-pack API for both raster (satellite) and vector layers.                                              | `prefetchForCourse(courseId)`, `prefetchStatus(courseId)`, `retryPrefetch(courseId)`, `vectorStyle`, `satelliteStyle`                                                                         | MapLibre's offline manager, URL templates              |
| `lib/shots`  | Tee shot recording. Small but earning its place — owns the in-flight "recording" state and the GPS snapshot logic.                                     | `startTeeShot(holeNum)`, `markTeeShot()`, `cancelTeeShot()`, `useCurrentTeeShot()`                                                                                                            | GPS sampling, Drizzle, in-flight Zustand state         |

#### Seam status

- **`lib/geo`**: no seam. Pure in-process computation. Interface is the test surface (if tests ever exist).
- **`lib/course`**: hypothetical seam until Phase 5. From Phase 5 it has two adapters (bundled-JSON + Overpass) and the seam becomes real. The shared `normalize()` function exists from Phase 1 — the Node build script and the in-app Overpass path both call it.
- **`lib/round`**, **`lib/tiles`**, **`lib/shots`**: single-adapter modules. SQLite, MapLibre, GPS each have only one production implementation each. No port-and-adapter indirection until a second implementation is justified.

### Repo layout

```
eagle-eye/
├── app/                      # Expo Router screens. Thin — delegate to lib/.
│   ├── _layout.tsx
│   ├── index.tsx             # Home (course picker or active round)
│   ├── round/
│   │   └── [hole].tsx        # The hole screen
│   ├── round/scorecard.tsx   # Post-round entry
│   ├── courses/add.tsx       # Find Nearby (Phase 5)
│   └── settings.tsx
├── lib/
│   ├── geo/
│   ├── course/
│   │   ├── index.ts          # External interface
│   │   ├── normalize.ts      # Shared with scripts/build-course.ts
│   │   └── schema.ts         # Drizzle schema for courses
│   ├── round/
│   │   ├── index.ts
│   │   └── schema.ts
│   ├── tiles/
│   └── shots/
├── components/               # Leaf UI primitives (Button, NumberDisplay, etc.)
├── db/
│   └── index.ts              # Drizzle client setup
├── courses/                  # Bundled course JSON (committed, version-controlled)
│   ├── presidio.json
│   └── ...
├── scripts/
│   └── build-course.ts       # Node script: OSM ID → courses/<slug>.json
├── docs/
│   ├── PLANNING.md           # This file
│   └── adr/                  # Architecture Decision Records
├── CONTEXT.md                # Domain language glossary
└── ...
```

Screens live in `app/` and stay thin. If a screen file grows past ~200 lines doing math or data parsing inline, that's a signal to push logic down into a module.

## Data model

### Course (Tier 0/1 mandatory, Tier 2 optional)

```ts
type Course = {
  id: string // slug, e.g., "pebble-beach"
  name: string
  source: 'bundled' | 'overpass' | 'ml'
  bounds: BBox // for tile prefetch
  holes: Hole[] // length 9 or 18
  metadata: { addedAt: number; osmId?: string }
}

type Hole = {
  num: number // 1-18
  par: number
  green: Polygon // Tier 0 — mandatory
  tee: Point // Tier 1 — mandatory (used for map auto-zoom and future tee-shot start)
  fairway?: Polygon // Tier 2 — optional, rendered if present
  hazards?: Hazard[] // Tier 2 — optional
}
```

A course is "valid" if every hole has a green and a tee. The Overpass fetch path enters a tap-to-fix flow if any hole is missing a green; the user taps the green on satellite imagery, the polygon is auto-traced or manually placed, and the course is then valid. See [ADR-003](adr/0003-source-agnostic-course-data.md).

### Round state (SQLite, single-active-round)

```sql
courses        (id, name, source, raw_data_blob, bounds, added_at)
rounds         (id, course_id, started_at, ended_at, current_hole, notes)
hole_states    (round_id, hole_num, pin_lat, pin_lng, score)
tee_shots      (round_id, hole_num, start_lat, start_lng, end_lat, end_lng, distance_m, recorded_at)
```

**Invariant:** at most one row in `rounds` where `ended_at IS NULL`. Enforced inside `lib/round`. See [ADR-002](adr/0002-sqlite-source-of-truth.md).

## Key UX flows

### Cold launch

1. App starts.
2. `lib/round.activeRound()` checks SQLite for an active round.
3. If yes → navigate directly to `/round/<current_hole>`. (Stale-round banner if started_at > 24h ago.)
4. If no → home screen with course picker.

### Start a round

1. Home → pick course from bundled list → "Start Round."
2. `lib/round.startRound(courseId)` inserts row, sets current_hole = 1.
3. Navigate to `/round/1`.

### Hole screen (the main playing view)

Layout: rangefinder-first. See ASCII mock below.

```
┌──────────────────────────┐
│  Hole 5  ·  Par 4        │  ← tap header → 1-18 grid picker
├──────────────────────────┤
│                          │
│      F   142             │  ← Front of green (closest point on polygon)
│      P   152  ✎          │  ← Pin (defaults to centroid, tap-on-map to move)
│      B   165             │  ← Back of green (farthest point on polygon)
│                          │
├──────────────────────────┤
│                          │
│       [ MAP VIEW ]       │  ← green + pin marker + user location
│                          │  ← tap on green to set pin
├──────────────────────────┤
│  ◀ Prev      Next ▶      │  ← manual hole nav (no auto-detect)
│  ━━━━━━━━━━━━━━━━━━━━━━  │
│   ⛳  Start Tee Shot      │  ← dismissible; becomes Mark Tee Shot after tap
└──────────────────────────┘
```

- Distance updates every GPS tick (~1 Hz) via `lib/geo`.
- Map style toggle (vector / satellite) is a small button on the map itself, not in settings.
- "Next" past hole 18 navigates to the post-round scorecard.

### Tee shot recording

1. User taps "Start Tee Shot" on the hole screen.
2. `lib/shots.startTeeShot(holeNum)` records current GPS as `start_lat/lng`. Button changes to "Mark Tee Shot."
3. User walks to ball, taps "Mark Tee Shot." `lib/shots.markTeeShot()` records current GPS as `end_lat/lng`, computes distance via `lib/geo`, persists row.
4. Button returns to "Start Tee Shot" (next hole's tee shot is independent).

If user navigates away mid-recording, the in-flight state is preserved in Zustand + SQLite; on return the button still says "Mark Tee Shot."

### End a round

1. User taps "Next" past hole 18 → automatic scorecard screen.
2. Or: user taps "End Round" from a menu (deliberately small/hidden to prevent misclicks).
3. Scorecard screen: 18 boxes, enter scores from paper card, "Save."
4. `lib/round.endRound(round, scores)` sets `ended_at = now()`, writes scores, navigates home.

### Add a course (Phase 5)

1. Home → "Add Course" → "Find Nearby."
2. `lib/course.findNearby(here, 50km)` queries Overpass for `leisure=golf_course` within radius.
3. List of matches with name + distance.
4. Tap one → `lib/course.addCourseFromOverpass(osmId)` fetches full hole data, normalizes via `lib/course/normalize.ts`, inserts row.
5. If any hole is missing a green polygon, tap-to-fix flow walks the user through dropping pins on satellite imagery.
6. `lib/tiles.prefetchForCourse(id)` kicks off in background. Progress bar visible.

## Phasing plan

Vertical-slice phasing. Each phase ends with something testable on a real round.

### Phase 0 — Foundation + risk spike (1-2 days)

- **Risk spike (~1 day).** Three validations before sinking weeks in:
  - OSM data quality for the author's home course. Pull via Overpass, eyeball in geojson.io. If green polygons are missing or holes lack `ref` tags, the plan adapts.
  - ESRI World Imagery serving tiles to MapLibre RN without auth/CORS issues. Throwaway 50-line Expo app.
  - MapLibre offline-pack API on Android with custom dev client. Same throwaway app.
- Write `CONTEXT.md` with domain glossary.
- Write `docs/adr/0001` through `docs/adr/0008` (already drafted from grill outcomes — see below).
- Expo TS scaffold, install dependencies (Drizzle, Zustand, Turf, MapLibre RN, expo-location, expo-sqlite).
- Custom dev client built and installed on phone.

### Phase 1 — First playable rangefinder (3-5 days)

- Grow `lib/geo` with `distanceMeters`, `nearestPointOnPolygon`, `farthestPointOnPolygon`, `centroid`. Pure functions, no seams.
- Grow `lib/course` (single-adapter): `loadBundledCourse(slug)`, `normalize(osmElements)`.
- `scripts/build-course.ts` Node script: takes OSM ID, calls `lib/course/normalize.ts`, writes `courses/<slug>.json`.
- Run script against home course. Commit `courses/presidio.json`.
- One screen at `app/round/[hole].tsx`: hardcoded hole, F/P/B numbers, manual prev/next, tap-on-green to move pin (in-memory, no persistence yet).
- Vector map only via MapLibre. No satellite, no offline.

**Deliverable**: take phone to course, use as rangefinder for a real round. Validates the core distance computation and the data pipeline end-to-end.

### Phase 2 — Round persistence (2-3 days)

- Drizzle schema for `courses`, `rounds`, `hole_states`. Migrations setup.
- Grow `lib/round`: `startRound`, `endRound`, `useActiveRound`, `setPin`, `getHoleState`. Single-active-round invariant enforced inside the module.
- Home screen: course picker for bundled courses; active-round resume; stale-round banner.
- Pin positions persist per hole within active round.

**Deliverable**: full rounds save and resume across app restarts.

### Phase 3 — Satellite + full offline (3-5 days)

- Grow `lib/tiles`: `prefetchForCourse(id)`, `prefetchStatus(id)`, `vectorStyle`, `satelliteStyle`.
- ESRI satellite raster source + OpenFreeMap vector source.
- Pre-download both layers (z=16-18) when a course is added.
- Map style toggle button on the map view.
- Progress UI for tile downloads; retry on failure.

**Deliverable**: app works at the course with no cell signal.

### Phase 4 — Tee shots + scorecard ("MVP done") (2-3 days)

- Drizzle schema for `tee_shots`.
- Grow `lib/shots`: `startTeeShot`, `markTeeShot`, `cancelTeeShot`, `useCurrentTeeShot`.
- "Start Tee Shot" / "Mark Tee Shot" buttons on hole screen. Dismissible.
- Post-round scorecard screen — 18 boxes, single save action.
- Round history list (date, course, score).

**Deliverable**: MVP done. Author can play full rounds on bundled courses, capture occasional drive distances, log scores.

### Phase 5 — Landing Zone planning overlay (1-2 days)

Pre-shot planning waypoints on the hole map for par 4 and par 5 holes. All state is ephemeral (no SQLite changes). See CONTEXT.md for the "Landing Zone" definition.

- Add `lzInitPositions(tee, greenCentroid, count: 0|1|2): LatLng[]` to `lib/geo`. Returns points at 1/3 and 2/3 of the straight line from tee to green centroid. Pure function, no seams.
- In `FramedHoleScreen`, add local state:
  - `lzPositions: LatLng[]` — 0, 1, or 2 positions, initialized from `lzInitPositions` on mount and on `holeNum` change.
  - `lzToggle: 'auto' | 'force-shown' | 'force-hidden'` — resets to `'auto'` on `holeNum` change.
- Two named constants (with range-hint comments) at the top of `[hole].tsx`:
  - `LZ_HIDE_WITHIN_M` — threshold in metres below which LZs auto-hide because the player has left the tee. Starting value: `300 * YD_TO_M` (~274 m). Comment: `// tune if LZs hide too early on short par 4s`.
  - `LZ_INIT_FRACTIONS` — `[1/3, 2/3]` along the tee→green centroid line.
- Visibility rule:
  ```
  holePar >= 4 &&
  (lzToggle === 'force-shown' ||
   (lzToggle !== 'force-hidden' &&
    (position === null || distanceMeters(position, pin) >= LZ_HIDE_WITHIN_M)))
  ```
- Tap model: existing `handleMapPress` → compute `distanceMeters` from tap to each waypoint in `[...lzPositions, pin]`, move the nearest one. LZ moves are clamped to `bboxOf(hole)` — LZs cannot be placed outside the hole envelope. Pin tap retains existing behaviour (must be inside green polygon).
- Map overlay (when LZs visible):
  - One `GeoJSONSource` + dashed `line` Layer per segment (tee→LZ1, LZ1→LZ2 if par 5, last LZ→pin).
  - One `GeoJSONSource` + `circle` Layer per LZ (visually distinct from the pin and tee dots).
  - One `GeoJSONSource` + `symbol` Layer per segment midpoint, displaying the segment distance as text.
  - Distances: tee→LZ via `distanceMeters(tee, lz)`, last LZ→pin via `distanceMeters(lz, pin)`.
- Toggle button on the map (small, beside the reframe button). Cycles `auto → force-shown → force-hidden → auto`. Icon or label should reflect current override state.

**Deliverable**: on par 4/5 holes near the tee, two tap-to-place planning waypoints appear with segment distances overlaid on the map. Toggle button lets you force-show or force-hide for unusual holes.

### Phase 6 — More courses + Find Nearby (2-4 days)

- Run build script for 2-3 more local courses. Commit JSON.
- `lib/course` graduates to real-seam: add `findNearby` and `addCourseFromOverpass` adapters. Both share `normalize.ts` with the build script.
- Tap-to-fix flow for missing greens after fetch.

**Deliverable**: friends can add their own local courses without a code change.

### Phase 7 — Polish & ship (2-3 days)

- Single-screen onboarding (one screen, location permission grant, "Get Started").
- Settings screen (3 toggles: default map style, units, about/credits).
- App icon (eagle silhouette?), splash, name in Android manifest.
- EAS Build → preview APK.
- Sideload, validate end-to-end on a real round, share with friends.

**Total**: ~3-4 weeks of part-time work. ~1.5-2 weeks if dedicated.

## Open questions

These are deferred — answer at the moment they become load-bearing, not pre-emptively.

- **Background GPS** — if battery proves too punishing in foreground-only mode, revisit. Unlikely with 1 Hz sampling and screen-on for ~4 hours.
- **9-hole vs 18-hole courses** — assumed 18 in MVP. 9-hole courses just have `holes.length === 9`; scorecard adapts.
- **Multi-tee data** — deferred per [ADR-006](adr/0006-tee-box-deferred.md). When added, `Hole` grows a `tees: TeeBox[]` field; round picks one at start.
- **Pin location ML inference** — author flagged this as a future capability. Architecture supports it: it's just a third course-data source alongside bundled and Overpass. See [ADR-003](adr/0003-source-agnostic-course-data.md).
- **Round-level edit/undo** — what if you tap "End Round" by mistake? Defer. Likely just a "reopen round" affordance in history.
- **Pin location on greens with weird shapes** (donut greens, multi-tier). Closest-point-on-polygon still works geometrically. UX-wise, may want to indicate tier somehow. Defer.

## References

- [CONTEXT.md](../CONTEXT.md) — domain language
- [docs/adr/](adr/) — architecture decision records

## How architecture eases debugging without tests

The author chose to skip unit/integration/e2e testing for this app. The architecture compensates: deep modules with narrow interfaces let you isolate bugs to one of two suspects.

- Distance wrong on hole 5? `lib/geo.nearestPointOnPolygon(here, green)` called with known inputs gives a yes/no on whether the bug is in `lib/geo` or in the data being passed.
- Round won't end? `lib/round.endRound()` is the single entry point. Bug is inside the module or in one screen calling it.
- Satellite tiles missing offline? `lib/tiles.prefetchStatus(courseId)` reports state. No need to spelunk MapLibre internals.

If a bug _does_ span multiple modules, the symptom usually points to which interface is wrong, not which line of code. That's the leverage of depth: bugs and their fixes share locality.
