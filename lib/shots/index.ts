export type TeeShot = {
  roundId: string
  holeNum: number
  startLat: number
  startLng: number
  endLat?: number
  endLng?: number
  distanceM?: number
  recordedAt?: number
}

export function startTeeShot(_holeNum: number): Promise<void> {
  throw new Error('not implemented — Phase 4')
}

export function markTeeShot(): Promise<TeeShot> {
  throw new Error('not implemented — Phase 4')
}

export function cancelTeeShot(): void {
  throw new Error('not implemented — Phase 4')
}

export function useCurrentTeeShot(): TeeShot | null {
  throw new Error('not implemented — Phase 4')
}
