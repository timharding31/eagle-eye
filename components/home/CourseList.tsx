import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import { Button } from '@/components/Button'
import { CourseThumbnail } from '@/components/CourseThumbnail'
import { GlassSurface } from '@/components/GlassSurface'
import { type CourseSummary } from '@/lib/course'
import { colors, radius, space, type } from '@/lib/theme'
import { usePrefetchStatus, type PrefetchStatus } from '@/lib/tiles'

import { useHomeScene } from './scene'

// The "START A ROUND" region: the installed-Course list, each row a glass card
// with a routing thumbnail, name, imagery-status chip, and a Start button.
export function CourseList() {
  const { courses, busy, start, remove } = useHomeScene()

  return (
    <View style={styles.section}>
      <Text style={styles.label}>START A ROUND</Text>
      {courses.length === 0 ? (
        <Text style={styles.dim}>No courses installed yet.</Text>
      ) : (
        courses.map(c => (
          <CourseRow
            key={c.slug}
            course={c}
            busy={busy}
            onStart={() => start(c.slug)}
            onRemove={c.source !== 'bundled' ? () => remove(c) : undefined}
          />
        ))
      )}
    </View>
  )
}

function CourseRow({
  course,
  busy,
  onStart,
  onRemove,
}: {
  course: CourseSummary
  busy: boolean
  onStart: () => void
  onRemove?: () => void
}) {
  const status = usePrefetchStatus(course.slug)
  const isReady = status?.satellite.state === 'complete'

  return (
    <TouchableOpacity
      activeOpacity={onRemove ? 0.9 : 1}
      onLongPress={onRemove}
      delayLongPress={500}
      disabled={!onRemove}
    >
      <GlassSurface dark={false} rounded={radius['2xl']} style={styles.card}>
        <CourseThumbnail slug={course.slug} />
        <View style={styles.cardMeta}>
          <Text style={styles.courseName} numberOfLines={1}>
            {course.name}
          </Text>
          {!isReady && <ImageryChip status={status} installed={!!onRemove} />}
        </View>
        <Button
          label="Start"
          size="md"
          variant={isReady ? 'primary' : 'ghost'}
          onPress={onStart}
          disabled={busy}
        />
      </GlassSurface>
    </TouchableOpacity>
  )
}

// Compact imagery-status chip: a colored dot + a terse status line. Ready =
// bright green; downloading = gold + NN%; error/idle = muted. Long-press-to-
// remove is folded into the line for installed courses so the gesture stays
// discoverable.
function ImageryChip({
  status,
  installed,
}: {
  status: PrefetchStatus | null
  installed: boolean
}) {
  const sat = status?.satellite
  const state = sat?.state ?? 'idle'
  const pct = Math.round(sat?.percentage ?? 0)

  let dotColor = colors.onSurfaceMuted
  let text = 'Imagery pending'
  let textColor = colors.onSurfaceMuted
  if (state === 'complete') {
    dotColor = colors.fairwayBright
    textColor = colors.fairwayBright
    text = 'Imagery ready'
  } else if (state === 'downloading') {
    dotColor = colors.goldenEagle
    textColor = colors.goldenEagle
    text = `Downloading · ${pct}%`
  } else if (state === 'error') {
    dotColor = colors.error
    textColor = colors.error
    text = 'Download failed'
  }

  return (
    <View style={styles.chipRow}>
      <View style={[styles.chipDot, { backgroundColor: dotColor }]} />
      <Text style={[styles.chipText, { color: textColor }]} numberOfLines={1}>
        {text}
        {installed ? (
          <Text style={styles.chipInstalled}>{'  ·  hold to remove'}</Text>
        ) : null}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  label: {
    ...type.labelSm,
    color: colors.primary,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
    marginBottom: space.xs,
    marginLeft: 2,
  },
  dim: { ...type.bodyMd, color: colors.onSurfaceMuted, textAlign: 'center' },

  card: {
    padding: space.md - 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md - 3,
  },
  cardMeta: { flex: 1, minWidth: 0, gap: space.sm },
  courseName: { ...type.headlineMd, fontSize: 18, color: colors.primary },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { ...type.labelXs },
  chipInstalled: { color: colors.onSurfaceMuted },
})
