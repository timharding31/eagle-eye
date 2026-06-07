import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

import { Button } from '@/components/Button'
import { GlassSurface } from '@/components/GlassSurface'
import { colors, radius, space, type } from '@/lib/theme'

import { useHomeScene } from './scene'

// The active-round region: a glass hero with a live "ACTIVE ROUND" eyebrow,
// course name, hole/started line, and Resume / End actions. Shown in place of
// the Course list whenever a Round is in progress.
export function ActiveRoundCard() {
  const { activeRound, courses, stale, busy, resume, endActive } =
    useHomeScene()

  if (!activeRound) return null

  // Name + hole count come straight from the scene's Course list (the single
  // source of truth) — no separate loadCourse, so the hero renders complete on
  // first paint instead of flashing the slug and a default count.
  const summary = courses.find(c => c.slug === activeRound.courseId)
  const courseName = summary?.name ?? activeRound.courseId
  const total = summary?.holeCount ?? 18

  return (
    <Animated.View
      style={styles.section}
      entering={FadeInDown.duration(300).withInitialValues({
        transform: [{ translateY: 12 }],
      })}
    >
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
    </Animated.View>
  )
}

// A gold "live" dot with a soft glow, gently pulsing to read as active.
// Reanimated loop on the UI thread — keeps pulsing smoothly regardless of JS.
function PulseDot() {
  const t = useSharedValue(0)
  useEffect(() => {
    t.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    )
  }, [t])
  const animStyle = useAnimatedStyle(() => ({
    opacity: 0.45 + t.value * 0.55,
    transform: [{ scale: 0.85 + t.value * 0.25 }],
  }))
  return <Animated.View style={[styles.pulseDot, animStyle]} />
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
    color: colors.onSurface,
    marginTop: space.md,
  },
  heroActions: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.lg,
  },
})
