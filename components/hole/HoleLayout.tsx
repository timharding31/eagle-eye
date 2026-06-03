import { View, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { HomeIcon } from 'lucide-react-native'

import { IconAction, TopBar } from '@/components/TopBar'
import { colors, space, radius, type } from '@/lib/theme'

import { useHoleScene } from './scene'
import { HoleMap } from './HoleMap'
import { HoleMeasurements } from './HoleMeasurements'
import { HoleButtonStack } from './HoleButtonStack'
import { BottomDrawer } from './BottomDrawer'
import { TeeOverrideDialog } from './TeeOverrideDialog'

// The full-screen hole view: the map under glass chrome (TopBar, the F/G/P
// measurements, the control button stack) with the hole-nav drawer pinned to
// the bottom. Each region pulls what it needs from the scene context, so this
// is purely composition.
export function HoleLayout() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { currentHole, holeYards, locationGranted } = useHoleScene()

  return (
    <View style={styles.container}>
      <HoleMap />

      <TopBar
        title={`HOLE ${currentHole.num}`}
        subtitle={`PAR ${currentHole.par} • ${holeYards} YARDS`}
        variant="glass"
        right={
          <IconAction
            label="Home"
            glyph={<HomeIcon color={colors.onSurfaceVariant} />}
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace('/' as never)
            }
          />
        }
        style={styles.topBarOverlay}
      />

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
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceLowest },

  topBarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },

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
