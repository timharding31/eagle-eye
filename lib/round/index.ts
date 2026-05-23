import type { InferSelectModel } from 'drizzle-orm'
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm'
import { create } from 'zustand'

import { db } from '@/db'
import { _resetForActiveRoundChange as resetShots } from '@/lib/shots'
import { holeStates, rounds } from './schema'

export type Round = InferSelectModel<typeof rounds>
export type HoleState = InferSelectModel<typeof holeStates>
export type LatLng = { lat: number; lng: number }

const STALE_MS = 24 * 60 * 60 * 1000

type RoundStore = {
  hydrated: boolean
  activeRound: Round | null
  // Hole states for the active round, keyed by hole_num.
  states: Record<number, HoleState>
}

const store = create<RoundStore>(() => ({
  hydrated: false,
  activeRound: null,
  states: {},
}))

let hydratePromise: Promise<void> | null = null

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
      store.setState({ hydrated: true, activeRound: null, states: {} })
      return
    }
    const rows = await db
      .select()
      .from(holeStates)
      .where(eq(holeStates.roundId, active.id))
    const byNum: Record<number, HoleState> = {}
    for (const r of rows) byNum[r.holeNum] = r
    store.setState({ hydrated: true, activeRound: active, states: byNum })
  })()
  return hydratePromise
}

/**
 * Kick off (or join) hydration of the active round from SQLite. Idempotent —
 * call after migrations have applied. Returns a promise that resolves when
 * `useIsHydrated()` will report true.
 */
export function ensureHydrated(): Promise<void> {
  return hydrate()
}

export function useActiveRound(): Round | null {
  return store(s => s.activeRound)
}

export function useIsHydrated(): boolean {
  return store(s => s.hydrated)
}

export function useHoleState(holeNum: number): HoleState | undefined {
  return store(s => s.states[holeNum])
}

export async function startRound(courseId: string): Promise<Round> {
  await hydrate()
  if (store.getState().activeRound) {
    throw new Error(
      'A round is already active — end it before starting a new one.',
    )
  }
  const round: Round = {
    id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    courseId,
    startedAt: Date.now(),
    endedAt: null,
    currentHole: 1,
    notes: null,
  }
  await db.insert(rounds).values(round)
  store.setState({ activeRound: round, states: {} })
  resetShots()
  return round
}

export async function endRound(
  roundId: string,
  scores?: Record<number, number>,
): Promise<void> {
  await db
    .update(rounds)
    .set({ endedAt: Date.now() })
    .where(eq(rounds.id, roundId))
  if (scores) {
    for (const [holeStr, score] of Object.entries(scores)) {
      const holeNum = parseInt(holeStr, 10)
      if (!Number.isFinite(holeNum)) continue
      await writeHoleState(roundId, holeNum, { score })
    }
  }
  if (store.getState().activeRound?.id === roundId) {
    store.setState({ activeRound: null, states: {} })
  }
  resetShots()
}

export async function setPin(
  roundId: string,
  holeNum: number,
  pin: LatLng,
): Promise<void> {
  await writeHoleState(roundId, holeNum, { pinLat: pin.lat, pinLng: pin.lng })
}

export async function getHoleState(
  roundId: string,
  holeNum: number,
): Promise<HoleState | null> {
  const [row] = await db
    .select()
    .from(holeStates)
    .where(
      and(eq(holeStates.roundId, roundId), eq(holeStates.holeNum, holeNum)),
    )
    .limit(1)
  return row ?? null
}

export async function setCurrentHole(
  roundId: string,
  holeNum: number,
): Promise<void> {
  await db
    .update(rounds)
    .set({ currentHole: holeNum })
    .where(eq(rounds.id, roundId))
  const active = store.getState().activeRound
  if (active?.id === roundId) {
    store.setState({ activeRound: { ...active, currentHole: holeNum } })
  }
}

export async function history(): Promise<Round[]> {
  return db.select().from(rounds).orderBy(desc(rounds.startedAt))
}

export type RoundSummary = {
  round: Round
  totalScore: number | null
  scoreCount: number
}

/**
 * Past (ended) rounds with their score totals. Excludes the active round.
 * `totalScore` is null when no scores were entered.
 */
export async function historyWithScores(): Promise<RoundSummary[]> {
  const past = await db
    .select()
    .from(rounds)
    .where(isNotNull(rounds.endedAt))
    .orderBy(desc(rounds.startedAt))
  const summaries: RoundSummary[] = []
  for (const r of past) {
    const rows = await db
      .select()
      .from(holeStates)
      .where(eq(holeStates.roundId, r.id))
    const scores = rows.map(h => h.score).filter((s): s is number => s != null)
    summaries.push({
      round: r,
      totalScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) : null,
      scoreCount: scores.length,
    })
  }
  return summaries
}

export function isStale(round: Round): boolean {
  return round.endedAt == null && Date.now() - round.startedAt > STALE_MS
}

async function writeHoleState(
  roundId: string,
  holeNum: number,
  patch: Partial<Pick<HoleState, 'pinLat' | 'pinLng' | 'score'>>,
): Promise<void> {
  await db
    .insert(holeStates)
    .values({ roundId, holeNum, ...patch })
    .onConflictDoUpdate({
      target: [holeStates.roundId, holeStates.holeNum],
      set: patch,
    })

  const [row] = await db
    .select()
    .from(holeStates)
    .where(
      and(eq(holeStates.roundId, roundId), eq(holeStates.holeNum, holeNum)),
    )
    .limit(1)
  if (row && store.getState().activeRound?.id === roundId) {
    store.setState(s => ({ states: { ...s.states, [holeNum]: row } }))
  }
}
