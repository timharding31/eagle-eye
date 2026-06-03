import { ReactNode } from 'react'
import { StyleSheet, View, ViewStyle } from 'react-native'
import { BlurView } from 'expo-blur'

import { colors, radius } from '@/lib/theme'

// Real frosted glass for floating chrome over the satellite map: a live
// backdrop blur (expo-blur) under a translucent dark fill, a hairline border,
// and a 1px cream top highlight. The blur is what makes a panel read as glass
// rather than a flat dark card pasted on the imagery.
//
// Android notes (this app is Android-only):
//   • The blur only renders via the dimezis method. We use the SDK-31+ variant
//     for the better performance path (it no-ops to a plain fill on very old
//     Android, which we never target).
//   • dimezis blur can only capture content that is part of the view hierarchy.
//     MapLibre's default `androidView="surface"` (GLSurfaceView) is NOT
//     captured — the map must be mounted with `androidView="texture"` for the
//     blur to actually frost the map. See HoleMap.tsx.
//   • It re-blurs every frame, so keep glass surfaces small/few. These panels
//     are tiny, which is the budget this is sized for.
const GLASS_BLUR_INTENSITY = 22 // [12–40] higher = stronger frost, less map detail

// Just the blurred backdrop layer. Drop it as the first child of any clipped,
// self-positioning container (e.g. a TouchableOpacity that already owns its
// border/radius) to frost it without restructuring that component.
export function GlassBackdrop({
  intensity = GLASS_BLUR_INTENSITY,
}: {
  intensity?: number
}) {
  return (
    <BlurView
      intensity={intensity}
      tint="dark"
      experimentalBlurMethod="dimezisBlurViewSdk31Plus"
      style={[StyleSheet.absoluteFill, fill.fill]}
    />
  )
}

// A complete glass panel: the blurred backdrop plus the border/highlight/clip
// chrome. Lay content as children; pass padding/min-size/shadow via `style`.
export function GlassSurface({
  children,
  style,
  rounded = radius.md,
}: {
  children?: ReactNode
  style?: ViewStyle | ViewStyle[]
  rounded?: number
}) {
  return (
    <View style={[styles.surface, { borderRadius: rounded }, style]}>
      <GlassBackdrop />
      {children}
    </View>
  )
}

const fill = StyleSheet.create({
  fill: { backgroundColor: colors.glassFill },
})

const styles = StyleSheet.create({
  surface: {
    // overflow:hidden clips the blur to the rounded rect — the dimezis blur
    // doesn't honor borderRadius on its own.
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    borderTopWidth: 1,
    borderTopColor: colors.glassHighlight,
  },
})
