# ADR-009: Tee corrections as a per-course SQLite overlay

**Status**: Accepted
**Date**: 2026-06-01

## Context

OSM-sourced Tee points are frequently wrong: inaccurate, or placed on the back tees the player doesn't actually use. After playing two courses with the app, the Tee was consistently in the wrong spot, which throws off the displayed hole distance and the new Distance from Tee reading.

The player needs to correct a Hole's Tee to where they actually tee off, by snapping to their current GPS position ("Set Tee"). The correction must:

- Persist across Rounds (the player tees off from the same spot most rounds — it's a course-data fix, not a per-round choice).
- Work for **bundled** courses, whose JSON is committed and read-only at runtime (can't write back into the APK).
- Not reintroduce the multi-tee modeling that [ADR-006](0006-tee-box-deferred.md) deferred.

## Decision

**Store tee corrections in a per-course SQLite table and apply them as an overlay inside `loadCourse`.**

- New table `tee_overrides(course_id, hole_num, lat, lng, set_at)`, PK `(course_id, hole_num)`, in `lib/course/schema.ts`. Keyed by the course slug stored on `rounds.course_id` (not `Course.id`, which is just metadata).
- `setTeeOverride(courseId, holeNum, pos)` upserts a row. Snapping is idempotent — re-tapping overwrites silently.
- `loadCourse(slug)` loads the base course (bundled or installed) and then layers any overrides on top, cloning only the corrected Holes so the bundled-registry object is never mutated. Every downstream consumer (distances, framing, Distance from Tee) sees the corrected `Hole.tee` with no per-screen branching.
- The correction is a **single point** that replaces `Hole.tee` — not a polygon. "Set tee box _area_" was considered but the stored value is a point; an area would force a "which point is _the_ tee?" decision on every distance computation, which is exactly the multi-tee complexity ADR-006 deferred.

## Consequences

**Positive**:

- One write path, one read path. Bundled JSON stays immutable; the override wins when present. The loaded `Course` remains the single source of truth.
- Survives cold launches and hole navigation (re-reads from SQLite each `loadCourse`).
- Composes cleanly with ADR-006: when multi-tee lands, the override point is just the chosen tee's representative point.

**Negative**:

- No in-app "revert to OSM tee" — re-tapping overwrites, but there's no clear-to-original. Acceptable for a personal app; a future delete-row affordance is trivial to add.
- A tee correction changes the framing inputs, so the hole screen deliberately does **not** re-frame the camera on Set Tee (the corrected marker just slides over) to avoid a disorienting jump while standing on the tee.

**Replaces**: the removed tee-shot tracking feature (`lib/shots` + the `tee_shots` table, dropped in migration `0001`). The "Set Tee" button takes its slot on the hole screen.
