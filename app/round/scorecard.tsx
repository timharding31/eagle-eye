import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'

import { loadBundledCourse, type Course } from '@/lib/course'
import {
  endRound,
  getHoleState,
  useActiveRound,
  useIsHydrated,
} from '@/lib/round'

export default function ScorecardScreen() {
  const router = useRouter()
  const hydrated = useIsHydrated()
  const round = useActiveRound()

  const [course, setCourse] = useState<Course | null>(null)
  const [scores, setScores] = useState<Record<number, string>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (hydrated && !round) {
      router.replace('/' as never)
    }
  }, [hydrated, round, router])

  useEffect(() => {
    if (!round) return
    let cancelled = false
    ;(async () => {
      try {
        const c = await loadBundledCourse(round.courseId)
        if (cancelled) return
        setCourse(c)
        // Pre-fill from any persisted hole scores.
        const initial: Record<number, string> = {}
        for (const h of c.holes) {
          const hs = await getHoleState(round.id, h.num)
          if (hs?.score != null) initial[h.num] = String(hs.score)
        }
        if (!cancelled) setScores(initial)
      } catch (e) {
        if (!cancelled) setLoadError(String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [round])

  const parsedScores = useMemo(() => {
    const out: Record<number, number> = {}
    for (const [k, v] of Object.entries(scores)) {
      const n = parseInt(v, 10)
      if (Number.isFinite(n) && n > 0) out[parseInt(k, 10)] = n
    }
    return out
  }, [scores])

  const total = useMemo(
    () => Object.values(parsedScores).reduce((a, b) => a + b, 0),
    [parsedScores],
  )
  const enteredCount = Object.keys(parsedScores).length

  if (!hydrated || !round || !course) {
    if (loadError) {
      return <CenterMessage text={`Course load failed: ${loadError}`} />
    }
    return <CenterMessage text="Loading…" busy />
  }

  const handleScoreChange = (holeNum: number, raw: string) => {
    // Allow empty, or 1-2 digit numeric input. Strip everything else.
    const cleaned = raw.replace(/[^0-9]/g, '').slice(0, 2)
    setScores(s => {
      if (cleaned === '') {
        const next = { ...s }
        delete next[holeNum]
        return next
      }
      return { ...s, [holeNum]: cleaned }
    })
  }

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    setSaveError(null)
    try {
      await endRound(round.id, parsedScores)
      router.replace('/' as never)
    } catch (e) {
      setSaveError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const totalPar = course.holes.reduce((sum, h) => sum + h.par, 0)
  const relToPar =
    enteredCount === course.holes.length ? total - totalPar : null

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>Scorecard</Text>
          <Text style={styles.summaryTotal}>
            {enteredCount === 0 ? '—' : total}
            <Text style={styles.summaryPar}>
              {' '}
              / par {totalPar}
              {relToPar != null
                ? relToPar === 0
                  ? '  (E)'
                  : `  (${relToPar > 0 ? '+' : ''}${relToPar})`
                : ''}
            </Text>
          </Text>
          <Text style={styles.summaryMeta}>
            {enteredCount} / {course.holes.length} holes entered
          </Text>
        </View>

        <View style={styles.gridHeader}>
          <Text style={[styles.gridHeaderCell, styles.cellHole]}>Hole</Text>
          <Text style={[styles.gridHeaderCell, styles.cellPar]}>Par</Text>
          <Text style={[styles.gridHeaderCell, styles.cellScore]}>Score</Text>
        </View>

        {course.holes.map(h => (
          <ScoreRow
            key={h.num}
            holeNum={h.num}
            par={h.par}
            value={scores[h.num] ?? ''}
            onChange={v => handleScoreChange(h.num, v)}
          />
        ))}

        {saveError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{saveError}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? 'Saving…' : 'Save & End Round'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => router.back()}
          disabled={saving}
        >
          <Text style={styles.cancelButtonText}>Back to round</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function ScoreRow({
  holeNum,
  par,
  value,
  onChange,
}: {
  holeNum: number
  par: number
  value: string
  onChange: (v: string) => void
}) {
  return (
    <View style={styles.gridRow}>
      <Text style={[styles.cellHole, styles.cellHoleText]}>{holeNum}</Text>
      <Text style={[styles.cellPar, styles.cellParText]}>{par}</Text>
      <TextInput
        style={[styles.cellScore, styles.cellScoreInput]}
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        maxLength={2}
        placeholder="—"
        placeholderTextColor="#9CA3AF"
        returnKeyType="next"
        textAlign="center"
        accessibilityLabel={`Score for hole ${holeNum}`}
      />
    </View>
  )
}

function CenterMessage({ text, busy }: { text: string; busy?: boolean }) {
  return (
    <View style={styles.centerMsg}>
      {busy ? <ActivityIndicator color="#1a472a" /> : null}
      <Text style={styles.centerMsgText}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scroll: { padding: 16, gap: 8 },

  summary: {
    backgroundColor: '#00214C',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    alignItems: 'center',
    gap: 4,
  },
  summaryLabel: {
    color: '#B3E0D5',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  summaryTotal: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  summaryPar: { color: '#B3E0D5', fontSize: 16, fontWeight: '500' },
  summaryMeta: { color: '#B3E0D5', fontSize: 12 },

  gridHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  gridHeaderCell: {
    color: '#00214C',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  cellHole: { width: 64 },
  cellHoleText: { fontSize: 18, fontWeight: '700', color: '#00214C' },
  cellPar: { width: 64 },
  cellParText: { fontSize: 16, color: '#6B7280' },
  cellScore: { flex: 1 },
  cellScoreInput: {
    fontSize: 22,
    fontWeight: '700',
    color: '#00214C',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    fontVariant: ['tabular-nums'],
  },

  saveButton: {
    marginTop: 16,
    backgroundColor: '#03563D',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },

  cancelButton: {
    marginTop: 6,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButtonText: { color: '#6B7280', fontSize: 14, fontWeight: '600' },

  errorBox: {
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DC2626',
    marginTop: 8,
  },
  errorText: { color: '#DC2626', fontSize: 13 },

  centerMsg: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: '#F9FAFB',
  },
  centerMsgText: { color: '#00214C', textAlign: 'center', fontSize: 16 },
})
