import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import type { LayoutChangeEvent, NativeSyntheticEvent } from 'react-native'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  Map,
  Camera,
  GeoJSONSource,
  Layer,
  Marker,
  UserLocation,
  type CameraRef,
  type PressEvent,
  type PressEventWithFeatures,
} from '@maplibre/maplibre-react-native'
import * as Location from 'expo-location'

import { IconAction, TopBar } from '@/components/TopBar'
import { Hole, loadCourse, type Course } from '@/lib/course'
import type { BBox } from '@/lib/course/types'
import {
  bboxOf,
  distanceMeters,
  nearestPointOnPolygon,
  farthestPointOnPolygon,
  centroid,
  frameForHole,
  lzInitPositions,
  pointInPolygon,
  type LatLng,
} from '@/lib/geo'
import {
  Round,
  setCurrentHole,
  setPin,
  useActiveRound,
  useHoleState,
  useIsHydrated,
} from '@/lib/round'
import {
  cancelTeeShot,
  markTeeShot,
  startTeeShot,
  useCurrentTeeShot,
  useTeeShotForHole,
} from '@/lib/shots'
import { colors, fonts, radius, shadows, space, type } from '@/lib/theme'
import {
  satelliteStyle,
  usePrefetchStatus,
  vectorStyle,
  type LayerKind,
} from '@/lib/tiles'

const M_TO_YD = 1.0936133
const YD_TO_M = 1 / M_TO_YD

// Knobs for per-hole camera framing.
// The map fills the whole screen; the TopBar and bottom drawer overlay
// it. These chrome heights (in px) are the *extra* viewport occlusion at
// each edge BEYOND the safe-area insets — the insets are added at render
// time. Bigger value = the framed hole is pushed further AWAY from that
// edge.
//   TOPBAR_CHROME ≈ TopBar inner height + small breathing gap.
//   DRAWER_CHROME ≈ CTA row + nav row + body paddings.
//   FRAME_RIGHT_CHROME ≈ width of the top-right F/G/P panel + margin —
//     keeps the framed hole from sliding under the measurements.
// FRAME_SIDE_PAD keeps the hole off the left/right edges.
// FRAME_ZOOM_ADJUST: log-2 offset on the auto-fit zoom. 0 = exact fit to
//   the visible region. Negative pulls back (-0.5 ≈ 40% wider view, -1 ≈
//   2× wider); positive pushes in. Useful range roughly -1 to +0.5.
// GREEN_ZOOM_ADJUST: same log-2 offset for the "zoom to green" frame.
//   0 ≈ exact fit of the green polygon; negative pulls back to leave
//   breathing room around the green ring.
const TOPBAR_CHROME = 164
const DRAWER_CHROME = 272
const FRAME_SIDE_PAD = 24
const FRAME_RIGHT_CHROME = 48
const FRAME_ZOOM_ADJUST = -0.5
const GREEN_ZOOM_ADJUST = -0.2

// Knobs for Landing Zone planning waypoints (par 4 / par 5 only).
// LZ_HIDE_WITHIN_M: when the player is closer than this to the pin, LZs
//   auto-hide (presumed past the tee shot). Tune if LZs hide too early on
//   short par 4s — useful range roughly 200–350 yd in metres.
// LZ_INIT_FRACTIONS: fractions along the tee→green-centroid line at which
//   each LZ initially sits. Par 4: one LZ at 2/3 (drive 2/3, approach 1/3).
//   Par 5: two LZs at 4/9 and 7/9 (drive 4/9, layup 1/3, approach 2/9).
//   Tune to taste — bias toward 1 to move waypoints closer to the green.
const LZ_HIDE_WITHIN_M = 300 * YD_TO_M
const LZ_INIT_FRACTIONS: Record<number, readonly number[]> = {
  4: [2 / 3],
  5: [4 / 9, 7 / 9],
}

type LzToggle = 'auto' | 'force-shown' | 'force-hidden'
type CameraMode = 'hole' | 'green'

function lzFractionsFor(par: number): readonly number[] {
  return LZ_INIT_FRACTIONS[par] ?? []
}

function clampToBBox(p: LatLng, bbox: BBox): LatLng {
  return {
    lat: Math.max(bbox[1], Math.min(bbox[3], p.lat)),
    lng: Math.max(bbox[0], Math.min(bbox[2], p.lng)),
  }
}

export default function HoleScreen() {
  const { hole } = useLocalSearchParams<{ hole: string }>()
  const holeNum = parseInt(hole, 10)
  const router = useRouter()

  const hydrated = useIsHydrated()
  const round = useActiveRound()
  const holeState = useHoleState(holeNum)

  const [course, setCourse] = useState<Course | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [position, setPosition] = useState<LatLng | null>(null)
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null)
  const cameraRef = useRef<CameraRef>(null)

  // Default to satellite; fall back to vector only when the satellite
  // pack errored out (e.g., ESRI unreachable + nothing cached).
  const tilesStatus = usePrefetchStatus(round?.courseId)
  const mapLayer: LayerKind =
    tilesStatus?.satellite.state === 'error' ? 'vector' : 'satellite'

  // No active round → bounce home.
  useEffect(() => {
    if (hydrated && !round) {
      router.replace('/' as never)
    }
  }, [hydrated, round, router])

  // Load the course for this round.
  useEffect(() => {
    if (!round) return
    let cancelled = false
    loadCourse(round.courseId)
      .then(c => {
        if (!cancelled) setCourse(c)
      })
      .catch(e => {
        if (!cancelled) setLoadError(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [round])

  // Track current_hole on the round when we arrive at a different hole.
  useEffect(() => {
    if (!round || !Number.isFinite(holeNum)) return
    if (round.currentHole === holeNum) return
    setCurrentHole(round.id, holeNum).catch(e =>
      console.error('setCurrentHole failed', e),
    )
  }, [round, holeNum])

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

  if (loadError) {
    return <CenterMessage text={`Course load failed: ${loadError}`} />
  }
  if (!hydrated || !round || !course) {
    return <CenterMessage text="Loading…" busy />
  }

  const currentHole = course.holes.find(h => h.num === holeNum)
  if (!currentHole) {
    const avail = course.holes.map(h => h.num).join(', ') || '(none)'
    return (
      <CenterMessage
        text={`Hole ${holeNum} not in course. Available: ${avail}`}
      />
    )
  }

  return (
    <FramedHoleScreen
      holeState={holeState}
      position={position}
      cameraRef={cameraRef}
      currentHole={currentHole}
      course={course}
      mapLayer={mapLayer}
      round={round}
      holeNum={holeNum}
      locationGranted={locationGranted}
    />
  )
}

interface FramedHoleScreenProps {
  holeState:
    | {
        pinLat: number | null
        pinLng: number | null
        roundId: string
        holeNum: number
        score: number | null
      }
    | undefined
  position: LatLng | null
  cameraRef: React.RefObject<CameraRef | null>
  currentHole: Hole
  course: Course
  mapLayer: LayerKind
  round: Round
  holeNum: number
  locationGranted: boolean | null
}

function FramedHoleScreen({
  holeState,
  position,
  cameraRef,
  currentHole,
  course,
  round,
  mapLayer,
  holeNum,
  locationGranted,
}: FramedHoleScreenProps) {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [mapSize, setMapSize] = useState<{
    width: number
    height: number
  } | null>(null)

  // The Map's `key` changes per hole/layer, so it fully remounts. Camera
  // commands (setStop/easeTo) issued before the native MapView finishes
  // attaching resolve to a null reactTag and throw. Gate them on
  // onDidFinishLoadingMap, and reset readiness in render whenever the
  // key is about to change so the effect can't race the remount.
  const mapInstanceKey = `${holeNum}-${mapLayer}`
  const [trackedMapKey, setTrackedMapKey] = useState(mapInstanceKey)
  const [isMapReady, setIsMapReady] = useState(false)
  if (trackedMapKey !== mapInstanceKey) {
    setTrackedMapKey(mapInstanceKey)
    setIsMapReady(false)
  }

  const persistedPin =
    holeState?.pinLat != null && holeState?.pinLng != null
      ? { lat: holeState.pinLat, lng: holeState.pinLng }
      : null
  const pin = persistedPin ?? centroid(currentHole.green)

  const distances = position
    ? {
        front: distanceMeters(
          position,
          nearestPointOnPolygon(position, currentHole.green),
        ),
        pin: distanceMeters(position, pin),
        back: distanceMeters(
          position,
          farthestPointOnPolygon(position, currentHole.green),
        ),
      }
    : null

  const greenC = centroid(currentHole.green)
  const teeLL: LatLng = {
    lng: currentHole.tee.coordinates[0],
    lat: currentHole.tee.coordinates[1],
  }

  // Straight-line tee→green centroid distance as the hole's "yardage" for
  // display only (real scorecard yardage isn't in the OSM data).
  const holeYards = Math.round(distanceMeters(teeLL, greenC) * M_TO_YD)

  const [lzPositions, setLzPositions] = useState<LatLng[]>(() =>
    lzInitPositions(teeLL, greenC, lzFractionsFor(currentHole.par)),
  )
  const [lzToggle, setLzToggle] = useState<LzToggle>('auto')
  const [cameraMode, setCameraMode] = useState<CameraMode>('hole')
  // Reset per-hole state when navigating to a new hole. Using the in-render
  // compare pattern (vs. useEffect) so the next render already has fresh
  // values — avoids a flash of stale waypoints from the previous hole.
  const [lzHoleNum, setLzHoleNum] = useState(holeNum)
  if (lzHoleNum !== holeNum) {
    setLzHoleNum(holeNum)
    setLzPositions(
      lzInitPositions(teeLL, greenC, lzFractionsFor(currentHole.par)),
    )
    setLzToggle('auto')
    setCameraMode('hole')
  }

  const lzVisible =
    currentHole.par >= 4 &&
    (lzToggle === 'force-shown' ||
      (lzToggle !== 'force-hidden' &&
        (position === null ||
          distanceMeters(position, pin) >= LZ_HIDE_WITHIN_M)))

  const prevHole = course.holes.find(h => h.num === holeNum - 1)
  const nextHole = course.holes.find(h => h.num === holeNum + 1)
  const lastHoleNum = course.holes[course.holes.length - 1]?.num
  const isLastHole = holeNum === lastHoleNum
  const canAdvance = !!nextHole || isLastHole

  const inFlight = useCurrentTeeShot()
  const completedShot = useTeeShotForHole(holeNum)
  const inFlightHere =
    inFlight?.holeNum === holeNum && inFlight?.roundId === round.id
  // Dismiss is keyed by hole so navigating away and back re-shows the prompt
  // without a useEffect that resets state on holeNum change.
  const [dismissedHoleNum, setDismissedHoleNum] = useState<number | null>(null)
  const shotDismissed = dismissedHoleNum === holeNum
  const [shotBusy, setShotBusy] = useState(false)

  const handleStartShot = async () => {
    if (shotBusy) return
    setShotBusy(true)
    try {
      await startTeeShot(round.id, holeNum)
    } catch (e) {
      console.error('startTeeShot failed', e)
    } finally {
      setShotBusy(false)
    }
  }

  const handleMarkShot = async () => {
    if (shotBusy) return
    setShotBusy(true)
    try {
      await markTeeShot()
    } catch (e) {
      console.error('markTeeShot failed', e)
    } finally {
      setShotBusy(false)
    }
  }

  const handleCancelShot = async () => {
    try {
      await cancelTeeShot()
    } catch (e) {
      console.error('cancelTeeShot failed', e)
    }
  }

  const handleNext = () => {
    if (nextHole) {
      router.replace(`/round/${nextHole.num}` as never)
    } else if (isLastHole) {
      router.push('/round/scorecard' as never)
    }
  }

  const greenPoints: LatLng[] = currentHole.green.coordinates[0].map(
    ([lng, lat]) => ({ lat, lng }),
  )
  const framePoints: LatLng[] = [teeLL, ...greenPoints]
  if (currentHole.fairway) {
    for (const [lng, lat] of currentHole.fairway.coordinates[0]) {
      framePoints.push({ lat, lng })
    }
  }
  const holeBbox = bboxOf(framePoints)
  const framePadding = {
    top: insets.top + TOPBAR_CHROME,
    bottom: insets.bottom + DRAWER_CHROME,
    left: FRAME_SIDE_PAD,
    right: FRAME_SIDE_PAD + FRAME_RIGHT_CHROME,
  }
  const baseHoleFrame = mapSize
    ? frameForHole({
        tee: teeLL,
        greenCentroid: greenC,
        points: framePoints,
        viewport: mapSize,
        padding: framePadding,
      })
    : null
  const holeFrame = baseHoleFrame
    ? { ...baseHoleFrame, zoom: baseHoleFrame.zoom + FRAME_ZOOM_ADJUST }
    : null

  const baseGreenFrame = mapSize
    ? frameForHole({
        tee: teeLL,
        greenCentroid: greenC,
        points: greenPoints,
        viewport: mapSize,
        padding: framePadding,
      })
    : null
  const greenFrame = baseGreenFrame
    ? { ...baseGreenFrame, zoom: baseGreenFrame.zoom + GREEN_ZOOM_ADJUST }
    : null

  const frame = cameraMode === 'green' ? greenFrame : holeFrame

  // Re-frame on hole change or first layout — initialViewState only fires
  // on Camera mount, and the Map key changes per hole/layer, so applying
  // setStop here keeps subsequent navigations centered.
  const onFrameChange = useEffectEvent(
    (
      frame: {
        center: LatLng
        zoom: number
        bearing: number
      } | null,
    ) => {
      if (!frame) return
      const { center, zoom, bearing } = frame
      cameraRef.current?.setStop({
        center: [center.lng, center.lat],
        zoom: zoom,
        bearing: bearing,
      })
    },
  )

  useEffect(() => {
    if (!isMapReady) return
    onFrameChange(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isMapReady,
    frame?.center.lat,
    frame?.center.lng,
    frame?.zoom,
    frame?.bearing,
  ])

  const handleToggleCameraMode = () => {
    setCameraMode(prev => (prev === 'green' ? 'hole' : 'green'))
  }

  const handleMapLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    setMapSize(prev =>
      prev && prev.width === width && prev.height === height
        ? prev
        : { width, height },
    )
  }

  const handleMapPress = (
    e:
      | NativeSyntheticEvent<PressEvent>
      | NativeSyntheticEvent<PressEventWithFeatures>,
  ) => {
    const lngLat = e.nativeEvent?.lngLat
    if (!lngLat || lngLat.length < 2) return
    const tap: LatLng = { lat: lngLat[1], lng: lngLat[0] }

    // Zoom-to-green mode is the only mode in which the pin is editable —
    // tap inside the green polygon to drop the pin there. Outside the
    // green is a no-op so accidental misses don't leave the pin behind.
    if (cameraMode === 'green') {
      if (pointInPolygon(tap, currentHole.green)) {
        setPin(round.id, holeNum, tap).catch(err =>
          console.error('setPin failed', err),
        )
      }
      return
    }

    // Hole-frame mode: tap moves the nearest visible Landing Zone.
    // LZs get clamped to the hole's framing envelope so they can't escape
    // the visible area. Par 3s (no LZs) intentionally swallow taps here —
    // the user has to enter zoom-to-green to touch the pin.
    if (lzVisible && lzPositions.length > 0) {
      let bestIdx = 0
      let bestD = Infinity
      for (let i = 0; i < lzPositions.length; i++) {
        const d = distanceMeters(tap, lzPositions[i])
        if (d < bestD) {
          bestD = d
          bestIdx = i
        }
      }
      const clamped = clampToBBox(tap, holeBbox)
      setLzPositions(prev => prev.map((p, i) => (i === bestIdx ? clamped : p)))
    }
  }

  const handleToggleLz = () => {
    setLzToggle(prev =>
      prev === 'auto'
        ? 'force-shown'
        : prev === 'force-shown'
          ? 'force-hidden'
          : 'auto',
    )
  }

  type LzSegment = {
    from: LatLng
    to: LatLng
    distanceM: number
    midpoint: LatLng
  }
  const lzSegments: LzSegment[] = []
  if (lzVisible) {
    const chain: LatLng[] = [teeLL, ...lzPositions, pin]
    for (let i = 0; i < chain.length - 1; i++) {
      const from = chain[i]
      const to = chain[i + 1]
      lzSegments.push({
        from,
        to,
        distanceM: distanceMeters(from, to),
        midpoint: {
          lat: (from.lat + to.lat) / 2,
          lng: (from.lng + to.lng) / 2,
        },
      })
    }
  }

  // Position the floating reframe / LZ-toggle buttons just under the
  // glass TopBar (insets.top + ~64 bar + small gap).
  const floatingTop = insets.top + 72

  return (
    <View style={styles.container}>
      <Map
        key={`map-${holeNum}-${mapLayer}`}
        style={styles.map}
        mapStyle={mapLayer === 'vector' ? vectorStyle : satelliteStyle}
        onPress={handleMapPress}
        onLayout={handleMapLayout}
        onDidFinishLoadingMap={() => setIsMapReady(true)}
        compass={false}
      >
        <Camera
          ref={cameraRef}
          initialViewState={
            frame
              ? {
                  center: [frame.center.lng, frame.center.lat],
                  zoom: frame.zoom,
                  bearing: frame.bearing,
                }
              : undefined
          }
        />
        <UserLocation />

        <GeoJSONSource id="green-src" data={currentHole.green}>
          <Layer
            id="green-fill"
            type="fill"
            paint={{ 'fill-color': colors.fairwayGreen, 'fill-opacity': 0.45 }}
          />
        </GeoJSONSource>

        <GeoJSONSource
          id="green-outline-src"
          data={{
            type: 'LineString',
            coordinates: currentHole.green.coordinates[0],
          }}
        >
          <Layer
            id="green-outline"
            type="line"
            paint={{ 'line-color': colors.primary, 'line-width': 1.5 }}
          />
        </GeoJSONSource>

        {lzSegments.map((seg, i) => (
          <GeoJSONSource
            key={`lz-seg-src-${i}`}
            id={`lz-seg-src-${i}`}
            data={{
              type: 'LineString',
              coordinates: [
                [seg.from.lng, seg.from.lat],
                [seg.to.lng, seg.to.lat],
              ],
            }}
          >
            <Layer
              id={`lz-seg-${i}`}
              type="line"
              paint={{
                'line-color': colors.primary,
                'line-width': 2,
                'line-dasharray': [2, 2],
                'line-opacity': 0.85,
              }}
            />
          </GeoJSONSource>
        ))}

        {lzSegments.map((seg, i) => (
          <Marker
            key={`lz-mid-${i}`}
            id={`lz-mid-${i}`}
            lngLat={[seg.midpoint.lng, seg.midpoint.lat]}
            anchor="center"
          >
            <View style={styles.lzLabel} pointerEvents="none">
              <Text style={styles.lzLabelText}>
                {Math.round(seg.distanceM * M_TO_YD)}
              </Text>
            </View>
          </Marker>
        ))}

        <GeoJSONSource id="tee-src" data={currentHole.tee}>
          <Layer
            id="tee-dot"
            type="circle"
            paint={{
              'circle-radius': 7,
              'circle-color': colors.primary,
              'circle-stroke-color': colors.surfaceHighest,
              'circle-stroke-width': 2,
            }}
          />
        </GeoJSONSource>

        <GeoJSONSource
          id="pin-src"
          data={{ type: 'Point', coordinates: [pin.lng, pin.lat] }}
        >
          <Layer
            id="pin-dot"
            type="circle"
            paint={{
              'circle-radius': 9,
              'circle-color': colors.pinFill,
              'circle-stroke-color': colors.primary,
              'circle-stroke-width': 2,
            }}
          />
        </GeoJSONSource>

        {lzVisible &&
          lzPositions.map((lz, i) => (
            <GeoJSONSource
              key={`lz-dot-src-${i}`}
              id={`lz-dot-src-${i}`}
              data={{ type: 'Point', coordinates: [lz.lng, lz.lat] }}
            >
              <Layer
                id={`lz-dot-${i}`}
                type="circle"
                paint={{
                  'circle-radius': 8,
                  'circle-color': colors.landingZoneFill,
                  'circle-stroke-color': colors.primary,
                  'circle-stroke-width': 2,
                }}
              />
            </GeoJSONSource>
          ))}
      </Map>

      <TopBar
        title={`HOLE ${currentHole.num}`}
        subtitle={`PAR ${currentHole.par} • ${holeYards} YARDS`}
        variant="glass"
        right={
          <IconAction
            label="Home"
            glyph="⌂"
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace('/' as never)
            }
          />
        }
        style={styles.topBarOverlay}
      />

      <TouchableOpacity
        style={[styles.floatBtn, { top: floatingTop, left: space.md }]}
        onPress={handleToggleCameraMode}
        accessibilityLabel={
          cameraMode === 'green' ? 'Zoom back to hole' : 'Zoom to green'
        }
      >
        <Text style={styles.floatBtnGlyph}>
          {cameraMode === 'green' ? '⤢' : '⊙'}
        </Text>
      </TouchableOpacity>

      <FgpPanel distances={distances} top={floatingTop} />

      {currentHole.par >= 4 && cameraMode === 'hole' && (
        <TouchableOpacity
          style={[
            styles.floatBtn,
            styles.lzBtn,
            { top: floatingTop, left: space.md + 56 },
            lzToggle === 'force-shown' && styles.lzBtnShown,
            lzToggle === 'force-hidden' && styles.lzBtnHidden,
          ]}
          onPress={handleToggleLz}
          accessibilityLabel={`Landing zones: ${lzToggle}`}
        >
          <Text style={styles.lzBtnText}>
            {lzToggle === 'force-shown'
              ? 'LZ ✓'
              : lzToggle === 'force-hidden'
                ? 'LZ ✗'
                : 'LZ'}
          </Text>
        </TouchableOpacity>
      )}

      <BottomDrawer
        insetsBottom={insets.bottom}
        currentHole={currentHole}
        holes={course.holes}
        prevHole={prevHole}
        nextHole={nextHole}
        canAdvance={canAdvance}
        isLastHole={isLastHole}
        onPrev={() =>
          prevHole && router.replace(`/round/${prevHole.num}` as never)
        }
        onNext={handleNext}
        onSelectHole={num => {
          if (num !== holeNum) {
            router.replace(`/round/${num}` as never)
          }
        }}
        shotMode={
          inFlightHere
            ? 'in-flight'
            : completedShot
              ? 'done'
              : shotDismissed
                ? 'dismissed'
                : 'idle'
        }
        completedShot={completedShot}
        shotBusy={shotBusy}
        onStartShot={handleStartShot}
        onMarkShot={handleMarkShot}
        onCancelShot={handleCancelShot}
        onDismissShot={() => setDismissedHoleNum(holeNum)}
        onUndismissShot={() => setDismissedHoleNum(null)}
      />

      {locationGranted === false && (
        <View
          style={[styles.permWarn, { top: insets.top + 80 + space.lg + 56 }]}
        >
          <Text style={styles.permWarnText}>
            Location permission denied — distances unavailable
          </Text>
        </View>
      )}
    </View>
  )
}

interface DrawerProps {
  insetsBottom: number
  currentHole: Hole
  holes: Hole[]
  prevHole: Hole | undefined
  nextHole: Hole | undefined
  canAdvance: boolean
  isLastHole: boolean
  onPrev: () => void
  onNext: () => void
  onSelectHole: (holeNum: number) => void
  shotMode: 'idle' | 'in-flight' | 'done' | 'dismissed'
  completedShot:
    | { distanceM: number; recordedAt: number; holeNum: number }
    | undefined
  shotBusy: boolean
  onStartShot: () => void
  onMarkShot: () => void
  onCancelShot: () => void
  onDismissShot: () => void
  onUndismissShot: () => void
}

// Per-cell size in the hole-grid (square, aspectRatio: 1). Used both for the
// flex layout and for computing the Animated height target on expand. The
// effective natural cell size is (screenW - 2*marginMobile - 5*gap) / 6 —
// we clamp the animation target to that, then add row gaps + paddings.
const GRID_COLS = 6
const GRID_GAP = 8
const GRID_PAD_TOP = space.md
const GRID_PAD_BOTTOM = space.sm

function BottomDrawer({
  insetsBottom,
  currentHole,
  holes,
  prevHole,
  nextHole,
  canAdvance,
  isLastHole,
  onPrev,
  onNext,
  onSelectHole,
  shotMode,
  completedShot,
  shotBusy,
  onStartShot,
  onMarkShot,
  onCancelShot,
  onDismissShot,
  onUndismissShot,
}: DrawerProps) {
  const { width: screenW } = useWindowDimensions()
  const [expanded, setExpanded] = useState(false)
  // Lazy useState (not useRef) so the value can be referenced from JSX
  // without tripping the react-hooks/refs lint rule. Animated.Value is
  // mutable but stable across renders, so single initialization is fine.
  const [heightAnim] = useState(() => new Animated.Value(0))

  const gridHeight = useMemo(() => {
    const usable = screenW - 2 * space.marginMobile - (GRID_COLS - 1) * GRID_GAP
    const cellSize = Math.max(0, usable / GRID_COLS)
    const numRows = Math.ceil(holes.length / GRID_COLS)
    if (numRows === 0) return 0
    return (
      numRows * cellSize +
      (numRows - 1) * GRID_GAP +
      GRID_PAD_TOP +
      GRID_PAD_BOTTOM
    )
  }, [holes.length, screenW])

  // Snap closed whenever the active hole changes (e.g., Prev/Next pressed
  // while the grid is open). In-render compare avoids a useEffect that
  // would briefly show stale state on remount.
  const [trackedHoleNum, setTrackedHoleNum] = useState(currentHole.num)
  if (trackedHoleNum !== currentHole.num) {
    setTrackedHoleNum(currentHole.num)
    if (expanded) setExpanded(false)
  }

  useEffect(() => {
    Animated.timing(heightAnim, {
      toValue: expanded ? gridHeight : 0,
      duration: 220,
      useNativeDriver: false,
    }).start()
  }, [expanded, gridHeight, heightAnim])

  const handleSelect = (num: number) => {
    setExpanded(false)
    onSelectHole(num)
  }

  return (
    <View style={[drawer.wrap, { paddingBottom: insetsBottom }]}>
      <Animated.View style={[drawer.gridWrap, { height: heightAnim }]}>
        <HoleGrid
          holes={holes}
          currentHoleNum={currentHole.num}
          onSelect={handleSelect}
        />
      </Animated.View>

      <View style={drawer.body}>
        <View style={drawer.shotRow}>
          <ShotPrimary
            mode={shotMode}
            completedShot={completedShot}
            busy={shotBusy}
            onStart={onStartShot}
            onMark={onMarkShot}
            onUndismiss={onUndismissShot}
          />
          <ShotSecondary
            mode={shotMode}
            onCancel={onCancelShot}
            onDismiss={onDismissShot}
            onStart={onStartShot}
            busy={shotBusy}
          />
        </View>
      </View>

      <View style={drawer.nav}>
        <NavButton
          label="PREV"
          glyph="‹"
          disabled={!prevHole}
          onPress={onPrev}
        />
        <TouchableOpacity
          style={drawer.navCenter}
          onPress={() => setExpanded(prev => !prev)}
          activeOpacity={0.7}
          accessibilityLabel={
            expanded ? 'Close hole selector' : 'Open hole selector'
          }
        >
          <Text style={drawer.navCenterLabel}>HOLE</Text>
          <View style={drawer.navCenterRow}>
            <Text style={drawer.navCenterNum}>{currentHole.num}</Text>
          </View>
        </TouchableOpacity>
        <NavButton
          label={isLastHole ? 'CARD' : 'NEXT'}
          glyph="›"
          glyphRight
          disabled={!canAdvance}
          onPress={onNext}
        />
      </View>
    </View>
  )
}

function HoleGrid({
  holes,
  currentHoleNum,
  onSelect,
}: {
  holes: Hole[]
  currentHoleNum: number
  onSelect: (num: number) => void
}) {
  const rows: Hole[][] = []
  for (let i = 0; i < holes.length; i += GRID_COLS) {
    rows.push(holes.slice(i, i + GRID_COLS))
  }
  return (
    <View style={drawer.gridInner}>
      {rows.map((row, ri) => (
        <View key={ri} style={drawer.gridRow}>
          {row.map(h => {
            const active = h.num === currentHoleNum
            return (
              <TouchableOpacity
                key={h.num}
                style={[drawer.gridCell, active && drawer.gridCellActive]}
                onPress={() => onSelect(h.num)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    drawer.gridCellNum,
                    active && drawer.gridCellNumActive,
                  ]}
                >
                  {h.num}
                </Text>
                <Text style={drawer.gridCellPar}>PAR {h.par}</Text>
              </TouchableOpacity>
            )
          })}
          {row.length < GRID_COLS &&
            Array.from({ length: GRID_COLS - row.length }).map((_, i) => (
              <View key={`spacer-${i}`} style={drawer.gridCellSpacer} />
            ))}
        </View>
      ))}
    </View>
  )
}

function ShotPrimary({
  mode,
  completedShot,
  busy,
  onStart,
  onMark,
  onUndismiss,
}: {
  mode: DrawerProps['shotMode']
  completedShot: DrawerProps['completedShot']
  busy: boolean
  onStart: () => void
  onMark: () => void
  onUndismiss: () => void
}) {
  if (mode === 'in-flight') {
    return (
      <TouchableOpacity
        style={[ctaStyles.cta, ctaStyles.markCta]}
        onPress={onMark}
        disabled={busy}
        activeOpacity={0.85}
      >
        <Text style={ctaStyles.glyph}>⛳</Text>
        <Text style={ctaStyles.label}>MARK TEE SHOT</Text>
      </TouchableOpacity>
    )
  }
  if (mode === 'done' && completedShot) {
    const yds = Math.round(completedShot.distanceM * M_TO_YD)
    return (
      <View style={[ctaStyles.cta, ctaStyles.doneCta]}>
        <Text style={ctaStyles.glyph}>⛳</Text>
        <Text style={ctaStyles.label}>TEE SHOT {yds} YDS</Text>
      </View>
    )
  }
  if (mode === 'dismissed') {
    return (
      <TouchableOpacity
        style={[ctaStyles.cta, ctaStyles.startCta]}
        onPress={onUndismiss}
        activeOpacity={0.85}
      >
        <Text style={ctaStyles.glyph}>⛳</Text>
        <Text style={ctaStyles.label}>RECORD TEE SHOT</Text>
      </TouchableOpacity>
    )
  }
  // idle
  return (
    <TouchableOpacity
      style={[ctaStyles.cta, ctaStyles.startCta]}
      onPress={onStart}
      disabled={busy}
      activeOpacity={0.85}
    >
      <Text style={ctaStyles.glyph}>⛳</Text>
      <Text style={ctaStyles.label}>START TEE SHOT</Text>
    </TouchableOpacity>
  )
}

function ShotSecondary({
  mode,
  onCancel,
  onDismiss,
  onStart,
  busy,
}: {
  mode: DrawerProps['shotMode']
  onCancel: () => void
  onDismiss: () => void
  onStart: () => void
  busy: boolean
}) {
  if (mode === 'in-flight') {
    return (
      <TouchableOpacity
        style={ctaStyles.iconBtn}
        onPress={onCancel}
        accessibilityLabel="Cancel tee shot"
      >
        <Text style={ctaStyles.iconBtnGlyph}>✕</Text>
      </TouchableOpacity>
    )
  }
  if (mode === 'done') {
    return (
      <TouchableOpacity
        style={ctaStyles.iconBtn}
        onPress={onStart}
        disabled={busy}
        accessibilityLabel="Re-record tee shot"
      >
        <Text style={ctaStyles.iconBtnGlyph}>↻</Text>
      </TouchableOpacity>
    )
  }
  // idle / dismissed
  return (
    <TouchableOpacity
      style={ctaStyles.iconBtn}
      onPress={onDismiss}
      accessibilityLabel="Dismiss tee shot prompt"
    >
      <Text style={ctaStyles.iconBtnGlyph}>✕</Text>
    </TouchableOpacity>
  )
}

function FgpPanel({
  distances,
  top,
}: {
  distances: { front: number; pin: number; back: number } | null
  top: number
}) {
  return (
    <View style={[fgp.panel, { top }]} pointerEvents="none">
      <FgpCell label="BACK" value={distances?.back} />
      <View style={fgp.divider} />
      <FgpCell label="PIN" value={distances?.pin} primary />
      <View style={fgp.divider} />
      <FgpCell label="FRONT" value={distances?.front} />
    </View>
  )
}

function FgpCell({
  label,
  value,
  primary,
}: {
  label: string
  value: number | undefined
  primary?: boolean
}) {
  const yds = value != null ? Math.round(value * M_TO_YD) : null
  return (
    <View style={fgp.cell}>
      <Text style={[fgp.label, primary && fgp.labelPrimary]}>{label}</Text>
      <Text style={[fgp.value, primary && fgp.valuePrimary]}>
        {yds == null ? '—' : `${yds}`}
      </Text>
    </View>
  )
}

function NavButton({
  label,
  glyph,
  glyphRight,
  disabled,
  onPress,
}: {
  label: string
  glyph: string
  glyphRight?: boolean
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      style={[navBtn.wrap, disabled && navBtn.disabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      {!glyphRight && <Text style={navBtn.glyph}>{glyph}</Text>}
      <Text style={navBtn.label}>{label}</Text>
      {glyphRight && <Text style={navBtn.glyph}>{glyph}</Text>}
    </TouchableOpacity>
  )
}

function CenterMessage({ text, busy }: { text: string; busy?: boolean }) {
  return (
    <View style={styles.centerMsg}>
      {busy ? <ActivityIndicator color={colors.primary} /> : null}
      <Text style={styles.centerMsgText}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceLowest },
  map: { flex: 1 },

  topBarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },

  floatBtn: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.glassSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    ...shadows.card,
  },
  floatBtnGlyph: {
    color: colors.primary,
    fontSize: 20,
    fontFamily: 'Sora_700Bold',
  },

  lzBtn: {
    width: 52,
    height: 44,
    borderRadius: radius.full,
    paddingHorizontal: 10,
  },
  lzBtnShown: {
    backgroundColor: colors.secondary,
    borderColor: colors.primary,
  },
  lzBtnHidden: {
    backgroundColor: colors.surfaceLow,
    borderColor: colors.outlineVariant,
    opacity: 0.65,
  },
  lzBtnText: {
    color: colors.primary,
    fontSize: 13,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.5,
  },

  permWarn: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    backgroundColor: colors.errorContainer,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.error,
  },
  permWarnText: {
    ...type.bodyMd,
    color: colors.primary,
    textAlign: 'center',
  },

  lzLabel: {
    backgroundColor: colors.glass,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
  },
  lzLabelText: {
    color: colors.primary,
    fontFamily: fonts.data,
    fontSize: 12,
    letterSpacing: 0.5,
  },

  centerMsg: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: colors.surface,
  },
  centerMsgText: { ...type.bodyMd, textAlign: 'center' },
})

const drawer = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surfaceHighest,
    borderTopLeftRadius: radius['3xl'],
    borderTopRightRadius: radius['3xl'],
    ...shadows.drawer,
  },
  body: {
    paddingHorizontal: space.marginMobile,
    paddingTop: space.lg,
    paddingBottom: space.md,
    gap: space.md,
  },
  shotRow: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'stretch',
  },
  nav: {
    height: 88,
    paddingHorizontal: space.marginMobile,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineVariant,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
  },
  navCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: space.sm,
  },
  navCenterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  navCenterNum: {
    color: colors.primary,
    fontFamily: 'Sora_700Bold',
    fontSize: 24,
    lineHeight: 24,
  },
  navCenterLabel: { ...type.labelXs },

  gridWrap: {
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant,
  },
  gridInner: {
    paddingHorizontal: space.marginMobile,
    paddingTop: GRID_PAD_TOP,
    paddingBottom: GRID_PAD_BOTTOM,
    gap: GRID_GAP,
  },
  gridRow: {
    flexDirection: 'row',
    gap: GRID_GAP,
  },
  gridCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  gridCellActive: {
    backgroundColor: colors.secondary,
    borderColor: colors.primary,
  },
  gridCellSpacer: { flex: 1 },
  gridCellNum: {
    color: colors.primary,
    fontFamily: 'Sora_700Bold',
    fontSize: 18,
    lineHeight: 20,
  },
  gridCellNumActive: {
    color: colors.onSecondary,
  },
  gridCellPar: {
    color: colors.onSurfaceVariant,
    fontFamily: 'Sora_600SemiBold',
    fontSize: 9,
    letterSpacing: 1.2,
  },
})

const fgp = StyleSheet.create({
  panel: {
    position: 'absolute',
    right: space.sm,
    backgroundColor: colors.glass,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    ...shadows.card,
  },
  cell: {
    alignItems: 'flex-end',
    gap: 2,
    paddingVertical: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.outlineVariant,
    marginVertical: 4,
  },
  label: {
    ...type.labelXs,
  },
  labelPrimary: {
    color: colors.primary,
    fontSize: 11,
    letterSpacing: 1.6,
  },
  value: {
    color: colors.onSurface,
    fontFamily: 'Sora_600SemiBold',
    fontSize: 22,
    lineHeight: 26,
    fontVariant: ['tabular-nums'],
  },
  valuePrimary: {
    color: colors.primary,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.5,
  },
})

const ctaStyles = StyleSheet.create({
  cta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: radius.xl,
    gap: 10,
    paddingHorizontal: space.md,
    ...shadows.cta,
  },
  startCta: { backgroundColor: colors.secondary },
  markCta: { backgroundColor: '#a83232' },
  doneCta: {
    backgroundColor: colors.surfaceHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
  },
  glyph: { color: colors.primary, fontSize: 20 },
  label: {
    color: colors.primary,
    fontFamily: 'Sora_700Bold',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  iconBtn: {
    width: 56,
    height: 56,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnGlyph: {
    color: colors.onSurface,
    fontSize: 20,
    fontFamily: 'Sora_700Bold',
  },
})

const navBtn = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.sm,
    paddingVertical: 16,
    minWidth: 80,
  },
  disabled: { opacity: 0.35 },
  glyph: {
    color: colors.onSurfaceVariant,
    fontFamily: 'Sora_700Bold',
    fontSize: 24,
    lineHeight: 24,
    marginTop: -3,
  },
  label: {
    color: colors.onSurfaceVariant,
    fontFamily: 'Sora_700Bold',
    fontSize: 11,
    letterSpacing: 1.6,
  },
})
