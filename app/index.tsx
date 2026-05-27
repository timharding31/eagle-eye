import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { ScreenShell } from '@/components/ScreenShell'
import { SectionLabel } from '@/components/SectionLabel'
import { IconAction, TopBar } from '@/components/TopBar'
import {
  listAllCourses,
  listBundledCourses,
  removeInstalledCourse,
  type CourseSummary,
} from '@/lib/course'
import {
  endRound,
  ensureHydrated,
  isStale,
  startRound,
  useActiveRound,
  useIsHydrated,
} from '@/lib/round'
import { colors, radius, space, type } from '@/lib/theme'
import {
  prefetchForCourse,
  prefetchStatus,
  retryPrefetch,
  usePrefetchStatus,
  type PrefetchStatus,
} from '@/lib/tiles'

export default function HomeScreen() {
  const router = useRouter()
  const activeRound = useActiveRound()
  const hydrated = useIsHydrated()
  // Start with the synchronous bundled list so the screen has something
  // to render immediately; replace with bundled+installed once SQLite
  // returns. Re-fetched every time the screen regains focus so newly
  // installed courses show up after the Add Course flow.
  const [courses, setCourses] = useState<CourseSummary[]>(listBundledCourses())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    ensureHydrated().catch(e => setErr(String(e)))
  }, [])

  // Refresh the course list + nudge any missing tile prefetches whenever
  // the screen regains focus.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      listAllCourses()
        .then(list => {
          if (cancelled) return
          setCourses(list)
          for (const c of list) {
            prefetchStatus(c.slug)
              .then(() => prefetchForCourse(c.slug, c.bounds))
              .catch(e => console.error(`tiles prefetch ${c.slug}`, e))
          }
        })
        .catch(e => !cancelled && setErr(String(e)))
      return () => {
        cancelled = true
      }
    }, []),
  )

  const stale = useMemo(
    () => (activeRound ? isStale(activeRound) : false),
    [activeRound],
  )

  const activeCourseName = useMemo(() => {
    if (!activeRound) return null
    return (
      courses.find(c => c.slug === activeRound.courseId)?.name ??
      activeRound.courseId
    )
  }, [activeRound, courses])

  async function handleStart(slug: string) {
    setErr(null)
    setBusy(true)
    try {
      const round = await startRound(slug)
      router.push(`/round/${round.currentHole}` as never)
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(c: CourseSummary) {
    Alert.alert(
      `Remove ${c.name}?`,
      'The course will be removed from your device. Saved rounds keep their score history; you can re-add the course later via Find Nearby.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeInstalledCourse(c.slug)
              const list = await listAllCourses()
              setCourses(list)
            } catch (e) {
              setErr(String(e))
            }
          },
        },
      ],
    )
  }

  async function handleEndActive() {
    if (!activeRound) return
    setErr(null)
    setBusy(true)
    try {
      await endRound(activeRound.id)
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  function handleResume() {
    if (!activeRound) return
    router.push(`/round/${activeRound.currentHole}` as never)
  }

  if (!hydrated) {
    return (
      <ScreenShell>
        <TopBar title="EAGLE EYE" subtitle="GOLF RANGEFINDER" />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.centerText}>Loading…</Text>
        </View>
      </ScreenShell>
    )
  }

  return (
    <ScreenShell>
      <TopBar
        title="EAGLE EYE"
        subtitle="GOLF RANGEFINDER"
        right={
          <IconAction
            label="History"
            glyph="≡"
            onPress={() => router.push('/history' as never)}
          />
        }
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        {activeRound && (
          <View style={styles.section}>
            {stale && (
              <View style={styles.staleBanner}>
                <Text style={styles.staleBannerText}>
                  This round started over 24 hours ago. End it or resume?
                </Text>
              </View>
            )}
            <Card variant="elevated" padding="lg" style={styles.resumeCard}>
              <SectionLabel>ACTIVE ROUND</SectionLabel>
              <Text style={styles.resumeCourse}>{activeCourseName}</Text>
              <Text style={styles.resumeMeta}>
                Hole {activeRound.currentHole} ·{' '}
                {formatStarted(activeRound.startedAt)}
              </Text>
              <View style={styles.resumeActions}>
                <Button
                  label="Resume Round"
                  onPress={handleResume}
                  disabled={busy}
                  style={{ flex: 1 }}
                />
                <Button
                  label="End"
                  variant="ghost"
                  size="lg"
                  onPress={handleEndActive}
                  disabled={busy}
                />
              </View>
            </Card>
          </View>
        )}

        {!activeRound && (
          <View style={styles.section}>
            <SectionLabel style={styles.sectionHeader}>
              START A ROUND
            </SectionLabel>
            {courses.length === 0 ? (
              <Text style={styles.dim}>No courses installed yet.</Text>
            ) : (
              courses.map(c => (
                <Card
                  key={c.slug}
                  variant="surface"
                  padding="md"
                  style={styles.courseCard}
                >
                  <View style={styles.courseHead}>
                    <View style={{ flex: 1 }}>
                      {c.source !== 'bundled' ? (
                        <TouchableOpacity
                          onLongPress={() => handleRemove(c)}
                          delayLongPress={500}
                        >
                          <Text style={styles.courseName}>{c.name}</Text>
                          <Text style={styles.installedTag}>
                            INSTALLED · LONG-PRESS TO REMOVE
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.courseName}>{c.name}</Text>
                      )}
                      <PrefetchRow course={c} />
                    </View>
                    <Button
                      label="Start"
                      onPress={() => handleStart(c.slug)}
                      disabled={busy}
                      size="md"
                    />
                  </View>
                </Card>
              ))
            )}
            <Button
              label="+ Add Course (Find Nearby)"
              variant="secondary"
              size="md"
              onPress={() => router.push('/courses/add' as never)}
              disabled={busy}
              style={{ marginTop: space.sm }}
            />
          </View>
        )}

        <View style={[styles.section, { marginTop: space.md }]}>
          <Button
            label="Round History"
            variant="secondary"
            onPress={() => router.push('/history' as never)}
            disabled={busy}
          />
          <Button
            label="Map Spike"
            variant="ghost"
            size="md"
            onPress={() => router.push('/spike' as never)}
            disabled={busy}
          />
        </View>

        {err && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{err}</Text>
          </View>
        )}
      </ScrollView>
    </ScreenShell>
  )
}

function PrefetchRow({ course }: { course: CourseSummary }) {
  const status = usePrefetchStatus(course.slug)
  const summary = summarizePrefetch(status)
  const showRetry = summary.kind === 'error'

  return (
    <View style={styles.prefetchRow}>
      <Text
        style={[
          styles.prefetchText,
          summary.kind === 'error' && styles.prefetchTextError,
          summary.kind === 'ready' && styles.prefetchTextReady,
        ]}
        numberOfLines={1}
      >
        {summary.label}
      </Text>
      {showRetry && (
        <TouchableOpacity
          onPress={() =>
            retryPrefetch(course.slug, course.bounds).catch(e =>
              console.error('retryPrefetch', e),
            )
          }
        >
          <Text style={styles.prefetchRetry}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

type PrefetchSummary =
  | { kind: 'pending'; label: string }
  | { kind: 'downloading'; label: string }
  | { kind: 'ready'; label: string }
  | { kind: 'error'; label: string }

function summarizePrefetch(status: PrefetchStatus | null): PrefetchSummary {
  if (!status) return { kind: 'pending', label: 'Checking offline tiles…' }
  const { vector, satellite } = status
  if (vector.state === 'error' || satellite.state === 'error') {
    const msg = vector.errorMessage ?? satellite.errorMessage ?? 'unknown'
    return { kind: 'error', label: `Tile download failed (${msg})` }
  }
  if (vector.state === 'complete' && satellite.state === 'complete') {
    return { kind: 'ready', label: '✓ Offline tiles ready' }
  }
  if (vector.state === 'downloading' || satellite.state === 'downloading') {
    const pct = Math.round((vector.percentage + satellite.percentage) / 2)
    return { kind: 'downloading', label: `Downloading tiles… ${pct}%` }
  }
  return { kind: 'pending', label: 'Preparing offline tiles…' }
}

function formatStarted(ts: number): string {
  const d = new Date(ts)
  const now = Date.now()
  const diffMs = now - ts
  const oneDay = 24 * 60 * 60 * 1000
  if (diffMs < oneDay) {
    return d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })
  }
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

const styles = StyleSheet.create({
  scroll: { padding: space.marginMobile, gap: space.md },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
  },
  centerText: { ...type.bodyMd, color: colors.onSurfaceVariant },
  section: { gap: space.sm },
  sectionHeader: { marginBottom: space.xs },

  resumeCard: { gap: space.xs },
  resumeCourse: { ...type.headlineLg, color: colors.primary, marginTop: 2 },
  resumeMeta: { ...type.bodyMd, color: colors.onSurfaceVariant },
  resumeActions: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.md,
  },

  courseCard: { gap: space.xs },
  courseHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  courseName: { ...type.headlineMd, color: colors.primary },
  installedTag: {
    ...type.labelXs,
    color: colors.onSurfaceMuted,
    marginTop: 2,
  },

  dim: { ...type.bodyMd, color: colors.onSurfaceMuted, textAlign: 'center' },

  staleBanner: {
    backgroundColor: colors.errorContainer,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.error,
  },
  staleBannerText: {
    color: colors.primary,
    fontFamily: 'Sora_600SemiBold',
    textAlign: 'center',
  },

  errorBox: {
    backgroundColor: colors.errorContainer,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.error,
  },
  errorText: { ...type.bodyMd, color: colors.primary },

  prefetchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  prefetchText: { ...type.labelXs, flex: 1, textTransform: 'none' as const },
  prefetchTextReady: { color: colors.onSurfaceVariant },
  prefetchTextError: { color: colors.error },
  prefetchRetry: {
    color: colors.primary,
    fontFamily: 'Sora_700Bold',
    fontSize: 12,
    paddingHorizontal: space.sm,
  },
})
