import { Platform, TextStyle } from 'react-native'

// Eagle Eye design system — deep navy tonal palette with cream foreground
// text and maroon CTA. Designed to read well over satellite imagery in
// bright outdoor light.

// ─── oklch color engine ──────────────────────────────────────────────────────
// Standard oklch → oklab → linear-sRGB → sRGB pipeline. Out-of-gamut values
// soft-clamp, so keep knob values within the sRGB gamut to avoid hue drift.

type Ok = [number, number, number] // [L, C, H°]

const oklch = (l: number, c: number, h: number): Ok => [l, c, h]

function toHex([l, c, h]: Ok): string {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b
  const s_ = l - 0.0894841775 * a - 1.291485548 * b
  const lv = l_ * l_ * l_
  const mv = m_ * m_ * m_
  const sv = s_ * s_ * s_
  const r = 4.076741662 * lv - 3.307711591 * mv + 0.230969929 * sv
  const g = -1.268438005 * lv + 2.609757401 * mv - 0.341319397 * sv
  const bv = -0.004196086 * lv - 0.703418615 * mv + 1.707614701 * sv
  const gamma = (x: number) =>
    x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055
  const clamp = (x: number) => Math.max(0, Math.min(1, x))
  return (
    '#' +
    [r, g, bv]
      .map(x =>
        Math.round(clamp(gamma(x)) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  )
}

function toRgba(color: Ok, alpha: number): string {
  const hex = toHex(color)
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Shifts lightness and scales chroma proportionally — preserves the perceived
// saturation-to-lightness relationship of the base color across the ramp.
const shade = ([l, c, h]: Ok, dL: number): Ok => {
  const newL = Math.max(0, Math.min(1, l + dL))
  return [newL, l > 0 ? (c * newL) / l : c, h]
}

// ─── palette knobs ────────────────────────────────────────────────────────────
// Edit these to retheme the app. Every derived color is a shade() or alpha
// variant of one of these bases. Suggested tuning ranges are in the comments.

//                                                     L [range]        C [range]      H [range]
const _surface = oklch(0.2636, 0.0689, 268.6) // navy surface      L [0.15–0.40]  C [0.04–0.12]  H [240–290]
const _variant = oklch(0.8192, 0.0424, 259.6) // secondary text    L [0.65–0.92]  C [0.02–0.08]  H [240–290]
const _primary = oklch(0.9723, 0.0216, 83.3) // cream foreground  L [0.90–1.00]  C [0.00–0.05]  H [60–100]
const _cta = oklch(0.3767, 0.1546, 29.2) // maroon CTA        L [0.25–0.55]  C [0.10–0.22]  H [15–45]
const _eagle = oklch(0.7293, 0.13, 82.9) // golden eagle      L [0.60–0.80]  C [0.10–0.18]  H [65–95]
// Error uses 3 knobs (Material tone-30/tone-20 have higher chroma than tone-80).
// Keep all three on the same H to retheme error as a group.
const _err = oklch(0.8383, 0.0891, 26.8) // error foreground  L [0.65–0.92]  C [0.06–0.15]  H [15–40]
const _errCont = oklch(0.4171, 0.1702, 27.4) // error container   L [0.25–0.50]  C [0.10–0.22]  H [15–40]
const _errOn = oklch(0.3275, 0.1336, 27.3) // on-error text     L [0.20–0.40]  C [0.08–0.18]  H [15–40]
const _lzFill = oklch(0.2549, 0.0885, 256.4) // landing zone fill L [0.15–0.45]  C [0.05–0.15]  H [240–270]
const _fairway = oklch(0.4021, 0.0831, 165.2) // fairway green     L [0.30–0.55]  C [0.05–0.14]  H [140–180]
// "Imagery ready"/positive bright green — a lighter, more saturated shade of
// the fairway knob so it stays in the oklch system (retheme via _fairway).
// Matches the mockup's --fairway-bright (≈ #2f9d6f). Chroma is bumped past the
// proportional shade() ramp to read as a vivid "ready" accent. [dL 0.12–0.20]
const _fairwayBright = ((): Ok => {
  const [l, c, h] = shade(_fairway, 0.16)
  return oklch(l, c * 1.28, h)
})()

// Lightness step between adjacent surface tones — raise for more contrast.
const _step = 0.038 // [0.02–0.06]

export const colors = {
  // ── surface tonal ramp — adjust _surface (and _step) to shift the whole bg ──
  surfaceLowest: toHex(shade(_surface, -2 * _step)), // darkest bg
  surfaceLow: toHex(shade(_surface, -1 * _step)),
  surface: toHex(_surface),
  surfaceHigh: toHex(shade(_surface, +1 * _step)),
  surfaceHighest: toHex(shade(_surface, -0.059)), // drawer elevation

  // ── foreground ──
  primary: toHex(_primary),
  onSurface: toHex(_primary),
  onSurfaceVariant: toHex(_variant),
  onSurfaceMuted: toRgba(_primary, 0.62),

  // ── CTA ──
  secondary: toHex(_cta),
  secondaryPressed: toHex(shade(_cta, -0.048)),
  onSecondary: toHex(_primary),

  // ── borders ──
  outline: toHex(_variant),
  outlineVariant: toRgba(_variant, 0.25),

  // ── accent ──
  goldenEagle: toHex(_eagle),

  // ── status ──
  error: toHex(_err),
  errorContainer: toHex(_errCont),
  onError: toHex(_errOn),

  // ── map overlays ──
  pin: toHex(_primary),
  pinFill: toHex(_cta),
  landingZone: toHex(_primary),
  landingZoneFill: toHex(_lzFill),
  fairwayGreen: toHex(_fairway),
  // Bright "ready"/positive green for imagery-ready chips and played-hole tints.
  fairwayBright: toHex(_fairwayBright),

  // ── glass effects (opaque dark surface at high alpha + hairline border) ──
  glass: toRgba(shade(_surface, -0.059), 0.92), // surfaceHighest tint
  glassSoft: toRgba(_surface, 0.85),
  // Cream-tinted inner top highlight applied to the top edge of glass panels.
  // On busy satellite imagery a drop shadow vanishes; a 1px light top edge is
  // what reads as a physical, lifted surface. [alpha 0.08–0.18]
  glassHighlight: toRgba(_primary, 0.14),
  // Translucent dark fill layered *over* a real backdrop blur (expo-blur) so
  // text stays legible while the frosted map still shows through. Lower than
  // `glass`/`glassSoft` because the blur itself carries most of the occlusion.
  // [alpha 0.30–0.55] — raise if numbers wash out over bright fairway.
  glassFill: toRgba(shade(_surface, 2 * _step), 0.48),
  glassFillDark: toRgba(shade(_surface, 0), 0.72),
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
    fontSize: 9,
    lineHeight: 10,
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
