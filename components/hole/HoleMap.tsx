import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { LayoutChangeEvent, NativeSyntheticEvent } from 'react-native'
import { View, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Map,
  Camera,
  GeoJSONSource,
  Layer,
  Marker,
  type CameraRef,
  type PressEvent,
  type PressEventWithFeatures,
} from '@maplibre/maplibre-react-native'

import {
  bboxOf,
  bearingDeg,
  clampToHoleEnvelope,
  distanceMeters,
  frameForHole,
  lzInitPositions,
  metersPerPixel,
  pointInPolygon,
  type LatLng,
} from '@/lib/geo'
import { setPin } from '@/lib/round'
import { colors, fonts, radius } from '@/lib/theme'
import {
  satelliteStyleFor,
  usePrefetchStatus,
  vectorStyle,
  type LayerKind,
} from '@/lib/tiles'
import { CrosshairIcon, FlagIcon, GolfTeeIcon } from '@/components/icons'

import { useHoleScene } from './scene'
import { M_TO_YD } from './units'

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
//   breathing room around the green ring. The large TOPBAR/DRAWER chrome
//   padding already insets the green heavily, so 0 still leaves room — and it
//   pushes the camera to ~z19–20, where ESRI's native z20 tiles (MAX_ZOOM=20)
//   actually render sharp. At -1 the camera sat at ~z18 and never requested
//   them. Pull toward -0.5 if the green feels too tight.
const TOPBAR_CHROME = 244
const DRAWER_CHROME = 272
const FRAME_SIDE_PAD = 24
const FRAME_RIGHT_CHROME = 56
const FRAME_ZOOM_ADJUST = 0
const GREEN_ZOOM_ADJUST = -1

// Camera zoom used for the very first mount, before onLayout gives us a real
// viewport to compute the exact hole frame. Without an explicit initial the
// camera mounts at the world view (z0) and the satellite source fetches global
// tiles for an instant before the first reframe — wasteful, and very visible at
// small render tileSizes (each step down requests deeper, more numerous tiles).
// Seed a hole-centered view at this zoom instead, so only local tiles ever load;
// onFrameChange refines to the exact frame the moment mapSize is known. Keep it
// a touch wider than the real hole frame (~z16.5) so all geometry is visible on
// the first paint. Range hint: 14 (wider, safer) – 16 (tighter, less churn).
const HOLE_INIT_FALLBACK_ZOOM = 16

// Knobs for Landing Zone planning waypoints (par 4 / par 5 only).
// LZ_INIT_FRACTIONS: fractions along the tee→green-centroid line at which
//   each LZ initially sits. Par 4: one LZ at 2/3 (drive 2/3, approach 1/3).
//   Par 5: two LZs at 4/9 and 7/9 (drive 4/9, layup 1/3, approach 2/9).
//   Tune to taste — bias toward 1 to move waypoints closer to the green.
const LZ_INIT_FRACTIONS: Record<number, readonly number[]> = {
  4: [2 / 3],
  5: [4 / 9, 7 / 9],
}

// Gap (in screen px) left between a Landing Zone marker and the
// planning segments meeting it, so the line doesn't run through the
// crosshair's hollow center. Converted to metres at the active frame zoom.
const LZ_LINE_GAP_PX = 7

// Whether the LZ planning segments draw as a solid line or a dashed one.
// 'dashed' adds line-dasharray: [2, 2]; 'solid' omits it. Flip to revisit
// the dashed look.
const LINE_STYLE: 'solid' | 'dashed' = 'solid'

function lzFractionsFor(par: number): readonly number[] {
  return LZ_INIT_FRACTIONS[par] ?? []
}

// Move `from` toward `to` by `gapM` metres, returning the shortened endpoint.
// Linear interpolation in lat/lng — exact enough at the few-metre scale of an
// LZ marker gap. Returns `from` unchanged if the gap would consume the segment.
function trimTowards(from: LatLng, to: LatLng, gapM: number): LatLng {
  const segM = distanceMeters(from, to)
  if (gapM <= 0 || segM <= gapM) return from
  const f = gapM / segM
  return {
    lat: from.lat + (to.lat - from.lat) * f,
    lng: from.lng + (to.lng - from.lng) * f,
  }
}

type LzSegment = {
  from: LatLng
  to: LatLng
  drawFrom: LatLng
  drawTo: LatLng
  distanceM: number
  midpoint: LatLng
}

export function HoleMap() {
  const insets = useSafeAreaInsets()
  const {
    currentHole,
    pin,
    position,
    teeLL,
    greenC,
    cameraMode,
    lzShown,
    round,
    holeNum,
  } = useHoleScene()

  // Default to satellite; fall back to vector only when the satellite
  // pack errored out (e.g., ESRI unreachable + nothing cached).
  const tilesStatus = usePrefetchStatus(round.courseId)
  const mapLayer: LayerKind =
    tilesStatus?.satellite.state === 'error' ? 'vector' : 'satellite'

  const cameraRef = useRef<CameraRef>(null)
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

  // Per-hole Landing Zone waypoints. Reset in-render on hole change so the
  // next render has fresh values — avoids a flash of stale waypoints.
  const [lzPositions, setLzPositions] = useState<LatLng[]>(() =>
    lzInitPositions(teeLL, greenC, lzFractionsFor(currentHole.par)),
  )
  const [lzHoleNum, setLzHoleNum] = useState(holeNum)
  if (lzHoleNum !== holeNum) {
    setLzHoleNum(holeNum)
    setLzPositions(
      lzInitPositions(teeLL, greenC, lzFractionsFor(currentHole.par)),
    )
  }

  // LZ crosshairs (and the tap-to-move them) show for par 4/5 unless the
  // player toggles them off. No automatic distance-based hiding — it read as
  // clunky on-course.
  const lzVisible = lzShown

  // The planning line + distance labels render whenever the crosshairs do,
  // plus on par 3s — there a single tee→pin segment (no crosshairs, since the
  // shot leaves no landing zone) still gives a useful distance readout. Par 3
  // has no LZ toggle, so it always shows.
  const segmentsVisible = lzVisible

  const greenPoints: LatLng[] = currentHole.green.coordinates[0].map(
    ([lng, lat]) => ({ lat, lng }),
  )
  const framePoints: LatLng[] = [teeLL, ...greenPoints]
  if (currentHole.fairway) {
    for (const [lng, lat] of currentHole.fairway.coordinates[0]) {
      framePoints.push({ lat, lng })
    }
  }
  const framePadding = {
    top: insets.top + TOPBAR_CHROME,
    bottom: insets.bottom + DRAWER_CHROME,
    left: FRAME_SIDE_PAD,
    right: FRAME_SIDE_PAD + FRAME_RIGHT_CHROME,
  }

  // Viewport-independent seed for the Camera's first mount — the centre of all
  // the hole's geometry, oriented tee→green. Used by initialViewState when the
  // exact frame isn't computable yet (no mapSize), so the camera never sits at
  // the world view and the satellite source only ever requests local tiles.
  const initBounds = bboxOf(framePoints)
  const initCenter: LatLng = {
    lat: (initBounds[1] + initBounds[3]) / 2,
    lng: (initBounds[0] + initBounds[2]) / 2,
  }
  const initBearing = bearingDeg(teeLL, greenC)
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
      // TEMP zoom-verification log — remove once z20 framing is confirmed.
      console.log(`[zoomcheck] mode=${cameraMode} frameZoom=${zoom.toFixed(2)}`)
      cameraRef.current?.setStop({
        center: [center.lng, center.lat],
        zoom: zoom,
        bearing: bearing,
      })
    },
  )

  // Re-frame only on the events that should move the camera: map ready,
  // hole change, camera-mode toggle, and first/changed layout. Deliberately
  // NOT keyed on frame values — a tee correction shifts the frame center but
  // must not yank the camera (the corrected tee marker just slides over).
  useEffect(() => {
    if (!isMapReady) return
    onFrameChange(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMapReady, holeNum, cameraMode, mapSize?.width, mapSize?.height])

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
    // LZs get clamped to the hole's planning envelope (forward bounded by
    // tee→green, laterally by the screen width) so they can't escape the
    // visible area. Par 3s (no LZs) intentionally swallow taps here —
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
      // Lateral reach spans the full visible map width — not the hole's
      // polygons — so an LZ can be dragged into doglegs even when OSM gives
      // us no fairway. Forward stays bounded between tee and green.
      const sideHalfWidth =
        mapSize && holeFrame
          ? (mapSize.width / 2) * metersPerPixel(teeLL.lat, holeFrame.zoom)
          : Infinity
      const clamped = clampToHoleEnvelope({
        point: tap,
        tee: teeLL,
        greenCentroid: greenC,
        points: framePoints,
        sideHalfWidth,
      })
      setLzPositions(prev => prev.map((p, i) => (i === bestIdx ? clamped : p)))
    }
  }

  const lzSegments: LzSegment[] = []
  if (segmentsVisible) {
    const chain: LatLng[] = [teeLL, ...lzPositions, pin]
    // Leave a gap where a segment meets an LZ crosshair (chain indices
    // 1..lzPositions.length) so the line stops short of the marker's
    // hollow center. Tee (index 0) and pin (last) get no gap.
    const gapM =
      frame && mapSize
        ? LZ_LINE_GAP_PX * metersPerPixel(teeLL.lat, frame.zoom)
        : 0
    const isLzNode = (idx: number) => idx >= 1 && idx <= lzPositions.length
    for (let i = 0; i < chain.length - 1; i++) {
      const from = chain[i]
      const to = chain[i + 1]
      lzSegments.push({
        from,
        to,
        drawFrom: isLzNode(i) ? trimTowards(from, to, gapM) : from,
        drawTo: isLzNode(i + 1) ? trimTowards(to, from, gapM) : to,
        distanceM: distanceMeters(from, to),
        midpoint: {
          lat: (from.lat + to.lat) / 2,
          lng: (from.lng + to.lng) / 2,
        },
      })
    }
  }

  return (
    <Map
      key={`map-${holeNum}-${mapLayer}`}
      style={styles.map}
      // Render to a TextureView (not the default GLSurfaceView). A SurfaceView
      // punches its own window and is invisible to the dimezis backdrop blur —
      // the frosted-glass chrome (GlassSurface / glass IconButtons) would show
      // black behind it. TextureView composites into the view hierarchy so the
      // blur captures the map. Slightly heavier, but fine for a single map.
      androidView="texture"
      mapStyle={
        mapLayer === 'vector' ? vectorStyle : satelliteStyleFor(round.courseId)
      }
      onPress={handleMapPress}
      onLayout={handleMapLayout}
      onDidFinishLoadingMap={() => setIsMapReady(true)}
      compass={false}
    >
      <Camera
        ref={cameraRef}
        // Always seed a hole-centered view (exact frame if mapSize is known yet,
        // else a geometry-centered fallback at HOLE_INIT_FALLBACK_ZOOM). Never
        // leave this undefined — that mounts the camera at the world view and the
        // satellite source briefly fetches global tiles before the first reframe.
        initialViewState={{
          center: frame
            ? [frame.center.lng, frame.center.lat]
            : [initCenter.lng, initCenter.lat],
          zoom: frame ? frame.zoom : HOLE_INIT_FALLBACK_ZOOM,
          bearing: frame ? frame.bearing : initBearing,
        }}
      />

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
              [seg.drawFrom.lng, seg.drawFrom.lat],
              [seg.drawTo.lng, seg.drawTo.lat],
            ],
          }}
        >
          <Layer
            id={`lz-seg-${i}`}
            type="line"
            paint={{
              'line-color': colors.surface,
              'line-width': 2,
              ...(LINE_STYLE === 'dashed' ? { 'line-dasharray': [2, 2] } : {}),
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

      <Marker
        id="tee-marker"
        lngLat={currentHole.tee.coordinates}
        anchor="bottom"
      >
        <View style={styles.teeMarker} pointerEvents="none">
          <GolfTeeIcon width={16} height={16} color={colors.primary} />
          <View style={styles.teeBottom} />
        </View>
      </Marker>

      <Marker id="pin-marker" lngLat={[pin.lng, pin.lat]} anchor="bottom">
        <View style={styles.pinMarker} pointerEvents="none">
          <FlagIcon
            width={28}
            height={28}
            color={colors.pinFill}
            fill={colors.pinFill}
            style={{ marginLeft: 14 }}
          />
          <View style={styles.pinDot} />
        </View>
      </Marker>

      {lzVisible &&
        lzPositions.map((lz, i) => (
          <Marker
            key={`lz-dot-${i}`}
            id={`lz-dot-${i}`}
            lngLat={[lz.lng, lz.lat]}
            anchor="center"
          >
            <View style={styles.lzMarker} pointerEvents="none">
              <View style={styles.lzRing} />
              <CrosshairIcon
                width={32}
                height={32}
                color={colors.landingZoneFill}
              />
            </View>
          </Marker>
        ))}

      {position && (
        <Marker
          id="me-marker"
          lngLat={[position.lng, position.lat]}
          anchor="center"
        >
          <View style={styles.meMarker} pointerEvents="none">
            <View style={styles.meHalo} />
            <View style={styles.meDiamond} />
          </View>
        </Marker>
      )}
    </Map>
  )
}

const styles = StyleSheet.create({
  map: { flex: 1 },

  teeMarker: {
    alignItems: 'center',
  },
  pinMarker: {
    alignItems: 'center',
  },
  pinDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.pinFill,
    borderWidth: 1.5,
    borderColor: colors.pinFill,
    marginTop: -2,
  },
  teeBottom: {
    width: 12,
    height: 3,
    borderRadius: 6,
    backgroundColor: colors.landingZoneFill,
    marginTop: -2,
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
    fontVariant: ['tabular-nums'],
    fontWeight: 'bold',
  },

  // GPS position: a static golden diamond (rotated square) with a faint
  // golden halo — visually distinct from the tee dot (circle), LZ
  // crosshairs, and the pin flag.
  meMarker: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meHalo: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.goldenEagle,
    opacity: 0.25,
  },
  meDiamond: {
    width: 15,
    height: 15,
    backgroundColor: colors.goldenEagle,
    borderWidth: 1.5,
    borderColor: colors.surfaceHighest,
    transform: [{ rotate: '45deg' }],
  },

  // Landing Zone: navy crosshair glyph with a faint cream ring tucked just
  // inside its outer circle, for contrast against the green grass it sits on.
  lzMarker: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lzRing: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
  },
})
