# ADR-008: Pre-fetch both raster and vector tile layers on course-add

**Status**: Accepted
**Date**: 2026-05-22

## Context

Eagle Eye supports two map styles, toggleable in-app:

- **Vector**: OpenFreeMap-style vector tiles + the course's own polygon overlay (greens, fairways, etc.).
- **Satellite**: ESRI World Imagery raster tiles + the course's polygon overlay.

Golf courses notoriously have poor cell signal. Both styles need to work without connectivity once the user is on the course.

The OSM course data itself (green polygons, etc.) is tiny — a few hundred KB per course, bundled or fetched once and stored as JSON. The expensive part is the underlying tiles.

Two questions:

1. Pre-fetch tiles for offline, or rely on runtime caching?
2. If pre-fetch, both layers or just one?

Options considered for tile offline strategy:

- **A. Online only**: vector mode works offline by virtue of the course JSON alone (course polygons on a blank background); satellite mode requires connectivity. Smallest storage, simplest implementation.
- **B. Pre-fetch both layers on course-add**: download raster and vector tiles for the course bounding box. ~25-50MB per course total. Full offline support for both modes.
- **C. Pre-fetch on round start**: download deferred until the user actually starts a round on that course. Same storage as B but more deliberate.
- **D. LRU cache**: cache whatever the user views, evict oldest when storage is tight.

## Decision

**Pre-fetch both raster (satellite) and vector tiles on course-add (option B).**

- Triggered automatically when a course is installed (bundled course at first launch; Overpass course at fetch time).
- Bounding box derived from the course's overall bounds.
- Zoom range: 16–18 (~5m/px to ~1.2m/px), enough for hole-level overview and green-level detail.
- Implemented via MapLibre's `offlineManager.createPack()`, one pack per (course, style) pair.
- Pre-fetch can be retried via a button if it fails or is interrupted.

## Consequences

**Positive**:

- Both map styles work fully offline at the course. No bait-and-switch where the user toggles to satellite and sees "no connection."
- Course-add is the one moment we expect the user to have wifi (at home, adding a course to prepare for a round). Bundling tile download into that moment is natural.
- MapLibre's offline-pack API handles tile storage, eviction, and serving transparently. No manual tile-cache logic.
- One module owns it (`lib/tiles`); other modules don't care about offline state.

**Negative**:

- Storage cost: ~25-50MB per course × 5-10 courses = 125-500MB. Acceptable on modern phones.
- The pre-fetch download takes time (1-3 minutes per course on typical wifi). Progress UI required.
- If pre-fetch fails (signal drops, app killed), satellite mode is broken for that course until retry. The vector base map is small enough that it usually completes first; if only satellite is missing, the toggle still shows a usable map.
- Bounds expansion: if a course extends past its OSM polygon bounds (e.g., a hole that goes off the listed boundary), some tiles might be missing. Mitigation: expand the bbox by 5-10% before pre-fetch.

**Vector base map note**:

- Vector tiles are small (~5-10MB per course). They're pre-fetched alongside satellite even though the "vector + course polygons on blank canvas" mode would technically work without them. We pre-fetch anyway because:
  - It's cheap (small data).
  - It gives the vector mode a real basemap (showing roads/buildings around the course), which is occasionally useful for orientation.
  - It unifies the offline story — both styles work the same way.
