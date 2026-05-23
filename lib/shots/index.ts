import type { InferSelectModel } from 'drizzle-orm'
import { and, eq, isNull } from 'drizzle-orm'
import * as Location from 'expo-location'
import { create } from 'zustand'

import { db } from '@/db'
import { distanceMeters } from '@/lib/geo'
import { rounds, teeShots } from '@/lib/round/schema'

export type TeeShotRow = InferSelectModel<typeof teeShots>

/** A tee shot mid-recording: start position captured, end position pending. */
export type InFlightTeeShot = {
  roundId: string
  holeNum: number
  startLat: number
  startLng: number
}

/** A completed tee shot with both endpoints + distance. */
export type CompletedTeeShot = {
  roundId: string
  holeNum: number
  startLat: number
  startLng: number
  endLat: number
  endLng: number
  distanceM: number
  recordedAt: number
}

type ShotsStore = {
  hydrated: boolean
  inFlight: InFlightTeeShot | null
  completedByHole: Record<number, CompletedTeeShot>
}

const store = create<ShotsStore>(() => ({
  hydrated: false,
  inFlight: null,
  completedByHole: {},
}))

let hydratePromise: Promise<void> | null = null

function isCompleted(row: TeeShotRow): row is TeeShotRow & {
  endLat: number
  endLng: number
  distanceM: number
  recordedAt: number
} {
  return (
    row.endLat != null &&
    row.endLng != null &&
    row.distanceM != null &&
    row.recordedAt != null
  )
}

function hydrate(): Promise<void> {
  if (store.getState().hydrated) return Promise.resolve()
  if (hydratePromise) return hydratePromise
  hydratePromise = (async () => {
    const [active] = await db
      .select()
      .from(rounds)
      .where(isNull(rounds.endedAt))
      .limit(1)
    if (!active) {
      store.setState({ hydrated: true, inFlight: null, completedByHole: {} })
      return
    }
    const rows = await db
      .select()
      .from(teeShots)
      .where(eq(teeShots.roundId, active.id))
    let inFlight: InFlightTeeShot | null = null
    const completed: Record<number, CompletedTeeShot> = {}
    for (const r of rows) {
      if (isCompleted(r)) {
        completed[r.holeNum] = {
          roundId: r.roundId,
          holeNum: r.holeNum,
          startLat: r.startLat,
          startLng: r.startLng,
          endLat: r.endLat,
          endLng: r.endLng,
          distanceM: r.distanceM,
          recordedAt: r.recordedAt,
        }
      } else {
        inFlight = {
          roundId: r.roundId,
          holeNum: r.holeNum,
          startLat: r.startLat,
          startLng: r.startLng,
        }
      }
    }
    store.setState({ hydrated: true, inFlight, completedByHole: completed })
  })()
  return hydratePromise
}

/**
 * Kick off (or join) hydration of tee shot state from SQLite. Idempotent —
 * call after migrations + active-round hydrate. Loads any in-flight tee
 * shot so the screen can show "Mark Tee Shot" after a cold-launch resume.
 */
export function ensureHydrated(): Promise<void> {
  return hydrate()
}

/**
 * Called by lib/round when the active round changes (start/end). Forces a
 * re-hydrate so the next caller sees state scoped to the new round (or no
 * round).
 */
export function _resetForActiveRoundChange(): void {
  store.setState({ hydrated: false, inFlight: null, completedByHole: {} })
  hydratePromise = null
}

export function useCurrentTeeShot(): InFlightTeeShot | null {
  return store(s => s.inFlight)
}

export function useTeeShotForHole(
  holeNum: number,
): CompletedTeeShot | undefined {
  return store(s => s.completedByHole[holeNum])
}

async function readPosition(): Promise<{ lat: number; lng: number }> {
  const loc = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.BestForNavigation,
  })
  return { lat: loc.coords.latitude, lng: loc.coords.longitude }
}

export async function startTeeShot(
  roundId: string,
  holeNum: number,
): Promise<InFlightTeeShot> {
  await hydrate()

  // Auto-cancel any prior in-flight on a different hole — there's at most
  // one tee shot recording at a time.
  const existing = store.getState().inFlight
  if (
    existing &&
    (existing.roundId !== roundId || existing.holeNum !== holeNum)
  ) {
    await db
      .delete(teeShots)
      .where(
        and(
          eq(teeShots.roundId, existing.roundId),
          eq(teeShots.holeNum, existing.holeNum),
        ),
      )
  }

  // Re-taking on this hole overwrites the prior row.
  await db
    .delete(teeShots)
    .where(and(eq(teeShots.roundId, roundId), eq(teeShots.holeNum, holeNum)))

  const pos = await readPosition()
  await db.insert(teeShots).values({
    roundId,
    holeNum,
    startLat: pos.lat,
    startLng: pos.lng,
  })

  const inFlight: InFlightTeeShot = {
    roundId,
    holeNum,
    startLat: pos.lat,
    startLng: pos.lng,
  }
  store.setState(s => {
    const completed = { ...s.completedByHole }
    delete completed[holeNum]
    return { inFlight, completedByHole: completed }
  })
  return inFlight
}

export async function markTeeShot(): Promise<CompletedTeeShot> {
  const inFlight = store.getState().inFlight
  if (!inFlight) {
    throw new Error('No tee shot in flight — call startTeeShot first')
  }
  const pos = await readPosition()
  const distanceM = distanceMeters(
    { lat: inFlight.startLat, lng: inFlight.startLng },
    pos,
  )
  const recordedAt = Date.now()
  await db
    .update(teeShots)
    .set({
      endLat: pos.lat,
      endLng: pos.lng,
      distanceM,
      recordedAt,
    })
    .where(
      and(
        eq(teeShots.roundId, inFlight.roundId),
        eq(teeShots.holeNum, inFlight.holeNum),
      ),
    )

  const completed: CompletedTeeShot = {
    roundId: inFlight.roundId,
    holeNum: inFlight.holeNum,
    startLat: inFlight.startLat,
    startLng: inFlight.startLng,
    endLat: pos.lat,
    endLng: pos.lng,
    distanceM,
    recordedAt,
  }
  store.setState(s => ({
    inFlight: null,
    completedByHole: { ...s.completedByHole, [completed.holeNum]: completed },
  }))
  return completed
}

export async function cancelTeeShot(): Promise<void> {
  const inFlight = store.getState().inFlight
  if (!inFlight) return
  await db
    .delete(teeShots)
    .where(
      and(
        eq(teeShots.roundId, inFlight.roundId),
        eq(teeShots.holeNum, inFlight.holeNum),
      ),
    )
  store.setState({ inFlight: null })
}
