import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'

import { listBundledCourses, type CourseSummary } from '@/lib/course'
import {
  endRound,
  ensureHydrated,
  isStale,
  startRound,
  useActiveRound,
  useIsHydrated,
} from '@/lib/round'
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
  const [courses, setCourses] = useState<CourseSummary[]>(listBundledCourses())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const list = listBundledCourses()
    setCourses(list)
    ensureHydrated().catch(e => setErr(String(e)))
    // Hydrate prefetch status from MapLibre's pack store, then kick off
    // any missing downloads. Both calls are idempotent.
    for (const c of list) {
      prefetchStatus(c.slug)
        .then(() => prefetchForCourse(c.slug, c.bounds))
        .catch(e => console.error(`tiles prefetch ${c.slug}`, e))
    }
  }, [])

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
      router.replace(`/round/${round.currentHole}` as never)
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
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
    router.replace(`/round/${activeRound.currentHole}` as never)
  }

  if (!hydrated) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#1a472a" />
        <Text style={styles.centerText}>Loading…</Text>
      </View>
    )
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>Eagle Eye</Text>
      <Text style={styles.subtitle}>Golf GPS Rangefinder</Text>

      {activeRound && (
        <View style={styles.section}>
          {stale && (
            <View style={styles.staleBanner}>
              <Text style={styles.staleBannerText}>
                This round started over 24 hours ago. End it or resume?
              </Text>
            </View>
          )}
          <View style={styles.resumeCard}>
            <Text style={styles.resumeLabel}>Active Round</Text>
            <Text style={styles.resumeCourse}>{activeCourseName}</Text>
            <Text style={styles.resumeMeta}>
              Hole {activeRound.currentHole} ·{' '}
              {formatStarted(activeRound.startedAt)}
            </Text>
            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary]}
              onPress={handleResume}
              disabled={busy}
            >
              <Text style={styles.buttonText}>Resume Round</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.buttonDanger]}
              onPress={handleEndActive}
              disabled={busy}
            >
              <Text style={styles.buttonText}>End Round</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!activeRound && (
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Start a Round</Text>
          {courses.length === 0 ? (
            <Text style={styles.dim}>No bundled courses found.</Text>
          ) : (
            courses.map(c => (
              <View key={c.slug} style={styles.courseRow}>
                <TouchableOpacity
                  style={[styles.button, styles.buttonPrimary]}
                  onPress={() => handleStart(c.slug)}
                  disabled={busy}
                >
                  <Text style={styles.buttonText}>{c.name}</Text>
                </TouchableOpacity>
                <PrefetchRow course={c} />
              </View>
            ))
          )}
        </View>
      )}

      <View style={styles.section}>
        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={() => router.push('/history' as never)}
          disabled={busy}
        >
          <Text style={styles.buttonTextSecondary}>Round History</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={() => router.push('/spike' as never)}
          disabled={busy}
        >
          <Text style={styles.buttonTextSecondary}>Map Spike</Text>
        </TouchableOpacity>
      </View>

      {err && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{err}</Text>
        </View>
      )}
    </ScrollView>
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
  scroll: { padding: 24, gap: 16 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  centerText: { color: '#00214C', fontSize: 14 },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#CF9F37',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 8,
  },
  section: { gap: 10 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#00214C',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  resumeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  resumeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#00214C',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  resumeCourse: { fontSize: 20, fontWeight: '700', color: '#03563D' },
  resumeMeta: { fontSize: 13, color: '#6B7280', marginBottom: 6 },
  button: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonPrimary: { backgroundColor: '#00214C' },
  buttonDanger: { backgroundColor: '#DC2626' },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#CF9F37',
  },
  buttonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '600' },
  buttonTextSecondary: { color: '#CF9F37', fontSize: 16, fontWeight: '600' },
  dim: { color: '#9CA3AF', textAlign: 'center' },
  staleBanner: {
    backgroundColor: '#DC2626',
    padding: 12,
    borderRadius: 8,
  },
  staleBannerText: { color: '#FFFFFF', fontWeight: '600', textAlign: 'center' },
  errorBox: {
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DC2626',
  },
  errorText: { color: '#DC2626', fontSize: 13 },

  courseRow: { gap: 6 },
  prefetchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  prefetchText: {
    color: '#6B7280',
    fontSize: 12,
    flex: 1,
  },
  prefetchTextReady: { color: '#03563D', fontWeight: '600' },
  prefetchTextError: { color: '#DC2626' },
  prefetchRetry: {
    color: '#CF9F37',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
})
