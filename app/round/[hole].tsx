import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { LayoutChangeEvent, NativeSyntheticEvent } from 'react-native'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  Map,
  Camera,
  GeoJSONSource,
  Layer,
  UserLocation,
  type CameraRef,
  type PressEvent,
  type PressEventWithFeatures,
} from '@maplibre/maplibre-react-native'
import * as Location from 'expo-location'

import { Hole, loadBundledCourse, type Course } from '@/lib/course'
import {
  distanceMeters,
  nearestPointOnPolygon,
  farthestPointOnPolygon,
  centroid,
  frameForHole,
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
  satelliteStyle,
  usePrefetchStatus,
  vectorStyle,
  type LayerKind,
} from '@/lib/tiles'

const M_TO_YD = 1.0936133

// Knobs for per-hole camera framing — tweak these to taste.
// FRAME_PADDING: pixel inset around the framed hole. Bigger = more breathing
//   room and slightly less zoom. Bottom is biased a bit so the tee dot
//   doesn't sit on the very edge.
// FRAME_ZOOM_ADJUST: log-2 offset applied to the auto-fit zoom. 0 = exact
//   fit. Negative pulls back (e.g. -0.5 ≈ 30% wider view); positive pushes
//   in. Try values roughly between -1.5 and +0.5.
const FRAME_PADDING = { top: 16, right: 16, bottom: 16, left: 16 }
const FRAME_ZOOM_ADJUST = -1

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
    loadBundledCourse(round.courseId)
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

  const [mapSize, setMapSize] = useState<{
    width: number
    height: number
  } | null>(null)

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

  const prevHole = course.holes.find(h => h.num === holeNum - 1)
  const nextHole = course.holes.find(h => h.num === holeNum + 1)

  const greenC = centroid(currentHole.green)
  const teeLL: LatLng = {
    lng: currentHole.tee.coordinates[0],
    lat: currentHole.tee.coordinates[1],
  }
  const framePoints: LatLng[] = [
    teeLL,
    ...currentHole.green.coordinates[0].map(([lng, lat]) => ({ lat, lng })),
  ]
  if (currentHole.fairway) {
    for (const [lng, lat] of currentHole.fairway.coordinates[0]) {
      framePoints.push({ lat, lng })
    }
  }
  const baseFrame = mapSize
    ? frameForHole({
        tee: teeLL,
        greenCentroid: greenC,
        points: framePoints,
        viewport: mapSize,
        padding: FRAME_PADDING,
      })
    : null
  const frame = baseFrame
    ? { ...baseFrame, zoom: baseFrame.zoom + FRAME_ZOOM_ADJUST }
    : null

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
    onFrameChange(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame?.center.lat, frame?.center.lng, frame?.zoom, frame?.bearing])

  const handleReframe = () => {
    if (!frame) return
    cameraRef.current?.easeTo({
      center: [frame.center.lng, frame.center.lat],
      zoom: frame.zoom,
      bearing: frame.bearing,
      duration: 400,
    })
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
    if (pointInPolygon(tap, currentHole.green)) {
      setPin(round.id, holeNum, tap).catch(err =>
        console.error('setPin failed', err),
      )
    }
  }

  return (
    <View style={styles.container}>
      <Map
        key={`map-${holeNum}-${mapLayer}`}
        style={styles.map}
        mapStyle={mapLayer === 'vector' ? vectorStyle : satelliteStyle}
        onPress={handleMapPress}
        onLayout={handleMapLayout}
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
            paint={{ 'fill-color': '#03563D', 'fill-opacity': 0.55 }}
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
            paint={{ 'line-color': '#00214C', 'line-width': 2 }}
          />
        </GeoJSONSource>

        <GeoJSONSource id="tee-src" data={currentHole.tee}>
          <Layer
            id="tee-dot"
            type="circle"
            paint={{
              'circle-radius': 7,
              'circle-color': '#FFFFFF',
              'circle-stroke-color': '#00214C',
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
              'circle-radius': 8,
              'circle-color': '#CF9F37',
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': 2,
            }}
          />
        </GeoJSONSource>
      </Map>

      <TouchableOpacity
        style={styles.reframeButton}
        onPress={handleReframe}
        accessibilityLabel="Reframe hole"
      >
        <Text style={styles.reframeButtonText}>⤢</Text>
      </TouchableOpacity>

      <View style={styles.distancePanel}>
        <Distance label="Front" value={distances?.front} />
        <Distance label="Pin" value={distances?.pin} big />
        <Distance label="Back" value={distances?.back} />
      </View>

      <View style={styles.navBar}>
        <NavButton
          label="◀ Prev"
          disabled={!prevHole}
          onPress={() =>
            prevHole && router.replace(`/round/${prevHole.num}` as never)
          }
        />
        <View style={styles.holeBadge}>
          <Text style={styles.holeBadgeLabel}>Hole</Text>
          <Text style={styles.holeBadgeNum}>{currentHole.num}</Text>
          <Text style={styles.holeBadgePar}>Par {currentHole.par}</Text>
        </View>
        <NavButton
          label="Next ▶"
          disabled={!nextHole}
          onPress={() =>
            nextHole && router.replace(`/round/${nextHole.num}` as never)
          }
        />
      </View>

      {locationGranted === false && (
        <View style={styles.permWarn}>
          <Text style={styles.permWarnText}>
            Location permission denied — distances unavailable
          </Text>
        </View>
      )}
    </View>
  )
}

function Distance({
  label,
  value,
  big,
}: {
  label: string
  value: number | undefined
  big?: boolean
}) {
  const yds = value != null ? Math.round(value * M_TO_YD) : null
  return (
    <View style={styles.distanceCell}>
      <Text style={styles.distanceLabel}>{label}</Text>
      <Text style={[styles.distanceValue, big && styles.distanceValueBig]}>
        {yds == null ? '—' : `${yds}`}
      </Text>
      <Text style={styles.distanceUnit}>yds</Text>
    </View>
  )
}

function NavButton({
  label,
  disabled,
  onPress,
}: {
  label: string
  disabled: boolean
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      style={[styles.navButton, disabled && styles.navButtonDisabled]}
      disabled={disabled}
      onPress={onPress}
    >
      <Text
        style={[styles.navButtonText, disabled && styles.navButtonTextDisabled]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  )
}

function CenterMessage({ text, busy }: { text: string; busy?: boolean }) {
  return (
    <View style={styles.centerMsg}>
      {busy ? <ActivityIndicator color="#1a472a" /> : null}
      <Text style={styles.centerMsgText}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  map: { flex: 1 },

  distancePanel: {
    flexDirection: 'row',
    backgroundColor: '#00214C',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  distanceCell: { flex: 1, alignItems: 'center' },
  distanceLabel: {
    color: '#B3E0D5',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  distanceValue: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  distanceValueBig: { fontSize: 56 },
  distanceUnit: { color: '#B3E0D5', fontSize: 11, marginTop: -2 },

  navBar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#03563D',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
  },
  navButton: {
    flex: 1,
    backgroundColor: '#00214C',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  navButtonDisabled: { backgroundColor: '#1F2937', opacity: 0.5 },
  navButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '600' },
  navButtonTextDisabled: { color: '#B3E0D5' },

  holeBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#03563D',
  },
  holeBadgeLabel: { color: '#B3E0D5', fontSize: 10, letterSpacing: 1 },
  holeBadgeNum: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 30,
  },
  holeBadgePar: { color: '#B3E0D5', fontSize: 11 },

  permWarn: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    backgroundColor: 'rgba(220,38,38,0.92)',
    padding: 8,
    borderRadius: 6,
  },
  permWarnText: { color: '#FFFFFF', textAlign: 'center', fontSize: 13 },

  reframeButton: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,33,76,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  reframeButtonText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
  },

  centerMsg: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: '#F9FAFB',
  },
  centerMsgText: { color: '#00214C', textAlign: 'center', fontSize: 16 },
})
