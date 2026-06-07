import { memo, ReactNode } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'

import { GlassBlurTarget } from '@/components/GlassSurface'
import { colors } from '@/lib/theme'

// Satellite backdrop for the home screens — a real golf-course aerial, so home
// → hole reads as one continuous instrument (the play screen is live satellite
// imagery; this is a still). The photo is a downsampled, portrait-cropped WebP
// (assets/background-home.webp, 1080×1920, ~0.5 MB) — blur + veil hide
// compression, so it doesn't need to be large.
//
// This backdrop is mounted ONCE, persistently, in app/_layout.tsx behind the
// router <Stack> (inside the app-wide <GlassRoot>). Every list screen renders
// transparent on top of it, so navigating between them no longer re-decodes the
// photo or tears down / re-creates the blur target — and the 'fade' route
// transition only crossfades the lightweight glass chrome over a stable
// background instead of two full backdrops blurring at once. Screens with their
// own live map (hole view, course-fix) nest their own <GlassRoot> + map blur
// target, which shadows this one; the still photo simply sits behind their
// opaque map, unseen.
const BACKGROUND = require('@/assets/background-home.webp')

// Navy veil over the photo, as [offset 0–1, opacity] stops top→bottom. Darker
// at the top (status bar / top bar) and bottom (CTA / footer) for chrome
// legibility, lighter through the middle so the course shows. Raise the stops
// if cream text washes out over bright fairway; lower them to show more course.
// [opacity 0.0–0.85]
const VEIL: [number, number][] = [
  [0, 0.52],
  [0.42, 0.24],
  [1, 0.72],
]

// The persistent photo + veil layer. Mounted once in app/_layout.tsx as the
// app-wide glass blur target. It paints nothing interactive (pointerEvents
// none) so the router screens stacked above it own all touches.
function PersistentBackdropImpl() {
  return (
    <GlassBlurTarget style={StyleSheet.absoluteFill}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Image
          source={BACKGROUND}
          style={{
            right: 0,
            top: 0,
            width: '100%',
            height: 'auto',
            minHeight: '100%',
          }}
          resizeMode="cover"
        />
        {/* Veil drawn with an SVG gradient (no expo-linear-gradient dep).
            viewBox 0–1 + preserveAspectRatio="none" stretches the gradient to
            fill the screen regardless of aspect ratio. */}
        <Svg
          style={StyleSheet.absoluteFill}
          width="100%"
          height="100%"
          preserveAspectRatio="none"
          viewBox="0 0 1 1"
        >
          <Defs>
            <LinearGradient id="veil" x1="0" y1="0" x2="0" y2="1">
              {VEIL.map(([offset, opacity], i) => (
                <Stop
                  key={i}
                  offset={offset}
                  stopColor={colors.surfaceLowest}
                  stopOpacity={opacity}
                />
              ))}
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="1" height="1" fill="url(#veil)" />
        </Svg>
      </View>
    </GlassBlurTarget>
  )
}

export const PersistentBackdrop = memo(PersistentBackdropImpl)

// A thin transparent passthrough that fills the screen. The actual satellite
// photo + blur target now live once in app/_layout.tsx (see PersistentBackdrop
// above); this just lets the list screens keep their <MapBackdrop>…</MapBackdrop>
// shape while rendering over that shared, persistent backdrop. The screen's own
// root must be transparent for the backdrop to show through.
function MapBackdropImpl({ children }: { children?: ReactNode }) {
  return (
    <View style={styles.fill} pointerEvents="box-none">
      {children}
    </View>
  )
}

export const MapBackdrop = memo(MapBackdropImpl)

const styles = StyleSheet.create({
  fill: { flex: 1 },
})
