import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { listBundledCourses, type CourseSummary } from '@/lib/course'
import { historyWithScores, type RoundSummary } from '@/lib/round'

export default function HistoryScreen() {
  const [summaries, setSummaries] = useState<RoundSummary[] | null>(null)
  const [courses] = useState(() => listBundledCourses())
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    historyWithScores()
      .then(setSummaries)
      .catch(e => setErr(String(e)))
  }, [])

  if (err) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{err}</Text>
      </View>
    )
  }

  if (!summaries) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#1a472a" />
        <Text style={styles.centerText}>Loading…</Text>
      </View>
    )
  }

  if (summaries.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>No rounds yet</Text>
        <Text style={styles.emptyBody}>
          Finished rounds will show up here once you save a scorecard.
        </Text>
      </View>
    )
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      {summaries.map(s => (
        <HistoryRow key={s.round.id} summary={s} courses={courses} />
      ))}
    </ScrollView>
  )
}

function HistoryRow({
  summary,
  courses,
}: {
  summary: RoundSummary
  courses: CourseSummary[]
}) {
  const { round, totalScore, scoreCount } = summary
  const courseName =
    courses.find(c => c.slug === round.courseId)?.name ?? round.courseId
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.rowCourse}>{courseName}</Text>
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
        <Text style={styles.rowScoreLabel}>score</Text>
      </View>
    </View>
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
  scroll: { padding: 16, gap: 8 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: '#F9FAFB',
  },
  centerText: { color: '#00214C', fontSize: 14 },
  emptyTitle: {
    color: '#00214C',
    fontSize: 20,
    fontWeight: '700',
  },
  emptyBody: {
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 280,
  },
  errorText: { color: '#DC2626', fontSize: 14 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  rowMain: { flex: 1, gap: 2 },
  rowCourse: { color: '#00214C', fontSize: 16, fontWeight: '700' },
  rowDate: { color: '#6B7280', fontSize: 13 },
  rowPartial: { color: '#CF9F37', fontSize: 12, fontWeight: '600' },
  rowScore: { alignItems: 'center', minWidth: 56 },
  rowScoreNum: {
    color: '#03563D',
    fontSize: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  rowScoreLabel: {
    color: '#6B7280',
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
})
