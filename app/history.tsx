import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { useRouter } from 'expo-router'

import { GlassHeader } from '@/components/GlassHeader'
import { GlassSurface } from '@/components/GlassSurface'
import { MapBackdrop } from '@/components/MapBackdrop'
import { listAllCourses, type CourseSummary } from '@/lib/course'
import { historyWithScores, type RoundSummary } from '@/lib/round'
import { colors, radius, space, type } from '@/lib/theme'

export default function HistoryScreen() {
  const router = useRouter()
  const [summaries, setSummaries] = useState<RoundSummary[] | null>(null)
  const [courses, setCourses] = useState<CourseSummary[]>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([historyWithScores(), listAllCourses()])
      .then(([summaries, courses]) => {
        setSummaries(summaries)
        setCourses(courses)
      })
      .catch(e => setErr(String(e)))
  }, [])

  return (
    <View style={styles.root}>
      <MapBackdrop>
        <GlassHeader
          onBack={() => router.back()}
          title="ROUND HISTORY"
          subtitle="ALL FINISHED ROUNDS"
        />
        {err ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{err}</Text>
          </View>
        ) : !summaries ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.centerText}>Loading…</Text>
          </View>
        ) : summaries.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>No rounds yet</Text>
            <Text style={styles.emptyBody}>
              Finished rounds will show up here once you save a scorecard.
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            {summaries.map((s, i) => (
              <HistoryRow
                key={s.round.id}
                index={i}
                summary={s}
                courses={courses}
              />
            ))}
          </ScrollView>
        )}
      </MapBackdrop>
    </View>
  )
}

function HistoryRow({
  index,
  summary,
  courses,
}: {
  index: number
  summary: RoundSummary
  courses: CourseSummary[]
}) {
  const { round, totalScore, scoreCount } = summary
  const courseName =
    courses.find(c => c.slug === round.courseId)?.name ?? round.courseId
  return (
    <Animated.View
      entering={FadeInDown.delay(index * 50)
        .duration(300)
        .withInitialValues({ transform: [{ translateY: 12 }] })}
    >
      <GlassSurface dark={false} rounded={radius['2xl']} style={styles.row}>
        <View style={styles.rowMain}>
          <Text style={styles.rowCourse} numberOfLines={1}>
            {courseName}
          </Text>
          <Text style={styles.rowDate}>{formatDate(round.startedAt)}</Text>
          {scoreCount > 0 && scoreCount < 18 && (
            <Text style={styles.rowPartial}>
              {scoreCount} hole{scoreCount === 1 ? '' : 's'} entered
            </Text>
          )}
        </View>
        <View style={styles.rowScore}>
          <Text style={styles.rowScoreNum}>
            {totalScore == null ? '—' : totalScore}
          </Text>
          <Text style={styles.rowScoreLabel}>SCORE</Text>
        </View>
      </GlassSurface>
    </Animated.View>
  )
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    padding: space.marginMobile,
    paddingTop: space.md,
    gap: space.sm,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  centerText: { ...type.bodyMd, color: colors.onSurfaceVariant },
  emptyTitle: { ...type.headlineMd, color: colors.primary },
  emptyBody: {
    ...type.bodyMd,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    maxWidth: 280,
  },
  errorText: { ...type.bodyMd, color: colors.error },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
  },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  rowCourse: { ...type.headlineMd, color: colors.primary },
  rowDate: { ...type.bodyMd, color: colors.onSurface },
  rowPartial: {
    color: colors.error,
    fontSize: 12,
    fontFamily: 'Sora_600SemiBold',
  },
  rowScore: { alignItems: 'center', minWidth: 56 },
  rowScoreNum: {
    color: colors.primary,
    fontSize: 32,
    fontFamily: 'Sora_800ExtraBold',
    fontVariant: ['tabular-nums'],
    lineHeight: 36,
  },
  rowScoreLabel: { ...type.labelXs, color: colors.onSurface, marginTop: 2 },
})
