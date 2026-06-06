# Eagle Eye — Domain Language

Shared vocabulary for the project. Use these terms exactly. Don't substitute "model," "entity," "object," "tracker," or domain-adjacent alternatives. When a new concept emerges during development, add it here before naming it in code.

This file pairs with the architecture vocabulary in code reviews (module, interface, seam, adapter, depth). Domain terms here name _what the app is about_; architecture terms name _how the code is shaped_.

## Domain glossary

**Course**
A golf course. The unit of "what am I playing today." A course has a name, a bounding box, and an ordered list of Holes. Sourced from one of: bundled JSON (committed to repo), Overpass fetch (downloaded at runtime), or future ML inference on satellite imagery. All three sources converge on the same `Course` shape — see [ADR-003](docs/adr/0003-source-agnostic-course-data.md).
_Avoid_: "track," "club," "venue."

**Hole**
One of the 9 or 18 numbered playing units of a Course. A Hole has a `num`, `par`, a Green polygon, and a Tee point. May have an optional fairway polygon and hazard polygons.
_Avoid_: "level," "stage."

**Green**
The putting surface at the end of a Hole. Modeled as a polygon (closed ring of lat/lng coordinates). All pin-distance math is computed against this polygon. The Green polygon is mandatory data — a Hole without one is invalid until a user taps to provide it.
_Avoid_: "putting area," "cup."

**Tee** (or **Tee point**)
The starting point of a Hole. Modeled as a single point (lat/lng). Used for map auto-zoom, the displayed hole distance, and the origin of the Distance from Tee reading. The point that ships in the course data can be corrected per-course — see Tee Correction.
Multi-tee support (white/blue/red boxes with separate yardages) is deferred — see [ADR-006](docs/adr/0006-tee-box-deferred.md). When added, "Tee" becomes "TeeBox" with a polygon and a label.

**Tee Correction** (the **Set Tee** action)
A per-course correction to a Hole's Tee point, captured by snapping to the player's current GPS position ("Set Tee"). Course data from OSM is often inaccurate or favors the back tees; this records where the player actually tees off. Persisted in SQLite per-course (survives across Rounds) and layered over the read-only course data inside `loadCourse` — see [ADR-009](docs/adr/0009-tee-override-overlay.md). A single point, not a polygon (distinct from the deferred multi-tee work in ADR-006).
_Avoid_: "tee box area" (the stored value is a point, not an area).

**Distance from Tee**
The straight-line distance from the player's current GPS position back to the (possibly corrected) Tee. Shown on the hole screen once the player is meaningfully off the tee (past a small fraction of the Tee→Green line); lateral offset off that line is ignored. A separate reading from the Front/Back/Pin distances, which measure toward the Green.

**Pin**
The estimated current position of the flagstick on a Green. Defaults to the Green's centroid at the start of each Hole in a Round. Set/moved by the user tapping on the Green polygon in the map view. Persists per-Hole within the active Round only — a new Round resets to centroid (pins move daily).
_Avoid_: "flag," "hole" (overloaded with Hole the playing unit), "cup."

**Front / Back / Pin** (the three distances)
The three numbers always shown on the hole screen.

- **Front**: distance from the user's current GPS position to the nearest point on the Green polygon.
- **Back**: distance from the user's current GPS position to the farthest point on the Green polygon.
- **Pin**: distance from the user's current GPS position to the Pin position (centroid or user-placed).

Computed via `lib/geo`. See [ADR-001](docs/adr/0001-front-back-via-closest-point.md).

**Round**
A single play session on a Course. Has a `started_at` timestamp, an optional `ended_at` timestamp (null means active), a `current_hole`, and per-hole state (pin position, score). At most one Round in the database has `ended_at IS NULL` at any time. See [ADR-002](docs/adr/0002-sqlite-source-of-truth.md).

**Active Round**
The single Round currently in progress. The app opens directly into the active Round if one exists. A Round becomes inactive when `endRound()` is called.

**Stale Round**
An Active Round whose `started_at` is more than 24 hours old. Surfaces a banner offering to end-and-save or end-and-discard. Doesn't auto-end — explicit user action only.

**Hole State**
Per-hole state within a Round. Holds the user-set pin position for that Hole and the score (entered post-round). One row per (Round, Hole) pair.

**Landing Zone** (abbreviated LZ in code)
A pre-shot planning waypoint placed on the map. Represents an intended landing spot on the fairway. Par 3 holes have 0 Landing Zones; par 4 holes have 1; par 5 holes have 2. Each Landing Zone anchors a segment in the planning distance chain: Tee → LZ1 → [LZ2 →] Pin. Ephemeral — not persisted to SQLite. Shown for par 4/5 Holes; hidden only when the player toggles them off (no automatic distance-based hiding).
_Avoid_: "waypoint," "lay-up point," "planning point."

**Hazard**
Optional Tier 2 course data: bunkers, water hazards. Rendered on the map for visual context. Not used in any distance computation.

**Bounded data tiers**
The course data schema is tiered by what's mandatory vs nice-to-have:

- **Tier 0** (mandatory): hole sequence, par per hole, Green polygon per hole.
- **Tier 1** (mandatory): Tee point per hole.
- **Tier 2** (optional): Fairway polygon, Hazards.
- **Tier 3** (future): multi-tee, dogleg targets, OB stakes.

A Course must have all Tier 0 + Tier 1 data to be playable. Tier 2 is rendered when present, ignored when absent.

**Course Source**
Where a Course's data came from. One of: `bundled` (JSON in `courses/`, shipped with the APK), `overpass` (fetched via Overpass API and normalized at runtime), `ml` (future — ML inference on satellite imagery). All sources produce the same Course shape — the source is metadata, not a behavioral switch.

**Tap-to-Fix**
The workflow for handling missing Tier 0/1 data after an Overpass fetch. If a Hole is missing its Green polygon, the user is walked through tapping the green on satellite imagery to define it. The Course becomes valid once all Holes have Greens and Tees. Occurs once per course, post-add, pre-play.

**Find Nearby**
The Phase 6 course-discovery flow. Single button. Queries Overpass for `leisure=golf_course` ways/relations within radius of the player's GPS, lists matches by name + distance. Tapping a match fetches and normalizes it, runs Tap-to-Fix if any green is missing, then installs the Course to SQLite. See [ADR-007](docs/adr/0007-find-nearby-only.md).

**Pre-fetch**
The act of downloading both raster (satellite) and vector tile data for a Course's bounding box at zoom levels 16–18. Triggered automatically on Course install. Makes the Course playable offline. See [ADR-008](docs/adr/0008-prefetch-both-tile-layers.md).

## Terms to avoid

These terms drift in from commercial-golf-app speak or generic software speak. Don't use them in code or docs — they substitute for, or muddy, terms above.

- "Yardage" → say **distance**. Geo math is always in metres; the display converts to yards at the boundary. Yards-only is intentional (a units toggle is a won't-do), but still don't bake "yards" into names or stored values — keep the metres-internal / yards-at-the-boundary split.
- "Layup" → use **Landing Zone** instead.
- "Hole-out," "make," "finish hole" → just **mark next hole** or **next hole**.
- "Tracker," "GPS tracker" → Eagle Eye is a **rangefinder + scorecard**, not a tracker. We don't continuously track position to disk.
- "Account," "user," "profile" → Eagle Eye has no users in the multi-user sense. Say **author** or **player** when referring to the human if needed.
- "API," "endpoint" → for external HTTP (Overpass, ESRI), say **fetch** or name the service. For internal modules, say **interface**.

## Updating this file

- Add a new term when a concept enters the codebase that isn't named here yet. Don't ship code with a new domain noun until it's defined.
- Sharpen an existing term when a conversation reveals ambiguity. Update the definition in place.
- Move a term to "Terms to avoid" if it turns out to be a misleading or overloaded synonym for something already defined.
