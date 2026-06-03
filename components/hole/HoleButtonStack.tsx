import { View, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { colors, space } from '@/lib/theme'
import { IconButton } from '@/components/Button'
import {
  CrosshairIcon,
  GoalIcon,
  GolfTeeIcon,
  LandPlotIcon,
} from '@/components/icons'

import { useHoleScene } from './scene'

// The floating vertical stack of map controls: set-tee, hole/green toggle,
// and the LZ visibility toggle (par 4/5 only).
export function HoleButtonStack() {
  const insets = useSafeAreaInsets()
  const {
    cameraMode,
    toggleCameraMode,
    openTeeDialog,
    teeBusy,
    position,
    hasTeeOverride,
    currentHole,
    lzShown,
    toggleLz,
  } = useHoleScene()

  const floatingBottom = insets.bottom + 108

  return (
    <View style={[styles.iconButtons, { bottom: floatingBottom + 48 }]}>
      {cameraMode === 'hole' ? (
        <IconButton
          glyph={<GolfTeeIcon width={48} height={48} color={colors.primary} />}
          onPress={openTeeDialog}
          label="Set Tee"
          size={80}
          variant="glass"
          disabled={teeBusy || (!position && !hasTeeOverride)}
        />
      ) : null}

      <IconButton
        glyph={
          cameraMode === 'green' ? (
            <LandPlotIcon width={48} height={48} color={colors.primary} />
          ) : (
            <GoalIcon width={48} height={48} color={colors.primary} />
          )
        }
        onPress={toggleCameraMode}
        label={cameraMode === 'green' ? 'Hole' : 'Green'}
        size={80}
        variant="glass"
      />

      {currentHole.par >= 4 && cameraMode === 'hole' && (
        <IconButton
          glyph={
            <CrosshairIcon
              width={48}
              height={48}
              color={lzShown ? colors.onSurface : colors.onSurfaceVariant}
            />
          }
          onPress={toggleLz}
          label={`LZ${lzShown ? ': ON' : ': OFF'}`}
          size={80}
          variant="glass"
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  iconButtons: {
    position: 'absolute',
    right: space.lg,
    display: 'flex',
    flexDirection: 'column-reverse',
    alignItems: 'flex-end',
    gap: 16,
  },
})
