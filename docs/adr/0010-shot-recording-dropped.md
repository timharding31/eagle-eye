# ADR-010: Drop tee-shot recording for a passive Distance from Tee readout

**Status**: Accepted
**Date**: 2026-06-04

## Context

The MVP (Phase 4) shipped a two-tap **tee-shot recording** flow: "Start Tee Shot"
snapshotted GPS at the tee, "Mark Tee Shot" snapshotted GPS at the ball, and the
drive distance was computed and persisted. It had its own module (`lib/shots`),
its own table (`tee_shots`), and two buttons on the hole screen.

On-course player testing (the author, playing real rounds) found the flow too
clunky to actually use. You tee off, then have to remember to tap "Start" before
the shot and "Mark" after walking to the ball — with a glove on the phone hand
(see [non-goals](../PLANNING.md): paper scorecards for the same reason). The
interaction competed for attention at exactly the moment you want the screen to
just show a number. In practice the buttons went untapped.

## Decision

**Remove tee-shot recording entirely and replace it with a passive Distance from
Tee readout, made trustworthy by the [ADR-009](0009-tee-override-overlay.md) tee
correction.**

- `lib/shots` and the `tee_shots` table are deleted (table dropped in migration
  `m0001`; see `db/migrations.ts`). No "recording" state, no start/mark buttons.
- The hole screen now shows a live **Distance from Tee** pill (the
  `TeeDistancePanel` in `components/hole/HoleMeasurements.tsx`) — a straight-line
  GPS→tee distance that appears automatically once the player is meaningfully off
  the tee (`TEE_MARKER_MIN_FRACTION`). No tap required; glance and read.
- This readout is only useful if the tee point is right, which OSM tee data often
  isn't. The **Set Tee** correction (ADR-009) makes the tee trustworthy by
  snapping it to the player's actual teeing-off GPS, persisted per course. So the
  two changes are one feature: a correctable tee makes a passive drive-distance
  readout reliable without any per-shot interaction.

## Consequences

**Positive**:

- Zero-interaction drive distance — the thing the player actually wanted from
  shot recording — with none of the start/mark friction.
- Less surface area: one fewer module, one fewer table, two fewer buttons.
- Composes with the tee correction rather than duplicating it.

**Negative**:

- No persisted history of individual drives. The readout is live-only; once you
  leave the hole the number is gone. Acceptable — the testing showed the author
  glances at the number in the moment and doesn't review drives later.
- Distance from Tee is straight-line GPS→tee, so a lateral lie reads as a longer
  "drive" than the down-the-line carry. Fine as a glanceable estimate; it was
  never meant to be a launch monitor.

**Supersedes**: the tee-shot portions of [Phase 4](../PLANNING.md#phase-4--tee-shots--scorecard-mvp-done).
The "Set Tee" button takes the slot the shot-recording buttons used to hold.
