import { useEffect, useMemo, useState } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'

import { Button } from '@/components/Button'
import { GlassSurface } from '@/components/GlassSurface'
import { loadCourse, type Course } from '@/lib/course'
import { colors, radius, space, type } from '@/lib/theme'

import { useHomeScene } from './scene'

// The active-round region: a glass hero with a live "ACTIVE ROUND" eyebrow,
// course name, hole/started line, and Resume / End actions. Shown in place of
// the Course list whenever a Round is in progress.
export function ActiveRoundCard() {
  const { activeRound, stale, busy, resume, endActive } = useHomeScene()
  const [course, setCourse] = useState<Course | null>(null)

  const courseId = activeRound?.courseId
  useEffect(() => {
    if (!courseId) return
    let cancelled = false
    loadCourse(courseId)
      .then(c => !cancelled && setCourse(c))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [courseId])

  const total = useMemo(() => course?.holes.length || 18, [course])

  if (!activeRound) return null
  const courseName = course?.name ?? activeRound.courseId

  return (
    <View style={styles.section}>
      {stale && (
        <GlassSurface
          dark={false}
          rounded={radius.lg}
          style={styles.staleBanner}
        >
          <Text style={styles.staleBannerText}>
            This round started over 24 hours ago. End it or resume?
          </Text>
        </GlassSurface>
      )}

      <GlassSurface rounded={radius['2xl']} style={styles.hero} dark={false}>
        <View style={styles.eyebrow}>
          <PulseDot />
          <Text style={styles.eyebrowText}>ACTIVE ROUND</Text>
        </View>
        <Text style={styles.heroTitle}>{courseName}</Text>
        <Text style={styles.heroSub}>
          Hole {activeRound.currentHole} of {total} · started{' '}
          {formatStarted(activeRound.startedAt)}
        </Text>
        <View style={styles.heroActions}>
          <Button
            label="Resume Round"
            onPress={resume}
            disabled={busy}
            style={{ flex: 1 }}
          />
          <Button
            label="End"
            variant="glass"
            onPress={endActive}
            disabled={busy}
          />
        </View>
      </GlassSurface>
    </View>
  )
}

// A gold "live" dot with a soft glow, gently pulsing to read as active.
function PulseDot() {
  const [anim] = useState(() => new Animated.Value(0))
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [anim])
  const opacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 1],
  })
  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1.1],
  })
  return (
    <Animated.View
      style={[styles.pulseDot, { opacity, transform: [{ scale }] }]}
    />
  )
}

function formatStarted(ts: number): string {
  const d = new Date(ts)
  const diffMs = Date.now() - ts
  const oneDay = 24 * 60 * 60 * 1000
  if (diffMs < oneDay) {
    return d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const styles = StyleSheet.create({
  section: { gap: space.sm },

  staleBanner: { padding: space.md, borderColor: colors.error },
  staleBannerText: {
    color: colors.primary,
    fontFamily: 'Sora_600SemiBold',
    textAlign: 'center',
  },

  hero: { padding: space.lg },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.md,
  },
  eyebrowText: {
    ...type.labelSm,
    color: colors.goldenEagle,
    letterSpacing: 2,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.goldenEagle,
    shadowColor: colors.goldenEagle,
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  heroTitle: { ...type.headlineLg, color: colors.primary },
  heroSub: {
    ...type.bodyMd,
    ...type.labelSm,
    color: colors.onSurface,
    marginTop: space.md,
  },
  heroActions: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.lg,
  },
})
