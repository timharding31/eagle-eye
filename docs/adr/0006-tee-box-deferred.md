# ADR-006: Tee box selection deferred to post-MVP

**Status**: Accepted
**Date**: 2026-05-22

## Context

Real golf courses have multiple tee boxes per hole (white, blue, red, gold, etc.) with different posted yardages. Commercial golf apps typically ask the user to select a tee at round start and display the posted yardage for that tee on each hole.

Including tee box selection in MVP would require:

- Modeling multiple tee boxes per hole in the `Hole` schema (a `tees: TeeBox[]` field with polygon, label, posted yardage).
- A "Which tees?" prompt at round start.
- Per-tee posted yardages displayed in the hole header.
- Logic to handle missing tee data gracefully (some OSM courses have one tee polygon, some have multiple, some have none labeled).

None of this affects the _core distance math_ — distances are to the Pin and Green polygon, which are the same numbers regardless of which tee the user played from. Tee selection is purely for posted-yardage display and stats labeling.

## Decision

**Defer tee box selection to post-MVP.**

- `Hole.tee` is a single `Point` in MVP (Tier 1 data).
- No tee selection at round start.
- No posted-yardage display.
- Rounds are not tagged with which tees were played.

When this is added later (Phase 7+ or v2), it becomes:

- `Hole.tees: TeeBox[]` with the existing `tee` field becoming the "default" or "first" entry for backward compat.
- A tee selector on the start-round screen.
- Posted yardage shown in the hole header next to the par.

## Consequences

**Positive**:

- One fewer choice the user makes at round start.
- One fewer field to source/normalize from OSM data.
- One fewer category of UI complexity in MVP.
- The author's stated "I think I could eventually put tee box data in the app" matches the deferred path.

**Negative**:

- No posted yardage displayed. Some users expect this in a golf app. Mitigation: live GPS distance is more useful than posted yardage anyway; posted is approximate, live is exact.
- Round history doesn't distinguish "played from blue" vs "played from white." Stats are less comparable round-to-round.

**Compatibility**:

- Adding the `tees` array later doesn't break the bundled-JSON files (the existing `tee: Point` remains valid; the new field is added alongside).
- The Overpass normalizer can be updated to populate `tees` when added; courses fetched before the update keep their single-tee shape, which is still valid.
