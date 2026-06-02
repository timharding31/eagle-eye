# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

Eagle Eye is a personal Android golf rangefinder, sideloaded as an APK. Expo + React Native, fully offline at the course. Solo-dev project — no test suite. Architecture (deep modules with narrow interfaces) is the primary debugging aid; bugs are meant to localize to a single module via its small interface.

Read these two files before doing any non-trivial work — they are load-bearing:

- `CONTEXT.md` — the domain glossary. Use these terms **exactly** in code and docs (Course, Hole, Green, Pin, Round, Tee Shot, etc.). The "Terms to avoid" list there is enforced (no "yardage", "tracker", "user", "API"). Add a term to this file before naming a new domain concept in code.
- `docs/PLANNING.md` — the phasing plan, tech-stack rationale, module table, data model, and UX flows. The module table is the source of truth for which file owns which capability.
- `docs/adr/` — nine ADRs that lock in non-obvious decisions (front/back via closest point, SQLite as source of truth, source-agnostic course data, manual hole nav, MapLibre offline packs, tee-box deferred, Find Nearby only, prefetch both tile layers, tee-correction overlay). Check these before changing related behavior.

## Commands

```bash
npm start                                    # Expo dev server (custom dev client, NOT Expo Go)
npm run android                              # Launch on connected Android device/emulator
npm run lint                                 # Expo's ESLint config + prettier
npm run format                               # Prettier write
npm run format:check                         # Prettier check
npm run db:generate                          # Drizzle: regenerate migrations from lib/**/schema.ts
npm run build:course -- <type/id> <slug>     # Node script: Overpass → courses/<slug>.json
                                             #   e.g. npm run build:course -- way/16650363 presidio
```

There are no tests. Do not add a test runner unless asked — the architecture choice is to skip them and rely on deep-module interface isolation (see PLANNING.md "How architecture eases debugging without tests").

`npm install` uses `legacy-peer-deps=true` (see `.npmrc`) — needed for the Expo 56 / RN 0.85 / React 19 dep graph. Don't fight it.

## Architecture: deep modules in `lib/`

The repo is grouped by domain concept, not by layer. Each `lib/<module>/index.ts` is the **only** way other code should talk to that module — internal seams (Drizzle, Turf, MapLibre, Zustand, GPS) must not leak through the interface.

| Module       | Owns                                                                                                                                                                                                                                                                    | Internal seams                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `lib/geo`    | Pure geospatial math (`distanceMeters`, `nearestPointOnPolygon`, `farthestPointOnPolygon`, `centroid`, `pointInPolygon`, `bearingDeg`, `frameForHole`, `lzInitPositions`, `projectionFraction`, `bboxOf`).                                                              | Turf.js — wrapped, never re-exported.                               |
| `lib/course` | Course loading + normalization + the Overpass adapter (Find Nearby discovery, fetch, tap-to-fix green synthesis, SQLite install) + per-course Tee Corrections (`setTeeOverride`, applied as an overlay in `loadCourse` — see ADR-009). Source-agnostic (`bundled` / `overpass` / `ml` all produce same `Course` shape). `normalize.ts` is shared with the Node build script. | OSM tag parsing, Drizzle, Overpass HTTP, Zustand (pending-install). |
| `lib/round`  | Round lifecycle + the **single-active-round invariant** (at most one row in `rounds` with `ended_at IS NULL`). Owns the Zustand store + SQLite hydration.                                                                                                               | Drizzle, Zustand, stale-round (>24h) check.                         |
| `lib/tiles`  | Offline tile management (raster + vector, z=16–18) per Course.                                                                                                                                                                                                          | MapLibre offline manager, URL templates.                            |

Screens in `app/` (Expo Router, file-based) stay thin — if one grows past ~200 lines doing math or parsing inline, push it into a module. Path alias `@/*` resolves to the repo root (see `tsconfig.json`).

## Data layer specifics

- **SQLite is the source of truth** for rounds + course install state (ADR-002). Active-round resume on cold launch goes through `lib/round.ensureHydrated()`, called from `app/_layout.tsx` after `useMigrations` succeeds.
- **Drizzle schemas** live next to the module that owns them (`lib/course/schema.ts`, `lib/round/schema.ts`). `drizzle.config.ts` globs `./lib/**/schema.ts`. `db/index.ts` is the single drizzle client.
- **Migrations**: `drizzle/` is gitignored but its files (`migrations.js`, `*.sql`, `meta/`) are imported at runtime via `babel-plugin-inline-import` (`.sql` extension). Run `npm run db:generate` after any schema change — the import will fail otherwise.
- **Course JSON** in `courses/` is committed and bundled into the APK (`presidio`, `harding-park`, `crystal-springs`, `lincoln-park`, `peacock-gap`). Each is wired into `BUNDLED_REGISTRY` in `lib/course/index.ts`, keyed by slug; a new bundled course needs both the JSON file and a registry entry there. (`presidio` is the home course — OSM way 16650363.) Courses added at runtime via Find Nearby live in SQLite, not in `courses/`.

## Conventions worth knowing

- TypeScript strict mode is on. Prefer types over `any` — the geo code is null-and-edge-case heavy and types catch real bugs.
- Prettier: no semicolons, single quotes, trailing commas, `arrowParens: avoid`.
- The `Course` type uses GeoJSON-style `Position = [lng, lat]` ordering (see `lib/course/types.ts`). Internal app code uses `LatLng = { lat, lng }`. Conversions happen at the `lib/geo` boundary — don't sprinkle `[1, 0]` swaps in screens.
- **UI is an in-house design system in `lib/theme.ts`** (`colors`, `space`, `radius`, `fonts`, `type`, `shadows` — deep-navy surfaces, cream text, maroon CTA, Sora typeface loaded in `_layout.tsx`). Screens compose plain RN `StyleSheet` with the leaf primitives in `components/` (`Button`, `Card`, `ScreenShell`, `SectionLabel`, `TopBar`, `EagleIcon`) and SVG glyphs in `components/icons.tsx` (hand-rolled paths + a few re-exports from `lucide-react-native`). Style off `@/lib/theme`, not hardcoded hex. There is no third-party UI kit — Gluestack was removed.
- Distances are computed in metres throughout `lib/geo`; the hole screen converts to **yards** (golf default) only at the display boundary (`YD_TO_M`). A units toggle is deferred to the Phase 7 settings screen — there is no settings store yet.
- Map renderer is `@maplibre/maplibre-react-native` — requires the custom dev client, won't run in Expo Go. On-map text uses `MarkerView` (native RN view), not symbol/text layers — the satellite raster style has no glyphs URL and text-field layers crash on it.
