import { Platform, TextStyle } from 'react-native'

// Eagle Eye design system — dark teal-green tonal palette with cream
// foreground text and maroon CTA. Inspired by the top-nav / drawer mockup;
// designed to read well over satellite imagery in bright outdoor light.

export const colors = {
  // Tonal surface palette (darkest → brightest)
  surfaceLowest: '#002b25',
  surfaceLow: '#003d33',
  surface: '#004d40',
  surfaceHigh: '#005b4f',
  surfaceBright: '#00695c',
  // Used for drawer-style elevations (slightly darker than base surface)
  surfaceHighest: '#00332c',

  // Foreground on dark surfaces
  primary: '#fdf5e6',
  onSurface: '#fdf5e6',
  onSurfaceVariant: '#b2dfdb',
  onSurfaceMuted: 'rgba(253, 245, 230, 0.62)',

  // Maroon CTA
  secondary: '#800000',
  secondaryPressed: '#6a0000',
  onSecondary: '#fdf5e6',

  // Borders / dividers
  outline: '#b2dfdb',
  outlineVariant: 'rgba(178, 223, 219, 0.25)',

  // Status
  error: '#ffb4ab',
  errorContainer: '#93000a',
  onError: '#690005',

  // Map overlay accents (kept for visual continuity with map markers)
  pin: '#fdf5e6',
  pinFill: '#800000',
  landingZone: '#fdf5e6',
  landingZoneFill: '#00214C',
  fairwayGreen: '#03563D',

  // Translucent glass effects (no backdrop blur on RN — we approximate
  // with an opaque dark surface at high alpha + a 1px hairline border)
  glass: 'rgba(0, 51, 44, 0.92)',
  glassSoft: 'rgba(0, 77, 64, 0.85)',
} as const

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 40,
  marginMobile: 20,
} as const

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  '3xl': 24,
  full: 9999,
} as const

// Font family names map to the Sora weights loaded in app/_layout.tsx.
// We use Sora across the board (display, headlines, body, labels) and
// the platform monospace for data labels.
export const fonts = {
  display: 'Sora_800ExtraBold',
  headlineLg: 'Sora_700Bold',
  headlineMd: 'Sora_600SemiBold',
  label: 'Sora_600SemiBold',
  body: 'Sora_400Regular',
  bodyMd: 'Sora_500Medium',
  data: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'monospace',
  })!,
} as const

export const type = {
  displayHero: {
    fontFamily: fonts.display,
    fontSize: 56,
    lineHeight: 60,
    letterSpacing: -1,
    color: colors.primary,
  } satisfies TextStyle,
  displayLg: {
    fontFamily: fonts.display,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -0.5,
    color: colors.primary,
  } satisfies TextStyle,
  headlineLg: {
    fontFamily: fonts.headlineLg,
    fontSize: 28,
    lineHeight: 34,
    color: colors.onSurface,
  } satisfies TextStyle,
  headlineMd: {
    fontFamily: fonts.headlineMd,
    fontSize: 20,
    lineHeight: 26,
    color: colors.onSurface,
  } satisfies TextStyle,
  bodyLg: {
    fontFamily: fonts.body,
    fontSize: 17,
    lineHeight: 24,
    color: colors.onSurface,
  } satisfies TextStyle,
  bodyMd: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
    color: colors.onSurface,
  } satisfies TextStyle,
  labelSm: {
    fontFamily: fonts.label,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
    color: colors.onSurfaceVariant,
  } satisfies TextStyle,
  labelXs: {
    fontFamily: fonts.label,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase' as const,
    color: colors.onSurfaceVariant,
  } satisfies TextStyle,
  dataLabel: {
    fontFamily: fonts.data,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 0.5,
    color: colors.onSurface,
  } satisfies TextStyle,
}

export const shadows = {
  drawer: {
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  cta: {
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
} as const

export const theme = { colors, space, radius, fonts, type, shadows } as const
