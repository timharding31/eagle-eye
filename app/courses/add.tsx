import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import * as Location from 'expo-location'

import { Button } from '@/components/Button'
import { GlassHeader } from '@/components/GlassHeader'
import { GlassSurface } from '@/components/GlassSurface'
import { MapBackdrop } from '@/components/MapBackdrop'
import { SectionLabel } from '@/components/SectionLabel'
import {
  fetchCourseFromOverpass,
  findNearby,
  installCourse,
  listInstalledCourses,
  setPendingInstall,
  type NearbyCourse,
} from '@/lib/course'
import { colors, radius, space, type } from '@/lib/theme'
import { prefetchForCourse } from '@/lib/tiles'

const SEARCH_RADIUS_KM = 50

const M_TO_YD = 1.0936133

type Phase =
  | { kind: 'idle' }
  | { kind: 'locating' }
  | { kind: 'searching' }
  | { kind: 'results'; results: NearbyCourse[] }
  | { kind: 'error'; message: string }

export default function AddCourseScreen() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set())
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [installError, setInstallError] = useState<string | null>(null)

  useEffect(() => {
    listInstalledCourses()
      .then(rows => setInstalledIds(new Set(rows.map(r => r.slug))))
      .catch(e => console.error('listInstalledCourses', e))
  }, [])

  async function handleSearch() {
    setPhase({ kind: 'locating' })
    setInstallError(null)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setPhase({
          kind: 'error',
          message:
            'Location permission denied. Find Nearby uses your current GPS to find golf courses within 50 km.',
        })
        return
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })
      setPhase({ kind: 'searching' })
      const results = await findNearby(
        { lat: loc.coords.latitude, lng: loc.coords.longitude },
        SEARCH_RADIUS_KM,
      )
      setPhase({ kind: 'results', results })
    } catch (e) {
      setPhase({
        kind: 'error',
        message: `Search failed: ${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }

  async function handleInstall(c: NearbyCourse) {
    const slug = `osm-${c.osmType}-${c.osmId}`
    if (installedIds.has(slug)) {
      if (router.canGoBack()) router.dismissAll()
      router.replace('/' as never)
      return
    }
    setInstallError(null)
    setInstallingId(c.osmId)
    try {
      const { course, missing } = await fetchCourseFromOverpass(
        c.osmType,
        c.osmId,
      )
      if (missing.length > 0) {
        // Hand off to tap-to-fix; that screen calls installCourse on
        // completion.
        setPendingInstall({
          course,
          missing,
          hint: { name: c.name, distanceM: c.distanceM },
        })
        router.push('/courses/fix' as never)
        return
      }
      await installCourse(course)
      prefetchForCourse(course.id, course.bounds).catch(e =>
        console.error('prefetch failed', e),
      )
      setInstalledIds(prev => new Set(prev).add(course.id))
      if (router.canGoBack()) router.dismissAll()
      router.replace('/' as never)
    } catch (e) {
      setInstallError(
        `Install failed: ${e instanceof Error ? e.message : String(e)}`,
      )
    } finally {
      setInstallingId(null)
    }
  }

  return (
    <View style={styles.root}>
      <MapBackdrop>
        <GlassHeader
          onBack={() => router.back()}
          title="ADD COURSE"
          subtitle="FIND NEARBY"
        />
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {phase.kind === 'idle' && (
            <GlassSurface
              dark={false}
              rounded={radius['2xl']}
              style={styles.intro}
            >
              <SectionLabel textStyle={{ color: colors.onSurface }}>
                HOW IT WORKS
              </SectionLabel>
              <Text style={styles.introBody}>
                We&apos;ll ask for your location once, then query OpenStreetMap
                for golf courses within {SEARCH_RADIUS_KM} km. Tap a result to
                install it for offline play.
              </Text>
              <Button
                label="Find Nearby Courses"
                onPress={handleSearch}
                style={{ marginTop: space.md }}
              />
            </GlassSurface>
          )}

          {(phase.kind === 'locating' || phase.kind === 'searching') && (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.centerText}>
                {phase.kind === 'locating'
                  ? 'Getting your location…'
                  : 'Searching OpenStreetMap…'}
              </Text>
            </View>
          )}

          {phase.kind === 'error' && (
            <View>
              <GlassSurface
                rounded={radius.lg}
                style={styles.errorBox}
                dark={false}
              >
                <Text style={styles.errorText}>{phase.message}</Text>
              </GlassSurface>
              <Button
                label="Try Again"
                variant="secondary"
                onPress={handleSearch}
                style={{ marginTop: space.md }}
              />
            </View>
          )}

          {phase.kind === 'results' && (
            <View style={styles.section}>
              <SectionLabel style={styles.sectionHeader}>
                {phase.results.length === 0
                  ? 'NO COURSES FOUND'
                  : `${phase.results.length} COURSE${phase.results.length === 1 ? '' : 'S'} NEARBY`}
              </SectionLabel>
              {phase.results.length === 0 ? (
                <Text style={styles.dim}>
                  No golf courses tagged in OpenStreetMap within{' '}
                  {SEARCH_RADIUS_KM} km. Try moving closer to a course, or
                  contribute the course data to OSM.
                </Text>
              ) : (
                phase.results.map((r, i) => {
                  const slug = `osm-${r.osmType}-${r.osmId}`
                  const installed = installedIds.has(slug)
                  const installing = installingId === r.osmId
                  return (
                    <Animated.View
                      key={`${r.osmType}-${r.osmId}`}
                      entering={FadeInDown.delay(i * 50)
                        .duration(300)
                        .withInitialValues({ transform: [{ translateY: 12 }] })}
                    >
                      <GlassSurface
                        dark={false}
                        rounded={radius['2xl']}
                        style={styles.row}
                      >
                        <View style={styles.rowMain}>
                          <Text style={styles.rowName} numberOfLines={2}>
                            {r.name}
                          </Text>
                          <Text style={styles.rowMeta}>
                            {distanceLabel(r.distanceM)} away · OSM {r.osmType}{' '}
                            {r.osmId}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[
                            styles.installBtn,
                            installed && styles.installBtnDone,
                          ]}
                          onPress={() => handleInstall(r)}
                          disabled={installing || !!installingId}
                        >
                          {installing ? (
                            <ActivityIndicator color={colors.primary} />
                          ) : (
                            <Text style={styles.installBtnText}>
                              {installed ? '✓ INSTALLED' : 'INSTALL'}
                            </Text>
                          )}
                        </TouchableOpacity>
                      </GlassSurface>
                    </Animated.View>
                  )
                })
              )}
              <Button
                label="Search Again"
                variant="ghost"
                size="md"
                onPress={handleSearch}
                style={{ marginTop: space.sm }}
              />
            </View>
          )}

          {installError && (
            <GlassSurface
              rounded={radius.lg}
              style={styles.errorBox}
              dark={false}
            >
              <Text style={styles.errorText}>{installError}</Text>
            </GlassSurface>
          )}
        </ScrollView>
      </MapBackdrop>
    </View>
  )
}

function distanceLabel(meters: number): string {
  const yards = meters * M_TO_YD
  if (yards < 1760) return `${Math.round(yards)} yd`
  const miles = yards / 1760
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    padding: space.marginMobile,
    paddingTop: space.md,
    gap: space.md,
  },
  intro: { padding: space.lg, gap: space.xs },
  introBody: { ...type.bodyMd, color: colors.onSurface, marginTop: 2 },

  section: { gap: space.sm },
  sectionHeader: { marginBottom: space.xs },

  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.xl,
    gap: space.md,
  },
  centerText: { ...type.bodyMd, color: colors.onSurfaceVariant },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
  },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  rowName: { ...type.headlineMd, color: colors.primary },
  rowMeta: {
    ...type.labelXs,
    color: colors.onSurface,
    textTransform: 'none' as const,
  },

  installBtn: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.secondary,
    minWidth: 96,
    alignItems: 'center',
  },
  installBtnDone: { backgroundColor: colors.surfaceHigh },
  installBtnText: {
    color: colors.primary,
    fontFamily: 'Sora_700Bold',
    fontSize: 13,
    letterSpacing: 0.8,
  },

  dim: { ...type.bodyMd, color: colors.onSurfaceMuted, textAlign: 'center' },

  errorBox: { padding: space.md, borderColor: colors.error },
  errorText: { ...type.bodyMd, color: colors.primary },
})
