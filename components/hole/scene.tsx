import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'expo-router'
import * as Location from 'expo-location'

import {
  clearTeeOverride,
  getTeeOverride,
  setTeeOverride,
  type Course,
  type Hole,
} from '@/lib/course'
import { centroid, distanceMeters, type LatLng } from '@/lib/geo'
import { Round, setCurrentHole, useHoleState } from '@/lib/round'
import { M_TO_YD } from './units'

export type CameraMode = 'hole' | 'green'

// The shared per-hole scene: the derived geometry, GPS, and cross-region
// toggles that more than one of the screen's visual regions needs. Region
// components (map, measurements, button stack, drawer) read this via
// useHoleScene() instead of receiving it as props. Anything consumed by only
// one region (frame math, distances, LZ positions) is kept local to that
// region, not lifted here.
export interface HoleScene {
  course: Course
  round: Round
  currentHole: Hole
  holeNum: number

  prevHole: Hole | undefined
  nextHole: Hole | undefined
  isLastHole: boolean
  canAdvance: boolean
  goPrev: () => void
  goNext: () => void
  selectHole: (num: number) => void

  position: LatLng | null
  locationGranted: boolean | null

  pin: LatLng
  teeLL: LatLng
  greenC: LatLng
  holeYards: number

  cameraMode: CameraMode
  toggleCameraMode: () => void
  lzShown: boolean
  toggleLz: () => void

  // Tee correction. The Set Tee button opens a confirm dialog rather than
  // committing on tap; the dialog drives setTee / clearTee. hasTeeOverride
  // gates the dialog's "Clear correction" action.
  hasTeeOverride: boolean
  teeDialogOpen: boolean
  openTeeDialog: () => void
  closeTeeDialog: () => void
  setTee: () => Promise<void>
  clearTee: () => Promise<void>
  teeBusy: boolean
}

const Ctx = createContext<HoleScene | null>(null)

export function useHoleScene(): HoleScene {
  const scene = useContext(Ctx)
  if (!scene) {
    throw new Error('useHoleScene must be used within a HoleSceneProvider')
  }
  return scene
}

interface HoleSceneProviderProps {
  course: Course
  round: Round
  currentHole: Hole
  holeNum: number
  // Re-load the course after a tee correction so the overridden tee (applied
  // inside loadCourse) propagates to every downstream consumer.
  reloadCourse: () => Promise<void>
  children: ReactNode
}

export function HoleSceneProvider({
  course,
  round,
  currentHole,
  holeNum,
  reloadCourse,
  children,
}: HoleSceneProviderProps) {
  const router = useRouter()
  const holeState = useHoleState(holeNum)

  const [position, setPosition] = useState<LatLng | null>(null)
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null)
  const [cameraMode, setCameraMode] = useState<CameraMode>('hole')
  const [lzShown, setLzShown] = useState(true)
  const [teeBusy, setTeeBusy] = useState(false)
  const [teeDialogOpen, setTeeDialogOpen] = useState(false)
  const [hasTeeOverride, setHasTeeOverride] = useState(false)

  // GPS subscription.
  useEffect(() => {
    let sub: Location.LocationSubscription | undefined
    let cancelled = false
    ;(async () => {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (cancelled) return
      setLocationGranted(status === 'granted')
      if (status !== 'granted') return
      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 1,
          timeInterval: 1000,
        },
        loc => {
          setPosition({ lat: loc.coords.latitude, lng: loc.coords.longitude })
        },
      )
    })()
    return () => {
      cancelled = true
      sub?.remove()
    }
  }, [])

  // Whether this hole currently carries a tee correction — gates the dialog's
  // "Clear correction" action. Re-read on hole change; setTee / clearTee keep
  // it in sync after a write.
  useEffect(() => {
    let cancelled = false
    getTeeOverride(round.courseId, holeNum)
      .then(o => {
        if (!cancelled) setHasTeeOverride(o != null)
      })
      .catch(e => console.error('getTeeOverride failed', e))
    return () => {
      cancelled = true
    }
  }, [round.courseId, holeNum])

  // Track current_hole on the round when we arrive at a different hole.
  useEffect(() => {
    if (round.currentHole === holeNum) return
    setCurrentHole(round.id, holeNum).catch(e =>
      console.error('setCurrentHole failed', e),
    )
  }, [round, holeNum])

  // Reset the cross-region toggles when navigating to a new hole. In-render
  // compare (vs. useEffect) so the next render already has fresh values.
  // Per-region state with the same lifetime (LZ positions in the map) resets
  // itself the same way, keyed on holeNum independently.
  const [lzHoleNum, setLzHoleNum] = useState(holeNum)
  if (lzHoleNum !== holeNum) {
    setLzHoleNum(holeNum)
    setCameraMode('hole')
    setLzShown(true)
    setTeeDialogOpen(false)
  }

  const greenC = centroid(currentHole.green)
  const teeLL: LatLng = {
    lng: currentHole.tee.coordinates[0],
    lat: currentHole.tee.coordinates[1],
  }
  // Straight-line tee→green centroid distance as the hole's "yardage" for
  // display only (real scorecard yardage isn't in the OSM data).
  const holeYards = Math.round(distanceMeters(teeLL, greenC) * M_TO_YD)

  const pin: LatLng =
    holeState?.pinLat != null && holeState?.pinLng != null
      ? { lat: holeState.pinLat, lng: holeState.pinLng }
      : greenC

  const prevHole = course.holes.find(h => h.num === holeNum - 1)
  const nextHole = course.holes.find(h => h.num === holeNum + 1)
  const lastHoleNum = course.holes[course.holes.length - 1]?.num
  const isLastHole = holeNum === lastHoleNum
  const canAdvance = !!nextHole || isLastHole

  const goPrev = () => {
    if (prevHole) router.replace(`/round/${prevHole.num}` as never)
  }
  const goNext = () => {
    if (nextHole) {
      router.replace(`/round/${nextHole.num}` as never)
    } else if (isLastHole) {
      router.push('/round/scorecard' as never)
    }
  }
  const selectHole = (num: number) => {
    if (num !== holeNum) router.replace(`/round/${num}` as never)
  }

  const toggleCameraMode = () =>
    setCameraMode(prev => (prev === 'green' ? 'hole' : 'green'))
  const toggleLz = () => setLzShown(prev => !prev)

  const openTeeDialog = () => setTeeDialogOpen(true)
  const closeTeeDialog = () => setTeeDialogOpen(false)

  // Snap the corrected tee to the live GPS fix and re-load the course so every
  // downstream consumer sees the new tee. Driven by the confirm dialog, which
  // shows the move distance before committing.
  const setTee = async () => {
    if (!position || teeBusy) return
    setTeeBusy(true)
    try {
      await setTeeOverride(round.courseId, holeNum, position)
      await reloadCourse()
      setHasTeeOverride(true)
    } catch (e) {
      console.error('setTeeOverride failed', e)
    } finally {
      setTeeBusy(false)
    }
  }

  // Drop this hole's correction, restoring the source (OSM/bundled) tee — the
  // recovery path for an errant Set Tee. Re-loads so the original tee returns.
  const clearTee = async () => {
    if (teeBusy) return
    setTeeBusy(true)
    try {
      await clearTeeOverride(round.courseId, holeNum)
      await reloadCourse()
      setHasTeeOverride(false)
    } catch (e) {
      console.error('clearTeeOverride failed', e)
    } finally {
      setTeeBusy(false)
    }
  }

  const value: HoleScene = {
    course,
    round,
    currentHole,
    holeNum,
    prevHole,
    nextHole,
    isLastHole,
    canAdvance,
    goPrev,
    goNext,
    selectHole,
    position,
    locationGranted,
    pin,
    teeLL,
    greenC,
    holeYards,
    cameraMode,
    toggleCameraMode,
    lzShown,
    toggleLz,
    hasTeeOverride,
    teeDialogOpen,
    openTeeDialog,
    closeTeeDialog,
    setTee,
    clearTee,
    teeBusy,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
