import { ReactNode } from 'react'
import {
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  ViewStyle,
} from 'react-native'

import { colors, radius, shadows, space, type } from '@/lib/theme'
import { GlassBackdrop } from './GlassSurface'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'lg'

interface ButtonProps {
  label: string
  onPress: () => void
  variant?: Variant
  size?: Size
  disabled?: boolean
  leading?: ReactNode
  style?: ViewStyle
  children?: React.ReactNode
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled,
  leading,
  style,
  children,
}: ButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={[
        styles.base,
        sizeStyles[size],
        variantContainer[variant],
        disabled && styles.disabled,
        style,
      ]}
    >
      {leading}
      {children || (
        <Text style={[styles.label, variantLabel[variant]]}>{label}</Text>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  label: {
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.3,
  },
  disabled: { opacity: 0.45 },
})

const sizeStyles: Record<Size, ViewStyle> = {
  md: { height: 44 },
  lg: { height: 56 },
}

const variantContainer: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.secondary, ...shadows.cta },
  secondary: {
    backgroundColor: colors.surfaceHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
  },
  danger: { backgroundColor: colors.errorContainer, ...shadows.cta },
}

const variantLabel: Record<Variant, TextStyle> = {
  primary: { color: colors.primary, fontSize: 17 },
  secondary: { color: colors.onSurface, fontSize: 16 },
  ghost: { color: colors.onSurfaceVariant, fontSize: 15 },
  danger: { color: colors.primary, fontSize: 17 },
}

interface IconButtonProps {
  glyph: string | React.ReactElement
  onPress: () => void
  label?: string
  size?: number
  variant?: 'primary' | 'danger' | 'glass' | 'ghost'
  // Reflects an on/off toggle's state in the control itself (gold accent ring
  // + gold label) rather than via a text suffix. The caller still owns the
  // glyph color, so tint it to match when active.
  active?: boolean
  disabled?: boolean
}

export function IconButton({
  glyph,
  onPress,
  label,
  size = 56,
  variant = 'primary',
  active,
  disabled,
}: IconButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      activeOpacity={0.85}
      style={[
        iconBtnStyles.base,
        typeof size === 'number' && size > 56 && iconBtnStyles.large,
        { width: size, height: 'auto' },
        (
          {
            primary: '',
            danger: iconBtnStyles.danger,
            glass: iconBtnStyles.glass,
            ghost: iconBtnStyles.ghost,
          } as const
        )[variant],
        active && iconBtnStyles.active,
        disabled && styles.disabled,
      ]}
    >
      {variant === 'glass' && <GlassBackdrop dark />}
      {label && (
        <Text
          style={[iconBtnStyles.label, active && iconBtnStyles.labelActive]}
        >
          {label}
        </Text>
      )}
      <Text style={iconBtnStyles.glyph}>{glyph}</Text>
    </TouchableOpacity>
  )
}

const iconBtnStyles = StyleSheet.create({
  base: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    flexDirection: 'column',
    padding: 8,
    gap: 8,
  },
  large: {
    borderRadius: radius['2xl'],
  },
  danger: { backgroundColor: colors.errorContainer },
  glass: {
    // Backdrop comes from <GlassBackdrop/> (real blur + translucent fill);
    // the container stays transparent and just clips it to the rounded rect.
    backgroundColor: 'transparent',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    // 1px cream top highlight — same lifted-glass cue as the readout panels.
    borderTopWidth: 1,
    borderTopColor: colors.glassHighlight,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  // Active toggle: a gold accent ring (matches the gold "active" cue already
  // used by the hole-grid selection) so on/off reads from the control, not a
  // label suffix.
  active: {
    borderWidth: 1.5,
    borderColor: colors.goldenEagle,
    borderTopWidth: 1.5,
    borderTopColor: colors.goldenEagle,
  },
  labelActive: {
    color: colors.goldenEagle,
  },
  glyph: {
    color: colors.onSurface,
    fontFamily: 'Sora_700Bold',
    fontSize: 20,
  },
  label: {
    ...type.labelXs,
    color: colors.primary,
    textAlign: 'center',
  },
})
