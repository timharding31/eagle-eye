# ADR-001: Front and back of green via closest/farthest point on polygon

**Status**: Accepted
**Date**: 2026-05-22

## Context

The hole screen shows three distances: Front of green, Pin, and Back of green. Front and Back must be computed automatically — the user never inputs them — and they need to feel correct from any position on the course (in the fairway, in the trees, behind the green, etc.).

The Green is stored as a polygon (closed ring of coordinates), not a point. So "front" and "back" need to be derived from the polygon somehow. Two plausible methods:

- **A. Stored approach axis.** Pre-compute a Tee → Green centerline as part of course data. "Front" = closest point to the tee along the polygon; "back" = farthest. Direction-aware.
- **B. Live closest/farthest point relative to user GPS.** "Front" = closest point on the polygon to the user's current location; "back" = farthest. Direction-agnostic.

## Decision

**Closest/farthest point on polygon relative to user's current GPS position (method B).**

## Consequences

**Positive**:

- Works from any position. If the user is behind the green, "front" naturally becomes the back edge (because that's what's closest to them now). This matches golfer intuition — you want to know how close you are to the _near_ edge of the green, regardless of where you are.
- Requires no extra data per hole. The Green polygon alone is enough. Tee position is not load-bearing for distance math, only for map auto-zoom.
- Robust to non-fairway play (in the trees, way left, behind the green). Method A's centerline-based math breaks down off the intended approach line.
- Matches what commercial GPS units do.

**Negative**:

- "Front" and "back" mean different things from different positions, which could surprise a user expecting them to be fixed labels. Mitigation: in practice golfers care about the nearest/farthest edges, not absolute compass-direction labels.
- Requires a polygon — a single-point green wouldn't work. We accept this; the Tier 0 data requirement is a polygon.

**Implementation**:

- `lib/geo.nearestPointOnPolygon(here, poly)` — wraps Turf's `nearestPointOnLine` against the polygon's outer ring.
- `lib/geo.farthestPointOnPolygon(here, poly)` — iterates polygon vertices, returns the one with max distance. (For typical green polygons of <50 vertices, naive iteration is fine.)
- Both pure functions, no I/O. Tested by direct call.
