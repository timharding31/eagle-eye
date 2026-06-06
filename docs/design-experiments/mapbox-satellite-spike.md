# Spike: Mapbox satellite imagery (ESRI → Mapbox)

**Status:** spike / not shipped. **Decided 2026-06-05: staying on ESRI** — making
Mapbox work offline (hosted style + token + the ToS/offline-caching tension below)
isn't worth the imagery gain. The `SATELLITE_PROVIDER` toggle is kept in
`lib/tiles/index.ts` so the comparison is one constant + a token away if revisited.
Default provider stays `esri`.
**Why:** ESRI World Imagery only looks good at z21 over the Presidio; below that
it's fuzzy and an unpleasant green. Evaluating whether Mapbox Satellite reads
better at the zooms we actually frame holes at (~z16.5 overview, ~z19–20 green).

## What this spike wired up

`lib/tiles/index.ts` now selects the satellite source through a `SATELLITE_PROVIDER`
switch (`'esri' | 'mapbox'`) backed by a small `PROVIDERS` descriptor (tile URL,
native tile size, oversample factor, source maxzoom, attribution). The public
`lib/tiles` interface (`satelliteStyleFor`, `satelliteMaxZoom`, `vectorStyle`,
prefetch fns) is unchanged — the swap is internal to the module.

Provider differences the descriptor handles:

|                 | ESRI                 | Mapbox                                                           |
| --------------- | -------------------- | ---------------------------------------------------------------- |
| Tile template   | `…/tile/{z}/{y}/{x}` | `…/mapbox.satellite/{z}/{x}/{y}@2x.jpg90` (note `{x}/{y}` order) |
| Native tile px  | 256                  | 512 (`@2x` retina)                                               |
| Render tileSize | 128 (`256/2`)        | 256 (`512/2`) — same effective +1-level oversample               |
| Source maxzoom  | ~21 over SF          | 22 advertised                                                    |
| Auth            | none                 | `?access_token=pk.*` required                                    |
| Attribution     | Tiles © Esri         | © Mapbox © Maxar                                                 |

## How to try it on-device

1. Get a Mapbox public token (`pk.*`) — free tier is plenty for one person
   (hundreds of thousands of raster requests/mo).
2. Add to `.env` at repo root (gitignored — do **not** commit):
   `EXPO_PUBLIC_MAPBOX_TOKEN=pk.your_token`
3. Set `SATELLITE_PROVIDER = 'mapbox'` in `lib/tiles/index.ts`.
4. `npm run android` and compare the hole overview + zoom-to-green. **Stay online**
   — see the offline caveat below.

If the token is unset, `activeProvider()` logs a warning and falls back to ESRI so
the map never goes blank.

## Open issues before this could ship (not done in the spike)

1. **Offline packs still pull ESRI.** The downloader (`downloadLayer`) uses the
   GitHub-Pages-hosted `docs/satellite-style.json`, which is ESRI. So with
   `SATELLITE_PROVIDER=mapbox` the **live render is Mapbox but the offline cache is
   ESRI** — fine for an online aesthetic comparison, wrong for offline play at the
   course. Productionizing means hosting a Mapbox `satellite-style.json` too, which
   forces the token into a **public** file (the repo's Pages site). Use a strictly
   URL-referrer-restricted token, or move the hosted style off the public repo.

2. **Mapbox ToS vs. our offline model — the real blocker.** Mapbox's terms only
   permit caching/storing tiles through the official Mapbox SDKs' offline feature.
   We use MapLibre + `OfflineManager.createPack()` to bulk-download into offline
   packs (ADR-008) — that's outside the allowance. For a personal, non-distributed,
   sideloaded app the enforcement risk is negligible, but it directly undercuts the
   reason ESRI was chosen (ADR-005: "no API key, hot-link-friendly, free for
   non-commercial"). The live-render fetch path does **not** trigger this; only the
   prefetch/caching does. Decide whether we're comfortable before moving offline.

3. **Per-course maxzoom.** `SATELLITE_MAX_ZOOM_BY_COURSE` still caps Presidio at 21.
   Mapbox advertises 22 — worth testing whether its z22 imagery over the Presidio is
   real detail or upscaled before bumping (and the deeper level ~4×'s the pack).

## Recommendation

Worth a 10-minute on-device look (steps above) to settle the aesthetic question
cheaply. If Mapbox clearly wins, the follow-up is an ADR superseding the satellite
half of ADR-005, the hosted-style + token-hosting work, and an explicit call on the
ToS/offline-caching tension — not just flipping the constant.
