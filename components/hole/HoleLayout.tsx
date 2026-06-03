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
        variant="glass"
        center={
          <Text style={styles.headerReadout}>
            {`PAR ${currentHole.par} · ${holeYards} YDS`}
          </Text>
        }
        right={
          <IconAction
            label="Home"
            glyph={<HomeIcon color={colors.onSurface} />}
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

  // Centered top readout: the hole's par + playing length. The hole number
  // lives in the bottom drawer, so it's dropped here to keep this minimal.
  headerReadout: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 16,
    letterSpacing: 1,
    paddingLeft: 48,
    color: colors.onSurface,
    fontVariant: ['tabular-nums'],
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
