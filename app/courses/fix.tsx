import { useEffect, useMemo, useRef, useState } from 'react'
import type { NativeSyntheticEvent } from 'react-native'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  type CameraRef,
  type PressEvent,
  type PressEventWithFeatures,
} from '@maplibre/maplibre-react-native'

import { Button } from '@/components/Button'
import { GlassBlurTarget, GlassRoot } from '@/components/GlassSurface'
import { ScreenShell } from '@/components/ScreenShell'
import { TopBar } from '@/components/TopBar'
import {
  applyMissingFixes,
  clearPendingInstall,
  installCourse,
  usePendingInstall,
} from '@/lib/course'
import type { MissingHole, Position } from '@/lib/course/types'
import { frameForHole, type LatLng } from '@/lib/geo'
import { colors, fonts, radius, shadows, space, type } from '@/lib/theme'
import { prefetchForCourse, satelliteStyleFor } from '@/lib/tiles'

export default function FixCourseScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const pending = usePendingInstall()
  const cameraRef = useRef<CameraRef>(null)

  const [fixes, setFixes] = useState<Record<number, LatLng>>({})
  const [cursor, setCursor] = useState(0)
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)
  const [mapSize, setMapSize] = useState<{
    width: number
    height: number
  } | null>(null)

  // No pending install (e.g. user navigated here directly) → bounce.
  useEffect(() => {
    if (!pending) router.replace('/' as never)
  }, [pending, router])

  const current = pending?.missing[cursor]
  const frame = useFrameForMissing(current, pending?.course.bounds, mapSize, {
    top: insets.top + 120,
    bottom: insets.bottom + 200,
    left: 24,
    right: 24,
  })

  // The Map's `key` changes per hole, so it fully remounts. Camera commands
  // (setStop) issued before the native MapView finishes attaching resolve
  // to a null reactTag and throw. Gate them on onDidFinishLoadingMap, and
  // reset readiness in render whenever the key is about to change so the
  // effect can't race the remount.
  const trackedNum = current?.num ?? null
  const [trackedMapKey, setTrackedMapKey] = useState<number | null>(trackedNum)
  const [isMapReady, setIsMapReady] = useState(false)
  if (trackedMapKey !== trackedNum) {
    setTrackedMapKey(trackedNum)
    setIsMapReady(false)
  }

  // Reframe whenever the player advances to a different hole. We
  // intentionally depend on the primitive fields, not on the frame
  // object identity (which is recomputed every render).
  useEffect(() => {
    if (!isMapReady || !frame) return
    cameraRef.current?.setStop({
      center: [frame.center.lng, frame.center.lat],
      zoom: frame.zoom,
      bearing: frame.bearing,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isMapReady,
    frame?.center.lat,
    frame?.center.lng,
    frame?.zoom,
    frame?.bearing,
  ])

  if (!pending) {
    return null
  }
  const totalMissing = pending.missing.length
  const isLast = cursor === totalMissing - 1
  const currentFix = current ? fixes[current.num] : undefined

  function handleMapPress(
    e:
      | NativeSyntheticEvent<PressEvent>
      | NativeSyntheticEvent<PressEventWithFeatures>,
  ) {
    if (!current) return
    const lngLat = e.nativeEvent?.lngLat
    if (!lngLat || lngLat.length < 2) return
    setFixes(prev => ({
      ...prev,
      [current.num]: { lat: lngLat[1], lng: lngLat[0] },
    }))
  }

  function handlePrev() {
    if (cursor === 0) return
    setCursor(c => c - 1)
  }

  function handleNext() {
    if (cursor < totalMissing - 1) setCursor(c => c + 1)
  }

  function handleSkip() {
    if (!current) return
    setFixes(prev => {
      const next = { ...prev }
      delete next[current.num]
      return next
    })
    if (!isLast) setCursor(c => c + 1)
  }

  async function handleFinish() {
    if (!pending || installing) return
    setInstalling(true)
    setInstallError(null)
    try {
      const { course } = applyMissingFixes(
        pending.course,
        pending.missing,
        fixes,
      )
      await installCourse(course)
      prefetchForCourse(course.id, course.bounds).catch(e =>
        console.error('prefetch failed', e),
      )
      clearPendingInstall()
      if (router.canGoBack()) router.dismissAll()
      router.replace('/' as never)
    } catch (e) {
      setInstallError(
        `Install failed: ${e instanceof Error ? e.message : String(e)}`,
      )
    } finally {
      setInstalling(false)
    }
  }

  function handleAbort() {
    clearPendingInstall()
    if (router.canGoBack()) router.back()
    else router.replace('/' as never)
  }

  if (!current) {
    // No missing holes → shouldn't usually land here, but defensively
    // install whatever course we have.
    return (
      <ScreenShell>
        <View style={styles.center}>
          <Text style={styles.centerText}>No holes need fixing.</Text>
          <Button label="Install" onPress={handleFinish} />
        </View>
      </ScreenShell>
    )
  }

  const fixedCount = Object.keys(fixes).length
  const subtitle = `${pending.hint?.name ?? pending.course.name}`.toUpperCase()

  return (
    <GlassRoot>
      <View style={styles.container}>
        <GlassBlurTarget style={styles.map}>
          <Map
            key={`fix-${current.num}`}
            style={styles.map}
            // TextureView so the glass IconButton's backdrop blur captures the map
            // (a GLSurfaceView is invisible to the dimezis blur). See HoleMap.tsx.
            androidView="texture"
            mapStyle={satelliteStyleFor(pending.course.id)}
            onPress={handleMapPress}
            onLayout={e => {
              const { width, height } = e.nativeEvent.layout
              setMapSize(prev =>
                prev && prev.width === width && prev.height === height
                  ? prev
                  : { width, height },
              )
            }}
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

            {current.holeWay && current.holeWay.length >= 2 && (
              <GeoJSONSource
                id="holeway-src"
                data={{ type: 'LineString', coordinates: current.holeWay }}
              >
                <Layer
                  id="holeway"
                  type="line"
                  paint={{
                    'line-color': colors.primary,
                    'line-width': 2,
                    'line-dasharray': [2, 2],
                    'line-opacity': 0.85,
                  }}
                />
              </GeoJSONSource>
            )}

            {current.tee && (
              <GeoJSONSource id="tee-src" data={current.tee}>
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
            )}

            {currentFix && (
              <GeoJSONSource
                id="fix-src"
                data={{
                  type: 'Point',
                  coordinates: [currentFix.lng, currentFix.lat],
                }}
              >
                <Layer
                  id="fix-dot"
                  type="circle"
                  paint={{
                    'circle-radius': 10,
                    'circle-color': colors.pinFill,
                    'circle-stroke-color': colors.primary,
                    'circle-stroke-width': 3,
                  }}
                />
              </GeoJSONSource>
            )}

            {current.tee && (
              <Marker
                id="tee-label"
                lngLat={current.tee.coordinates}
                anchor="bottom"
              >
                <View style={styles.markerLabel}>
                  <Text style={styles.markerLabelText}>TEE</Text>
                </View>
              </Marker>
            )}
          </Map>
        </GlassBlurTarget>

        <TopBar
          title={`HOLE ${current.num} · PAR ${current.par}`}
          subtitle={subtitle}
          variant="glass"
          onBack={handleAbort}
          style={styles.topBarOverlay}
        />

        <View
          style={[styles.promptCard, { top: insets.top + 80 + space.sm }]}
          pointerEvents="none"
        >
          <Text style={styles.promptTitle}>
            {currentFix ? 'Green centre set' : 'Tap the green'}
          </Text>
          <Text style={styles.promptBody}>
            {currentFix
              ? 'Tap again to reposition, or continue to the next hole.'
              : 'Place a marker on the centre of the green for this hole. Long-press to refine.'}
          </Text>
        </View>

        <View
          style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}
        >
          {installError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{installError}</Text>
            </View>
          )}

          <View style={styles.progressRow}>
            <Text style={styles.progressText}>
              {fixedCount} of {totalMissing} greens placed
            </Text>
            <View style={styles.dotsRow}>
              {pending.missing.map((m, i) => (
                <View
                  key={m.num}
                  style={[
                    styles.dot,
                    i === cursor && styles.dotActive,
                    fixes[m.num] && styles.dotFilled,
                  ]}
                />
              ))}
            </View>
          </View>

          <View style={styles.navRow}>
            <TouchableOpacity
              style={[styles.navBtn, cursor === 0 && styles.navBtnDisabled]}
              onPress={handlePrev}
              disabled={cursor === 0}
            >
              <Text style={styles.navBtnText}>‹ PREV</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.navBtnGhost} onPress={handleSkip}>
              <Text style={styles.navBtnGhostText}>SKIP HOLE</Text>
            </TouchableOpacity>

            {isLast ? (
              <TouchableOpacity
                style={[
                  styles.navBtnPrimary,
                  installing && styles.navBtnDisabled,
                ]}
                onPress={handleFinish}
                disabled={installing}
              >
                {installing ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.navBtnPrimaryText}>INSTALL ›</Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.navBtnPrimary}
                onPress={handleNext}
              >
                <Text style={styles.navBtnPrimaryText}>NEXT ›</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </GlassRoot>
  )
}

function useFrameForMissing(
  current: MissingHole | undefined,
  courseBounds: [number, number, number, number] | undefined,
  mapSize: { width: number; height: number } | null,
  padding: { top: number; right: number; bottom: number; left: number },
): { center: LatLng; zoom: number; bearing: number } | null {
  return useMemo(() => {
    if (!current || !mapSize) return null

    // If we have a holeWay, frame to its endpoints (tee→green direction)
    // — that's the orientation the player will recognise. Otherwise fall
    // back to the course bounds with bearing 0 (north up).
    if (current.holeWay && current.holeWay.length >= 2) {
      const line = current.holeWay
      const start = line[0]
      const end = line[line.length - 1]
      const tee: LatLng = { lng: start[0], lat: start[1] }
      const greenC: LatLng = { lng: end[0], lat: end[1] }
      const points: LatLng[] = line.map(([lng, lat]: Position) => ({
        lat,
        lng,
      }))
      return frameForHole({
        tee,
        greenCentroid: greenC,
        points,
        viewport: mapSize,
        padding,
      })
    }

    if (current.tee) {
      const [lng, lat] = current.tee.coordinates
      return {
        center: { lat, lng },
        zoom: 16,
        bearing: 0,
      }
    }

    if (courseBounds) {
      const [w, s, e, n] = courseBounds
      return {
        center: { lat: (s + n) / 2, lng: (w + e) / 2 },
        zoom: 14,
        bearing: 0,
      }
    }
    return null
    // Depend on primitive padding fields, not the wrapping object — the
    // caller passes a fresh object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    current,
    mapSize,
    courseBounds,
    padding.top,
    padding.bottom,
    padding.left,
    padding.right,
  ])
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

  promptCard: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    backgroundColor: colors.glass,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    gap: 2,
  },
  promptTitle: {
    color: colors.primary,
    fontFamily: 'Sora_700Bold',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  promptBody: {
    ...type.bodyMd,
    color: colors.onSurfaceVariant,
    fontSize: 13,
  },

  markerLabel: {
    backgroundColor: colors.glass,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    marginBottom: 4,
  },
  markerLabelText: {
    color: colors.primary,
    fontFamily: fonts.data,
    fontSize: 10,
    letterSpacing: 0.6,
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surfaceHighest,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingHorizontal: space.marginMobile,
    paddingTop: space.md,
    gap: space.sm,
    ...shadows.drawer,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressText: { ...type.labelXs, textTransform: 'none' as const },
  dotsRow: { flexDirection: 'row', gap: 4 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.outlineVariant,
  },
  dotActive: {
    backgroundColor: colors.onSurfaceVariant,
  },
  dotFilled: {
    backgroundColor: colors.secondary,
  },

  navRow: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'stretch',
  },
  navBtn: {
    height: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  navBtnDisabled: { opacity: 0.45 },
  navBtnText: {
    color: colors.onSurfaceVariant,
    fontFamily: 'Sora_700Bold',
    fontSize: 13,
    letterSpacing: 0.8,
  },
  navBtnGhost: {
    height: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnGhostText: {
    color: colors.onSurfaceMuted,
    fontFamily: 'Sora_600SemiBold',
    fontSize: 12,
    letterSpacing: 1.2,
  },
  navBtnPrimary: {
    height: 48,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 110,
    ...shadows.cta,
  },
  navBtnPrimaryText: {
    color: colors.primary,
    fontFamily: 'Sora_700Bold',
    fontSize: 14,
    letterSpacing: 0.8,
  },

  errorBox: {
    backgroundColor: colors.errorContainer,
    padding: space.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.error,
  },
  errorText: { ...type.bodyMd, color: colors.primary, fontSize: 13 },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: colors.surface,
  },
  centerText: { ...type.bodyMd, textAlign: 'center' },
})
