# ADR-005: MapLibre RN with offline packs; ESRI satellite + OpenFreeMap vector

**Status**: Accepted
**Date**: 2026-05-22

## Context

The app needs to render maps in two styles (satellite raster, vector base) and work fully offline at the course. Three rendering libraries were considered:

- **`@maplibre/maplibre-react-native`**: open-source fork of Mapbox GL Native. MIT-licensed. Supports raster and vector. Has an offline-pack API for downloading tiles in bulk for a region. No API key, no usage costs.
- **`@rnmapbox/maps`** (Mapbox official RN SDK): more polished, more docs, more examples. Requires Mapbox account + access token + bills against your tile usage (free up to 50k MAU).
- **`react-native-maps`** (Google Maps / Apple Maps wrapper): comes "free" with Expo, easiest to set up. Limited offline support, limited control over tile sources, locked to Google/Apple basemaps on each platform.

Separately: which tile providers?

- **Vector base**: OpenFreeMap (free hosted vector tiles), Protomaps (similar), self-hosted (planet.osm extract). OpenFreeMap is the lowest-friction choice and trivially swappable.
- **Satellite raster**: ESRI World Imagery (free for non-commercial use, no API key, hot-link-friendly URL), Mapbox Satellite (paid above free tier, requires account), Google Earth tiles (terms forbid this), Bing Maps (terms restricted).

## Decision

- **Renderer**: `@maplibre/maplibre-react-native`.
- **Vector base**: OpenFreeMap (style URL).
- **Satellite raster**: ESRI World Imagery (XYZ URL template).
- **Offline strategy**: pre-download both layers on course-add via MapLibre's `offlineManager.createPack()`. Zoom range 16–18. ~25–50MB per course total.

## Consequences

**Positive**:

- Zero ongoing cost for tile usage. MapLibre is free, OpenFreeMap is free, ESRI is free for non-commercial use.
- Full offline works for free via MapLibre's native offline-pack API. No manual tile-cache implementation needed.
- Both layers go through the same module (`lib/tiles`). Swapping any provider is a URL change.
- The MapLibre offline-pack mechanism is battle-tested, the same code path Mapbox GL Native uses.

**Negative**:

- ESRI's terms permit non-commercial use only. If the project ever distributes via the Play Store with ads/payments, the satellite source must move to Mapbox or another commercial provider. Fallback already identified (Mapbox Satellite).
- MapLibre RN is less polished than Mapbox's official SDK — fewer examples, some rough edges in setup. Risk validated in Phase 0 spike.
- OpenFreeMap is a hosted service maintained by a small group. If it goes down or changes terms, swap to Protomaps or self-host. Swap is a URL change; no architectural impact.

**Implementation**:

- `lib/tiles.prefetchForCourse(courseId)` calls `offlineManager.createPack({ bounds, minZoom: 16, maxZoom: 18, styleURL })` for both the satellite style and the vector style.
- Progress is reported via `offlineManager.subscribe()`.
- `lib/tiles.satelliteStyle` and `lib/tiles.vectorStyle` are MapLibre style objects/URLs that the hole screen passes to `MapView`.
- Re-downloading a course (e.g., to refresh stale satellite imagery) deletes the existing pack and creates a new one.
