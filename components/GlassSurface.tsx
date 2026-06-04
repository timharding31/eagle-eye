import { createContext, ReactNode, RefObject, useContext, useRef } from 'react'
import { StyleSheet, View, ViewStyle } from 'react-native'
import { BlurView, BlurTargetView } from 'expo-blur'

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
//   • The SDK-31+ dimezis method does NOT auto-sample the view hierarchy. Each
//     BlurView must be handed a `blurTarget` ref pointing at a <BlurTargetView>
//     that wraps the content to frost (the map) — without it the blur silently
//     falls back to "none". We thread that ref through context: wrap the screen
//     in <GlassRoot>, wrap the map in <GlassBlurTarget>, and every GlassBackdrop
//     beneath picks up the target automatically.
//   • A BlurTargetView can only capture content that is part of the view
//     hierarchy. MapLibre's default `androidView="surface"` (GLSurfaceView) is
//     NOT captured — the map must be mounted with `androidView="texture"` for
//     the blur to actually frost the map. See HoleMap.tsx.
//   • It re-blurs every frame, so keep glass surfaces small/few. These panels
//     are tiny, which is the budget this is sized for.
const GLASS_BLUR_INTENSITY = 22 // [12–40] higher = stronger frost, less map detail

// The shared blur-target ref, supplied by GlassRoot and consumed by every
// GlassBackdrop/GlassSurface beneath it. Null when a glass surface is rendered
// outside a GlassRoot — the blur then no-ops to its translucent fill.
const BlurTargetContext = createContext<RefObject<View | null> | null>(null)

// Wrap a screen that floats glass chrome over a map. Owns the single
// blur-target ref and hands it to all descendant glass surfaces via context.
export function GlassRoot({ children }: { children: ReactNode }) {
  const ref = useRef<View | null>(null)
  return (
    <BlurTargetContext.Provider value={ref}>
      {children}
    </BlurTargetContext.Provider>
  )
}

// Wraps the content the glass should sample (the map). Must be a descendant of
// <GlassRoot>; everything inside is what the backdrop blur captures.
export function GlassBlurTarget({
  children,
  style,
}: {
  children: ReactNode
  style?: ViewStyle | ViewStyle[]
}) {
  const ref = useContext(BlurTargetContext)
  return (
    <BlurTargetView ref={ref ?? undefined} style={style}>
      {children}
    </BlurTargetView>
  )
}

// Just the blurred backdrop layer. Drop it as the first child of any clipped,
// self-positioning container (e.g. a TouchableOpacity that already owns its
// border/radius) to frost it without restructuring that component.
export function GlassBackdrop({
  intensity = GLASS_BLUR_INTENSITY,
  dark = false,
}: {
  intensity?: number
  dark?: boolean
}) {
  const blurTarget = useContext(BlurTargetContext)
  // The blurred map first, then the navy fill layered *over* it. BlurView
  // paints its native blur on top of its own backgroundColor, so a fill set
  // there would sit behind the blur and barely show — the tint has to be a
  // separate overlay above the BlurView to read as frosted navy glass.
  return (
    <>
      <BlurView
        intensity={intensity}
        tint="dark"
        blurMethod="dimezisBlurViewSdk31Plus"
        blurTarget={blurTarget ?? undefined}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, fill.fill, dark && fill.fillDark]}
      />
    </>
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
  fillDark: {
    // backgroundColor: colors.glassFillDark,
  },
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
