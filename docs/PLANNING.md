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
- Per-shot tracking. The MVP tried opt-in two-tap tee-shot capture; it was dropped post-MVP as too clunky on the course and replaced by a passive Distance from Tee readout (see [ADR-010](adr/0010-shot-recording-dropped.md)).
- Tee box selection / posted-yardage display in MVP. Distances are to the pin and green polygon; same number regardless of tee.
- Background GPS / continuous tracking. Foreground only.

## MVP scope

A single "MVP done" line at the end of Phase 4 below. The MVP delivers:

- Distance to pin, front of green, back of green — live, three big numbers stacked at the top of the screen.
- Pin position defaults to the green's centroid; tap on the green polygon in the map to move it. Persists per hole within the current round.
- Manual hole navigation — Prev / Next buttons. Hole header tappable to jump to any hole 1–18.
- Satellite map view, pre-downloaded per course for offline use (a vector basemap is also prefetched as an automatic offline fallback — see [ADR-008](adr/0008-prefetch-both-tile-layers.md)).
- Tee shot capture: "Start Tee Shot" → "Mark Tee Shot" two-tap flow. _(Shipped in the MVP, later removed — see [ADR-010](adr/0010-shot-recording-dropped.md).)_
- Round persistence: SQLite-backed, single active round at a time, resumes on app open.
- Post-round scorecard entry: one screen, 18 boxes, save.
- Round history: list of past rounds with date / course / score.

## Tech stack

| Layer                 | Choice                                                                        | Reason                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Framework             | Expo (managed) + custom dev client                                            | Native modules accessible via config plugins; managed-workflow ergonomics.                                          |
| Language              | TypeScript, strict mode                                                       | Geospatial code is null-and-edge-case heavy; types are cheap and catch real bugs.                                   |
| Map renderer          | `@maplibre/maplibre-react-native`                                             | Free, MIT-licensed, supports both vector and raster tiles. No API-key lock-in. Offline-pack API hides tile caching. |
| Vector tile source    | OpenFreeMap                                                                   | Free hosted vector tiles. Swappable to Protomaps or self-hosted with no code-architecture change.                   |
| Satellite tile source | ESRI World Imagery                                                            | Free, no API key, high quality. Mapbox Satellite is the fallback if ESRI ever changes terms.                        |
| Location              | `expo-location`                                                               | Foreground only, 1 Hz, balanced accuracy. Plenty for golf.                                                          |
| Storage               | `expo-sqlite` + Drizzle ORM                                                   | Typed schema, typed queries, migrations. Drizzle is internal to data modules — never leaks into interfaces.         |
| State                 | Zustand                                                                       | Tiny, no provider boilerplate. One store per concept (e.g. the round store, the pending-install store).             |
| Routing               | Expo Router (file-based)                                                      | Conventions match wider ecosystem. Type-safe routes.                                                                |
| Geo math              | Turf.js (`@turf/turf`)                                                        | Tree-shakeable. Wrapped by `lib/geo` — Turf never appears in `lib/geo`'s interface.                                 |
| Styling               | In-house design system (`lib/theme.ts`) + RN `StyleSheet`                     | Small token set (colors/type/space/radius/shadows); no UI-kit dependency (Gluestack was removed).                   |
| Typography / icons    | Sora (`@expo-google-fonts/sora`) + `react-native-svg` / `lucide-react-native` | Single typeface across the app; SVG glyphs hand-rolled in `components/icons.tsx` plus a few lucide re-exports.      |
| Build / distribution  | EAS Build → preview APK                                                       | Free tier covers hobby use. Sideload via Drive/Signal.                                                              |

See [ADR-005](adr/0005-maplibre-offline-packs.md) for the renderer choice rationale.

## Architecture

### Deep modules

Modules are grouped by domain concept, not by layer. Each one earns its place by the deletion test: removing it would scatter complexity across multiple callers. Interfaces are small; implementations are substantial. Internal seams (Drizzle, Turf, MapLibre's native APIs) are not exposed through the external interface.

| Module       | What it owns                                                                                                                                                                                                                                                                                                                                  | External interface (rough)                                                                                                                                                                                                                                                                                                                                                                                                   | Internal seams                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `lib/geo`    | Pure geospatial computation.                                                                                                                                                                                                                                                                                                                  | `distanceMeters(a, b)`, `nearestPointOnPolygon(here, poly)`, `farthestPointOnPolygon(here, poly)`, `centroid(poly)`, `pointInPolygon(pt, poly)`, `bearingDeg(a, b)`, `frameForHole(...)`, `lzInitPositions(tee, greenCentroid, count)`, `bboxOf(hole)`                                                                                                                                                                       | Turf.js                                                                           |
| `lib/course` | Course data loading, normalization, and the Overpass adapter. Shape is source-agnostic — bundled JSON, Overpass fetch, and future ML inference all produce the same `Course`.                                                                                                                                                                 | `loadCourse(slug)`, `loadBundledCourse(slug)`, `loadInstalledCourse(id)`, `listBundledCourses()`, `listInstalledCourses()`, `listAllCourses()`, `findNearby(here, radiusKm)`, `fetchCourseFromOverpass(osmType, osmId)`, `applyMissingFixes(...)` (tap-to-fix), `installCourse(course)`, `removeInstalledCourse(id)`, `normalize(...)` (shared with build script), pending-install store (`set/get/clear/usePendingInstall`) | OSM tag parsing, Drizzle queries, Overpass HTTP client, Zustand (pending-install) |
| `lib/round`  | Round lifecycle. Owns the single-active-round invariant. State machine: `idle → active → ended`.                                                                                                                                                                                                                                              | `startRound(courseId)`, `endRound(round, scores)`, `useActiveRound()`, `setPin(holeNum, latLng)`, `getHoleState(round, holeNum)`, `history()`                                                                                                                                                                                                                                                                                | Drizzle, Zustand store, stale-round detection                                     |
| `lib/tiles`  | Offline tile management. Wraps MapLibre's offline-pack API for both raster (satellite) and vector layers. Satellite imagery is ESRI World Imagery; the offline style is hosted on GitHub Pages (`docs/satellite-style.json`) because the downloader only fetches styles over http(s). Max zoom is per-course (z20 default, z21 for Presidio). | `prefetchForCourse(courseId, bounds)`, `prefetchStatus(courseId)`, `retryPrefetch(courseId, bounds)`, `vectorStyle`, `satelliteStyleFor(courseId)`, `satelliteMaxZoom(courseId)`                                                                                                                                                                                                                                             | MapLibre's offline manager, URL templates, ESRI World Imagery                     |

Tee Corrections (`setTeeOverride`, `getTeeOverride`, `clearTeeOverride`) live in **`lib/course`** and are applied as an overlay inside `loadCourse` — see [ADR-009](adr/0009-tee-override-overlay.md). They replace the removed tee-shot feature (see below).

`lib/shots` was **removed** ([ADR-010](adr/0010-shot-recording-dropped.md)). Tee-shot recording proved too clunky in on-course testing; it's replaced by a passive Distance from Tee readout backed by the Tee Correction.

#### Seam status

- **`lib/geo`**: no seam. Pure in-process computation. Interface is the test surface (if tests ever exist).
- **`lib/course`**: the seam is now real (as of Phase 6). It has two production adapters — bundled-JSON and Overpass — both feeding the shared `normalize()` (which the Node build script also calls). The Overpass path adds Find Nearby discovery, fetch, tap-to-fix green synthesis, and SQLite install/remove. Also owns Tee Corrections.
- **`lib/round`**, **`lib/tiles`**: single-adapter modules. SQLite and MapLibre each have only one production implementation. No port-and-adapter indirection until a second implementation is justified.

### Repo layout

```
eagle-eye/
├── app/                      # Expo Router screens. Thin — delegate to lib/.
│   ├── _layout.tsx           # Migrations + hydration + fonts + providers
│   ├── index.tsx             # Home (course picker or active-round resume)
│   ├── history.tsx           # Round history list
│   ├── round/
│   │   ├── [hole].tsx        # The hole screen — thin route loader (see below)
│   │   └── scorecard.tsx     # Post-round score entry
│   └── courses/
│       ├── add.tsx           # Find Nearby (Phase 6)
│       └── fix.tsx           # Tap-to-fix missing greens (Phase 6)
├── lib/
│   ├── geo/
│   ├── course/
│   │   ├── index.ts          # External interface + Overpass adapter + tee corrections
│   │   ├── normalize.ts      # Shared with scripts/build-course.ts
│   │   ├── types.ts          # Course/Hole/Position types + isCourseValid
│   │   └── schema.ts         # Drizzle schema for courses + tee_overrides
│   ├── round/
│   │   ├── index.ts
│   │   └── schema.ts
│   ├── tiles/                # Offline packs + ESRI satellite style
│   └── theme.ts              # In-house design system (oklch-generated palette)
├── components/               # Leaf UI primitives
│   ├── Button.tsx  Card.tsx  ScreenShell.tsx  SectionLabel.tsx
│   ├── TopBar.tsx  EagleIcon.tsx  GlassSurface.tsx
│   ├── icons.tsx             # SVG glyphs (custom + lucide re-exports)
│   └── hole/                 # The decomposed hole view (scene + regions)
│       ├── scene.tsx         # HoleSceneProvider / useHoleScene — GPS, geometry, toggles
│       ├── HoleLayout.tsx    # Composition root: regions stacked over the map
│       ├── HoleMap.tsx  HoleHeader.tsx  HoleMeasurements.tsx
│       ├── HoleButtonStack.tsx  BottomDrawer.tsx  TeeOverrideDialog.tsx
│       └── units.ts          # M_TO_YD
├── db/
│   ├── index.ts              # Drizzle client setup
│   └── migrations.ts         # Hand-maintained static migration bundle (runtime)
├── courses/                  # Bundled course JSON (committed)
│   ├── presidio.json  harding-park.json  crystal-springs.json
│   └── lincoln-park.json  peacock-gap.json
├── scripts/
│   └── build-course.ts       # Node script: OSM ID → courses/<slug>.json
├── docs/
│   ├── PLANNING.md           # This file
│   ├── UI_LAYOUT.md          # Hole-view pixels → components/hole/ files
│   ├── UI_CRITIQUE.md        # Polish assessment of the hole view
│   ├── satellite-style.json  # ESRI offline style, served from GitHub Pages
│   └── adr/                  # Architecture Decision Records (0001–0010)
├── CONTEXT.md                # Domain language glossary
└── ...

(No `settings.tsx` yet — onboarding + settings are Phase 7.)
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
tee_overrides  (course_id, hole_num, lat, lng, set_at)   -- PK (course_id, hole_num); ADR-009
```

The `tee_shots` table was dropped in migration `m0001` along with the tee-shot
feature — see [ADR-010](adr/0010-shot-recording-dropped.md). `tee_overrides` is
keyed by course (not round): a tee correction is a course-data fix that persists
across rounds.

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
└──────────────────────────┘
```

> The actual screen is now a full-screen map with the F/G/B numbers and controls
> floating as glass chrome on top (see `docs/UI_LAYOUT.md`), but the rangefinder-
> first hierarchy above still holds. A live **Distance from Tee** pill sits under
> the F/G/B panel once the player is off the tee — it replaces the old tee-shot
> recording (see Tee correction below).

- Distance updates every GPS tick (~1 Hz) via `lib/geo`. Numbers are shown in **yards** (converted from metres at the display boundary via `M_TO_YD`).
- Map controls live on the map itself, not in settings: a green-mode toggle that tightens the camera to a green-only frame, the Landing Zone toggle (Phase 5), and Set Tee (tee correction). The map renders satellite imagery; hole navigation eases the camera in place (`router.setParams`, not a route replace, so the map instance stays mounted).
- "Next" past hole 18 navigates to the post-round scorecard.

### Tee correction + Distance from Tee

Replaces the original two-tap tee-shot recording, which was dropped after on-course
testing — see [ADR-010](adr/0010-shot-recording-dropped.md).

1. OSM tee points are often wrong. On the hole screen, the player taps **Set Tee**, which opens a confirm dialog showing how far the tee would move; confirming snaps the hole's Tee to the live GPS fix.
2. `lib/course.setTeeOverride(courseId, holeNum, pos)` upserts a `tee_overrides` row; the screen re-loads the course so the corrected tee flows into distances, framing, and Distance from Tee. The correction persists across rounds (it's a course-data fix). "Clear correction" restores the source tee via `clearTeeOverride`.
3. With a trustworthy tee, the **Distance from Tee** pill shows a live straight-line GPS→tee distance — no tap, no recording. It appears once the player is meaningfully off the tee and gives the drive-distance read the old feature was after, passively.

### End a round

1. User taps "Next" past hole 18 → automatic scorecard screen.
2. Or: user taps "End Round" from a menu (deliberately small/hidden to prevent misclicks).
3. Scorecard screen: 18 boxes, enter scores from paper card, "Save."
4. `lib/round.endRound(round, scores)` sets `ended_at = now()`, writes scores, navigates home.

### Add a course (Phase 6)

1. Home → "Add Course (Find Nearby)" (`app/courses/add.tsx`).
2. `lib/course.findNearby(here, radiusKm)` queries Overpass for `leisure=golf_course` ways/relations within radius, sorted nearest-first.
3. List of matches with name + distance.
4. Tap one → `lib/course.fetchCourseFromOverpass(osmType, osmId)` fetches full hole data and normalizes via `lib/course/normalize.ts`, returning a (possibly partial) `Course` + a `MissingHole[]`. Held in the ephemeral pending-install store.
5. If any hole is missing a green polygon, the tap-to-fix flow (`app/courses/fix.tsx`) walks the player through tapping green centres; `applyMissingFixes` synthesizes ~9 m circular green polygons until the course is valid.
6. `lib/course.installCourse(course)` persists it to SQLite. `lib/tiles.prefetchForCourse(id, bounds)` kicks off in the background; the home screen shows per-course tile progress with retry.

## Phasing plan

Vertical-slice phasing. Each phase ends with something testable on a real round.

**Status (2026-06-04):** Phases 0–6 are code-complete. The MVP (through Phase 4), the Landing Zone overlay (Phase 5), and More Courses + Find Nearby (Phase 6 — five bundled courses, Overpass discovery/fetch, tap-to-fix, SQLite install) are all in.

Since then, several changes have landed **out of band** (not new phases):

- **Tee-shot recording removed** ([ADR-010](adr/0010-shot-recording-dropped.md)). On-course testing found the two-tap flow too clunky; `lib/shots` and the `tee_shots` table are gone. Replaced by the **Set Tee** correction ([ADR-009](adr/0009-tee-override-overlay.md)) feeding a passive **Distance from Tee** readout.
- **Hole view decomposed** into `components/hole/` — a `HoleSceneProvider`/`useHoleScene` context plus region components (`HoleMap`, `HoleMeasurements`, `HoleButtonStack`, `BottomDrawer`, `HoleHeader`, `TeeOverrideDialog`). `app/round/[hole].tsx` is now a thin route loader. Documented in `docs/UI_LAYOUT.md`.
- **Glass UI + native satellite.** Real backdrop-blur glass chrome (`components/GlassSurface.tsx`, `expo-blur`) over native ESRI satellite imagery (z20, z21 for Presidio), with the offline style hosted on GitHub Pages. `lib/theme.ts` is now an oklch-generated palette.

**Phase 7 (polish & ship)** is the only outstanding phase: onboarding, screen-level visual polish (home / round history / landing, then the hole view per `UI_CRITIQUE.md`), and the EAS preview build. The **settings panel is deferred** — there's no in-app settings yet — and a **units toggle is a won't-do**: distances stay yards-only (see below).

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

- Grow `lib/tiles`: `prefetchForCourse(id)`, `prefetchStatus(id)`, `vectorStyle`, `satelliteStyleFor(id)`.
- ESRI satellite raster source + OpenFreeMap vector source.
- Pre-download both layers when a course is added. _(The z range later grew to z16–20, z21 for Presidio — see the module table above.)_
- Progress UI for tile downloads; retry on failure.

**Deliverable**: app works at the course with no cell signal.

### Phase 4 — Tee shots + scorecard ("MVP done") (2-3 days)

- Drizzle schema for `tee_shots`. _(Later dropped — see ADR-010.)_
- Grow `lib/shots`: `startTeeShot`, `markTeeShot`, `cancelTeeShot`, `useCurrentTeeShot`. _(Module later removed.)_
- "Start Tee Shot" / "Mark Tee Shot" buttons on hole screen. Dismissible.
- Post-round scorecard screen — 18 boxes, single save action.
- Round history list (date, course, score).

**Deliverable**: MVP done. Author can play full rounds on bundled courses, capture occasional drive distances, log scores.

> **Post-MVP correction:** the tee-shot capture in this phase was removed after
> on-course testing ([ADR-010](adr/0010-shot-recording-dropped.md)). The
> scorecard, history, and round persistence all remain. Drive distance is now a
> passive Distance from Tee readout rather than recorded shots.

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

### Phase 6 — More courses + Find Nearby (2-4 days) — done

- Ran the build script for more local courses. Bundled set: `presidio` (home), `harding-park`, `crystal-springs`, `lincoln-park`, `peacock-gap`.
- `lib/course` graduated to a real seam: `findNearby` (Overpass discovery) and `fetchCourseFromOverpass` (fetch + normalize) adapters, plus `installCourse` / `removeInstalledCourse` for SQLite-backed courses. All share `normalize.ts` with the build script.
- Tap-to-fix flow (`app/courses/fix.tsx` + `applyMissingFixes`) synthesizes green polygons for holes missing them after fetch.

**Deliverable**: friends can add their own local courses without a code change. ✅

### Phase 7 — Polish & ship (2-3 days)

- Single-screen onboarding (one screen, location permission grant, "Get Started").
- Visual polish pass on the home, round-history, and landing screens (and the hole view per `UI_CRITIQUE.md`).
- App icon (eagle silhouette?), splash, name in Android manifest.
- EAS Build → preview APK.
- Sideload, validate end-to-end on a real round, share with friends.

**Won't do / deferred:**

- **Units toggle — won't do.** Distances stay yards-only. The author plays in yards; a metres/yards toggle adds a setting and a stored preference for no real benefit. Geo math stays in metres internally regardless (converted at the display boundary), so this is a UI decision, not a data one.
- **In-app settings panel — deferred.** With the units toggle dropped and the map style now automatic (satellite, vector fallback), there's nothing left that needs a settings screen. Revisit only if a genuinely user-facing preference appears.

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
