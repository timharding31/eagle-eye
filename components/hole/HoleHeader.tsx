import { View, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { colors, space, radius, type, shadows } from '@/lib/theme'
import { GlassSurface } from '../GlassSurface'

import { ArrowLeftCircleIcon } from 'lucide-react-native'
import { useRouter } from 'expo-router'

import { useHoleScene } from './scene'
import { IconButton } from '../Button'

// Gap below the status bar before the floating header pill.
// Status bar is transparent, so safe area is much larger than expected.
const HEADER_TOP_GAP = -6

const BUTTON_SIZE = 48

// The floating top header: a back button, then a centered pill with the course
// name over a compact micro-label meta row (hole · length · par). The pill is
// informational (no touch target) and the whole row uses the lighter
// dark={false} glass so the top chrome recedes. The hero number lives in the
// right-edge measurements panel; this stays neutral (cream, no accent) to keep
// the accent story disciplined.
export function HoleHeader() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { course, currentHole, holeYards } = useHoleScene()

  return (
    <View style={[styles.wrap, { top: insets.top + HEADER_TOP_GAP }]}>
      <IconButton
        glyph={
          <ArrowLeftCircleIcon
            width={24}
            height={24}
            color={colors.onSurface}
          />
        }
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace('/' as never)
        }
        width={BUTTON_SIZE}
        height={BUTTON_SIZE}
        variant="glass"
        dark={false}
      />
      <GlassSurface
        style={styles.panel}
        rounded={radius.lg}
        pointerEvents="none"
        dark={false}
      >
        <Text style={styles.name} numberOfLines={1}>
          {course.name}
        </Text>
        <View style={styles.divider} />
        <View style={styles.meta}>
          <Text style={styles.metaText}>Hole {currentHole.num}</Text>
          <Text style={styles.metaText}>{holeYards} yds</Text>
          <Text style={styles.metaText}>Par {currentHole.par}</Text>
        </View>
      </GlassSurface>
      <View style={{ width: BUTTON_SIZE }} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
  },
  // Border / radius / blur / top-highlight all come from GlassSurface; this
  // only carries padding and the lift shadow. Sizes to its content.
  panel: {
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    alignItems: 'center',
    ...shadows.card,
  },
  name: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.2,
    color: colors.onSurface,
  },
  divider: {
    alignSelf: 'stretch',
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.outlineVariant,
    marginVertical: space.xs,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    justifyContent: 'space-around',
  },
  // Cream rather than labelSm's default muted variant: on the lighter
  // dark={false} glass the muted tint loses contrast over the imagery.
  metaText: { ...type.labelSm, color: colors.onSurface },
})
