import { ReactNode } from 'react'
import {
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  ViewStyle,
} from 'react-native'

import { colors, radius, shadows, space } from '@/lib/theme'

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
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled,
  leading,
  style,
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
      <Text style={[styles.label, variantLabel[variant]]}>{label}</Text>
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
  glyph: string
  onPress: () => void
  label: string
  size?: number
  variant?: 'secondary' | 'danger'
  disabled?: boolean
}

export function IconButton({
  glyph,
  onPress,
  label,
  size = 56,
  variant = 'secondary',
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
        { width: size, height: size },
        variant === 'danger' && iconBtnStyles.danger,
        disabled && styles.disabled,
      ]}
    >
      <Text style={iconBtnStyles.glyph}>{glyph}</Text>
    </TouchableOpacity>
  )
}

const iconBtnStyles = StyleSheet.create({
  base: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
  },
  danger: { backgroundColor: colors.errorContainer, borderColor: colors.error },
  glyph: {
    color: colors.onSurface,
    fontFamily: 'Sora_700Bold',
    fontSize: 20,
  },
})
