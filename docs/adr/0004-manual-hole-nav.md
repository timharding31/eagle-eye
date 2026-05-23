# ADR-004: Manual hole navigation; no GPS auto-detect

**Status**: Accepted
**Date**: 2026-05-22

## Context

Commercial golf-GPS apps auto-advance to the next hole when the user's GPS indicates they've moved from the green of hole N to near the tee of hole N+1. This is a convenience feature that reduces taps during a round.

Auto-detect requires:

- Per-hole tee box data (we have it — Tier 1).
- A heuristic (proximity to next tee? exited current green polygon? closest hole tee + green pair?).
- Edge case handling: playing out of order, replaying a hole, skipping holes, walking off the green to retrieve something, par-3 courses with weird routings, courses with adjacent tees from different holes.
- A manual override anyway, for when the heuristic gets it wrong.

The cost of _manual_ hole nav, by contrast: one tap per hole at the end of each hole. ~18 taps per round.

## Decision

**Manual hole navigation only. No GPS auto-detect.**

The hole screen has a "Next Hole" button and a "Previous Hole" button. The hole header is tappable, opening a 1–18 grid for jumping to any hole. No proximity heuristics, no auto-advance.

## Consequences

**Positive**:

- Predictability: the user is always exactly on the hole they think they're on. No mid-round surprise of the screen flipping holes during a putt.
- Simplicity: ~5 lines of state management vs hundreds for a robust auto-detect.
- Matches the project's stated UX goal of "extremely simple, large buttons, few features."
- One tap per hole is trivial — far less burden than the constant interaction with ad-laden commercial apps.
- A big "Next Hole" button is on-brand.

**Negative**:

- User can forget to tap, end up looking at hole 7 data while on hole 8. Recovery: hole header → 1–18 grid → tap 8. No data loss (shots are tied to GPS + hole at time of tap, not retroactively).
- Doesn't show off the "smart" capability that commercial apps highlight. Intentional.

**Future reconsideration**:

- If, after extended use, the manual tap genuinely becomes annoying, auto-detect can be added as an opt-in setting without changing the data model. The hole nav state remains user-driven; auto-detect would just synthesize taps based on GPS. The architecture supports it.
