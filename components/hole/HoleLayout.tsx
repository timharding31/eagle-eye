import { View, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { GlassBlurTarget, GlassRoot } from '@/components/GlassSurface'
import { colors, space, radius, type } from '@/lib/theme'

import { useHoleScene } from './scene'
import { HoleMap } from './HoleMap'
import { HoleMeasurements } from './HoleMeasurements'
import { HoleButtonStack } from './HoleButtonStack'
import { BottomDrawer } from './BottomDrawer'
import { TeeOverrideDialog } from './TeeOverrideDialog'
import { HoleHeader } from './HoleHeader'

// The full-screen hole view: the map under glass chrome (TopBar, the F/G/P
// measurements, the control button stack) with the hole-nav drawer pinned to
// the bottom. Each region pulls what it needs from the scene context, so this
// is purely composition.
export function HoleLayout() {
  const insets = useSafeAreaInsets()
  const { locationGranted } = useHoleScene()

  return (
    <GlassRoot>
      <View style={styles.container}>
        <GlassBlurTarget style={styles.mapTarget}>
          <HoleMap />
        </GlassBlurTarget>

        <HoleHeader />

        <HoleMeasurements />
        <HoleButtonStack />
        <BottomDrawer />
        <TeeOverrideDialog />

        {locationGranted === false && (
          <View
            style={[styles.permWarn, { top: insets.top + 80 + space.lg + 56 }]}
          >
            <Text style={styles.permWarnText}>
              Location permission denied — distances unavailable
            </Text>
          </View>
        )}
      </View>
    </GlassRoot>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceLowest },

  // The blur-target wrapper must fill the screen so the map (the frosted
  // content) lays out exactly as it did before the wrapper existed.
  mapTarget: { flex: 1 },

  permWarn: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    backgroundColor: colors.errorContainer,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.error,
  },
  permWarnText: {
    ...type.bodyMd,
    color: colors.primary,
    textAlign: 'center',
  },
})
