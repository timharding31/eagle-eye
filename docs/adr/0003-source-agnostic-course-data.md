# ADR-003: Course data is source-agnostic; one shape, many adapters

**Status**: Accepted
**Date**: 2026-05-22

## Context

Course data has three plausible sources over the lifetime of the project:

1. **Bundled JSON** — committed to the repo, shipped with the APK. Used for the author's home courses and any course curated by hand.
2. **Overpass fetch** — runtime query to OpenStreetMap's Overpass API for a course by OSM relation ID or bbox. Used by the Phase 5 "Find Nearby" flow.
3. **ML inference (future)** — segmentation of satellite imagery to detect green/tee polygons. The author flagged this as a future capability.

Each source could justify its own data shape ("bundled is a fully-curated GeoJSON, Overpass is raw OSM tags, ML is bounding boxes + scores"). That would result in three code paths through the rest of the app — distance math, rendering, round state — each handling each source differently.

## Decision

**All sources produce the same `Course` shape (see [CONTEXT.md](../../CONTEXT.md) and the data-model section of [PLANNING.md](../PLANNING.md)).** A `source: "bundled" | "overpass" | "ml"` field is recorded as metadata only — it does not change downstream behavior.

The shared normalization logic lives in `lib/course/normalize.ts` and is called from:

- `scripts/build-course.ts` (Node script, build-time, for bundled JSON)
- `lib/course.addCourseFromOverpass()` (runtime, Phase 5)
- A future `lib/course.addCourseFromML()` (Phase ?, future)

All three callers hand `normalize()` a set of OSM-shaped elements (or ML-detected polygons in the future case) and receive back a valid `Course`.

## Consequences

**Positive**:

- The downstream code (`lib/geo`, `lib/round`, `lib/tiles`, all screens) is source-agnostic. It only ever sees `Course`. Adding a new source means writing a new adapter that hands `normalize()` the right input — no changes anywhere else.
- The build script and the runtime fetch path share the gnarly OSM-tag-parsing code. Bugs found in one are fixed for both.
- The "real seam" at `lib/course` is justified once we have two adapters (Phase 5). Until then it's a hypothetical seam (single adapter, no port).

**Negative**:

- The `Course` shape has to be flexible enough for all sources. We handle this by tiering data: Tier 0/1 mandatory, Tier 2 optional, Tier 3 future. A source that can't produce Tier 2 is still a valid Course.
- Some source-specific provenance (e.g., raw OSM tags for debugging) is lost in normalization. We accept this for MVP; raw OSM is recoverable by re-running the build script or re-fetching.

**Invariant**:

- Any change to the `Course` schema must keep all three sources able to produce a valid `Course`. If a new mandatory field can't be derived from OSM data, it doesn't go in the schema — it becomes optional, or it lives outside `Course`.
