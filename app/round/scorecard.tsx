import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { ScreenShell } from '@/components/ScreenShell'
import { SectionLabel } from '@/components/SectionLabel'
import { TopBar } from '@/components/TopBar'
import { loadCourse, type Course } from '@/lib/course'
import {
  endRound,
  getHoleState,
  useActiveRound,
  useIsHydrated,
} from '@/lib/round'
import { colors, radius, space, type } from '@/lib/theme'

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
        const c = await loadCourse(round.courseId)
        if (cancelled) return
        setCourse(c)
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
      // Pop the round + scorecard back to the home root so the system
      // back button can't return into a finished round.
      if (router.canGoBack()) router.dismissAll()
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
    <ScreenShell>
      <TopBar
        title="SCORECARD"
        subtitle={`${course.name.toUpperCase()}`}
        onBack={() => router.back()}
      />
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Card variant="elevated" padding="lg" style={styles.summary}>
            <SectionLabel>TOTAL</SectionLabel>
            <Text style={styles.summaryTotal}>
              {enteredCount === 0 ? '—' : total}
            </Text>
            <Text style={styles.summaryPar}>
              {`/ par ${totalPar}`}
              {relToPar != null
                ? relToPar === 0
                  ? '  (E)'
                  : `  (${relToPar > 0 ? '+' : ''}${relToPar})`
                : ''}
            </Text>
            <Text style={styles.summaryMeta}>
              {enteredCount} / {course.holes.length} holes entered
            </Text>
          </Card>

          <Card variant="surface" padding="md" style={styles.gridCard}>
            <View style={styles.gridHeader}>
              <Text style={[styles.gridHeaderCell, styles.cellHole]}>HOLE</Text>
              <Text style={[styles.gridHeaderCell, styles.cellPar]}>PAR</Text>
              <Text style={[styles.gridHeaderCell, styles.cellScore]}>
                SCORE
              </Text>
            </View>

            {course.holes.map((h, i) => (
              <ScoreRow
                key={h.num}
                holeNum={h.num}
                par={h.par}
                value={scores[h.num] ?? ''}
                onChange={v => handleScoreChange(h.num, v)}
                divider={i < course.holes.length - 1}
              />
            ))}
          </Card>

          {saveError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{saveError}</Text>
            </View>
          )}

          <Button
            label={saving ? 'Saving…' : 'Save & End Round'}
            onPress={handleSave}
            disabled={saving}
            style={{ marginTop: space.md }}
          />
          <Button
            label="Back to round"
            variant="ghost"
            size="md"
            onPress={() => router.back()}
            disabled={saving}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenShell>
  )
}

function ScoreRow({
  holeNum,
  par,
  value,
  onChange,
  divider,
}: {
  holeNum: number
  par: number
  value: string
  onChange: (v: string) => void
  divider: boolean
}) {
  return (
    <View style={[styles.gridRow, divider && styles.gridRowDivider]}>
      <Text style={[styles.cellHole, styles.cellHoleText]}>{holeNum}</Text>
      <Text style={[styles.cellPar, styles.cellParText]}>{par}</Text>
      <TextInput
        style={[styles.cellScore, styles.cellScoreInput]}
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        maxLength={2}
        placeholder="—"
        placeholderTextColor={colors.onSurfaceMuted}
        returnKeyType="next"
        textAlign="center"
        accessibilityLabel={`Score for hole ${holeNum}`}
      />
    </View>
  )
}

function CenterMessage({ text, busy }: { text: string; busy?: boolean }) {
  return (
    <ScreenShell>
      <View style={styles.centerMsg}>
        {busy ? <ActivityIndicator color={colors.primary} /> : null}
        <Text style={styles.centerMsgText}>{text}</Text>
      </View>
    </ScreenShell>
  )
}

const styles = StyleSheet.create({
  kav: { flex: 1 },
  scroll: { padding: space.marginMobile, gap: space.sm },

  summary: { alignItems: 'center', gap: space.xs },
  summaryTotal: {
    ...type.displayHero,
    color: colors.primary,
    marginTop: space.xs,
  },
  summaryPar: { ...type.bodyLg, color: colors.onSurfaceVariant },
  summaryMeta: { ...type.bodyMd, color: colors.onSurfaceMuted },

  gridCard: { padding: 0, overflow: 'hidden' },
  gridHeader: {
    flexDirection: 'row',
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    backgroundColor: colors.surfaceLowest,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  gridHeaderCell: { ...type.labelXs },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: space.md,
  },
  gridRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant,
  },
  cellHole: { width: 56 },
  cellHoleText: {
    fontSize: 18,
    fontFamily: 'Sora_700Bold',
    color: colors.primary,
  },
  cellPar: { width: 56 },
  cellParText: {
    fontSize: 16,
    fontFamily: 'Sora_400Regular',
    color: colors.onSurfaceVariant,
  },
  cellScore: { flex: 1 },
  cellScoreInput: {
    fontSize: 20,
    fontFamily: 'Sora_700Bold',
    color: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceLow,
    fontVariant: ['tabular-nums'],
  },

  errorBox: {
    backgroundColor: colors.errorContainer,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.error,
    marginTop: space.sm,
  },
  errorText: { ...type.bodyMd, color: colors.primary },

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
