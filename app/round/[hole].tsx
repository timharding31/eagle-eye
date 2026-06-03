import { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'

import { loadCourse, type Course } from '@/lib/course'
import { useActiveRound, useIsHydrated } from '@/lib/round'
import { colors, type } from '@/lib/theme'
import { HoleSceneProvider } from '@/components/hole/scene'
import { HoleLayout } from '@/components/hole/HoleLayout'

// Route loader: resolve the active round + its course, guard the loading and
// not-found states, then hand the resolved scene to the provider. All the
// per-hole behavior lives under components/hole.
export default function HoleScreen() {
  const { hole } = useLocalSearchParams<{ hole: string }>()
  const holeNum = parseInt(hole, 10)
  const router = useRouter()

  const hydrated = useIsHydrated()
  const round = useActiveRound()

  const [course, setCourse] = useState<Course | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

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

  // Re-load the course after a tee correction so the overridden tee
  // (applied inside loadCourse) propagates to distances/framing. Cheap
  // enough to just re-read; keeps the loaded Course the single source of
  // truth rather than patching the tee locally.
  const reloadCourse = useCallback(async () => {
    if (!round) return
    try {
      setCourse(await loadCourse(round.courseId))
    } catch (e) {
      console.error('reloadCourse failed', e)
    }
  }, [round])

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
    <HoleSceneProvider
      course={course}
      round={round}
      currentHole={currentHole}
      holeNum={holeNum}
      reloadCourse={reloadCourse}
    >
      <HoleLayout />
    </HoleSceneProvider>
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
