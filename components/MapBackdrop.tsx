import { memo } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'

import { GlassBlurTarget, GlassRoot } from '@/components/GlassSurface'
import { colors } from '@/lib/theme'

// Satellite backdrop for the home screens — a real golf-course aerial, so home
// → hole reads as one continuous instrument (the play screen is live satellite
// imagery; this is a still). The photo is a downsampled, portrait-cropped WebP
// (assets/background-home.webp, 1080×1920, ~0.5 MB) — blur + veil hide
// compression, so it doesn't need to be large.
//
// This component IS the blur target for the home screens: it owns its own
// <GlassRoot> + <GlassBlurTarget> so any <GlassSurface> in `children` frosts the
// backdrop with no ref plumbing (mirrors how the live hole map is the target on
// the play screen). The photo + veil sit inside the target; `children` (the
// glass chrome) render on top, OUTSIDE it, so they sample it without recursion.
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

function MapBackdropImpl({ children }: { children?: React.ReactNode }) {
  return (
    <GlassRoot>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <GlassBlurTarget style={StyleSheet.absoluteFill}>
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
        </GlassBlurTarget>
        {children}
      </View>
    </GlassRoot>
  )
}

export const MapBackdrop = memo(MapBackdropImpl)
