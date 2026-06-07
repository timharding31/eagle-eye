import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'

import { Button } from '@/components/Button'
import { CourseThumbnail } from '@/components/CourseThumbnail'
import { GlassSurface } from '@/components/GlassSurface'
import { PressableScale } from '@/components/PressableScale'
import { type CourseSummary } from '@/lib/course'
import { colors, radius, space, type } from '@/lib/theme'
import { usePrefetchStatus, type PrefetchStatus } from '@/lib/tiles'

import { useHomeScene } from './scene'

// The "START A ROUND" region: the installed-Course list, each row a glass card
// with a routing thumbnail, name, imagery-status chip, and a Start button.
export function CourseList() {
  const { courses, busy, start, remove, retry } = useHomeScene()

  return (
    <View style={styles.section}>
      <Text style={styles.label}>START A ROUND</Text>
      {courses.length === 0 ? (
        <Text style={styles.dim}>No courses installed yet.</Text>
      ) : (
        courses.map((c, i) => (
          <CourseRow
            key={c.slug}
            index={i}
            course={c}
            busy={busy}
            onStart={() => start(c.slug)}
            onRemove={c.source !== 'bundled' ? () => remove(c) : undefined}
            onRetry={() => retry(c)}
          />
        ))
      )}
    </View>
  )
}

function CourseRow({
  index,
  course,
  busy,
  onStart,
  onRemove,
  onRetry,
}: {
  index: number
  course: CourseSummary
  busy: boolean
  onStart: () => void
  onRemove?: () => void
  onRetry: () => void
}) {
  const status = usePrefetchStatus(course.slug)
  const isReady = status?.satellite.state === 'complete'

  return (
    // Gentle staggered fade-in as the list paints — eased slide, no spring
    // bounce. [stagger 40–90ms] [duration 220–400ms] [rise 8–16px]
    <Animated.View
      entering={FadeInDown.delay(index * 60)
        .duration(300)
        .withInitialValues({ transform: [{ translateY: 12 }] })}
    >
      <PressableScale
        onLongPress={onRemove}
        delayLongPress={500}
        disabled={!onRemove}
        scaleTo={0.975}
      >
        <GlassSurface dark={false} rounded={radius['2xl']} style={styles.card}>
          <CourseThumbnail slug={course.slug} />
          <View style={styles.cardMeta}>
            <Text style={styles.courseName} numberOfLines={1}>
              {course.name}
            </Text>
            {!isReady && (
              <ImageryChip
                status={status}
                installed={!!onRemove}
                onRetry={onRetry}
              />
            )}
          </View>
          <Button
            label="Start"
            size="md"
            variant={isReady ? 'primary' : 'ghost'}
            onPress={onStart}
            disabled={busy}
          />
        </GlassSurface>
      </PressableScale>
    </Animated.View>
  )
}

// Compact imagery-status chip: a colored dot + a terse status line. Ready =
// bright green; downloading = gold + NN%; error/idle = muted. On error the row
// becomes tappable to re-download (the only recovery path now that the home
// "Refetch" button is gone); otherwise long-press-to-remove is folded into the
// line for installed courses so the gesture stays discoverable.
function ImageryChip({
  status,
  installed,
  onRetry,
}: {
  status: PrefetchStatus | null
  installed: boolean
  onRetry: () => void
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

  const canRetry = state === 'error'

  return (
    <TouchableOpacity
      style={styles.chipRow}
      onPress={canRetry ? onRetry : undefined}
      disabled={!canRetry}
      hitSlop={canRetry ? 8 : undefined}
      activeOpacity={0.7}
    >
      <View style={[styles.chipDot, { backgroundColor: dotColor }]} />
      <Text style={[styles.chipText, { color: textColor }]} numberOfLines={1}>
        {text}
        {canRetry ? (
          <Text style={styles.chipRetry}>{'  ·  tap to retry'}</Text>
        ) : installed ? (
          <Text style={styles.chipInstalled}>{'  ·  hold to remove'}</Text>
        ) : null}
      </Text>
    </TouchableOpacity>
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
  chipRetry: { color: colors.goldenEagle },
})
