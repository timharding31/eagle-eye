# ADR-007: Find Nearby is the only course-discovery flow; search-by-name deferred

**Status**: Accepted
**Date**: 2026-05-22

## Context

Phase 5 introduces in-app course discovery — letting users (the author and friends) add courses beyond the bundled set. Three discovery models were considered:

- **A. Find Nearby**: button → Overpass query for `leisure=golf_course` within 50km of current GPS → list of matches with names + distances → tap to install. One Overpass query, single screen, no text input.
- **B. Search by name**: text input → Nominatim or Overpass name search → list of results → tap to install. Lets users add courses from anywhere, not just on-site.
- **C. Pan map and tap**: map view → user pans/zooms to course → taps on visible course area → app finds the surrounding `leisure=golf_course` polygon → install. Most visual, most UI work.

Combinations were also considered (A + B; A + B + C as fallback).

## Decision

**Find Nearby only (A) for MVP. Search by name (B) and pan-and-tap (C) deferred.**

## Consequences

**Positive**:

- Single UI affordance ("Add Nearby Course"). One screen. No text input, no spelling worries.
- Matches the realistic use case: the user is at or near the course they want to add. They can grant location permission once, tap "Find Nearby," and pick from a short list.
- Implementation: one Overpass query, one list view. ~3-4 days of work in Phase 5.
- The friend-sharing case is fine: when a friend wants to play a course Eagle Eye doesn't bundle, they go to the course (or arrive nearby), tap Find Nearby, install.

**Negative**:

- Can't add a course from the couch at home before traveling to play it. Workaround: the author can run `scripts/build-course.ts` and ship a new APK; or the user can add the course at the parking lot when they arrive.
- If a user is at a complex with multiple courses (e.g., a 36-hole resort), they may see ambiguous matches in the Find Nearby list. Acceptable — the list is small and includes course names.
- Find Nearby requires location permission to be granted. Onboarding handles this.

**Future**:

- If search-by-name becomes desirable, it slots in alongside Find Nearby as a second entry point. Same install path (Overpass fetch → normalize → SQLite + tile prefetch). The `lib/course` interface gains a `searchByName(query: string)` method.
- Pan-and-tap is a more significant UI undertaking. Defer until there's evidence of user demand.
