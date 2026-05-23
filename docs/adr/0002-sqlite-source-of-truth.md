# ADR-002: SQLite as round source-of-truth; single active round invariant

**Status**: Accepted
**Date**: 2026-05-22

## Context

Eagle Eye persists rounds, hole states, pin positions, tee shots, and scores. There are two reasonable persistence models:

- **A. In-memory during play, write to SQLite on end.** Simpler, no per-action write cost.
- **B. Write to SQLite on every state change. Memory mirrors but SQLite is source of truth.** Resilient to crashes, every action is persistent.

Separately: should the data model permit multiple concurrent rounds, or enforce that at most one round is active at a time?

## Decision

**SQLite is the source of truth.** Every state change (pin moved, tee shot recorded, hole nav, etc.) writes to SQLite immediately. The Zustand store mirrors SQLite for fast UI reads but is rehydrated from SQLite on app start.

**At most one Round exists with `ended_at IS NULL` at any time.** This is the _single active round invariant_. Enforced inside `lib/round` — callers cannot create a second active round; `startRound` rejects if one is already active.

## Consequences

**Positive**:

- Crashes, app kills, OS memory pressure, battery death — none cause data loss. Reopen the app, the round is exactly where it was.
- No "did I save?" anxiety in the UI. No save buttons, no draft state, no "round will be lost if you leave" modals.
- The data model matches the user's mental model: nobody plays two rounds at once.
- The "active round" concept is a clean primary key for state lookups (`WHERE ended_at IS NULL LIMIT 1`).
- App's home screen has a simple branch: active round → resume; no active round → course picker.

**Negative**:

- One SQLite write per state change. Trivial in absolute terms (sub-millisecond writes to a small DB), but it does mean every interaction has I/O behind it. Acceptable.
- The invariant means you can't "pause" a round to start another. We don't have a real use case for that.
- Stale rounds (started days ago, never ended) need explicit handling. We surface a banner — see [PLANNING.md](../PLANNING.md) for the stale-round UX.

**Implementation**:

- `lib/round` owns the invariant. Drizzle queries live inside the module and are not exposed.
- `useActiveRound()` hook subscribes to the active row; updates when state changes.
- `startRound(courseId)` throws if an active round exists. Caller must `endRound` first.
- Stale-round detection: any row with `ended_at IS NULL` and `started_at < now() - 24h` is "stale" — surfaces a banner offering to end-and-save or end-and-discard.
