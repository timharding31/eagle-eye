import { ReactNode } from 'react'
import { StyleSheet, View, ViewStyle } from 'react-native'

import { colors, radius, shadows, space } from '@/lib/theme'

interface CardProps {
  children: ReactNode
  variant?: 'surface' | 'elevated' | 'outline'
  padding?: keyof typeof paddingMap
  style?: ViewStyle
}

const paddingMap = {
  sm: space.sm,
  md: space.md,
  lg: space.lg,
} as const

export function Card({
  children,
  variant = 'surface',
  padding = 'md',
  style,
}: CardProps) {
  return (
    <View
      style={[
        styles.base,
        variantStyle[variant],
        { padding: paddingMap[padding] },
        style,
      ]}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.xl,
  },
})

const variantStyle: Record<NonNullable<CardProps['variant']>, ViewStyle> = {
  surface: { backgroundColor: colors.surfaceLow },
  elevated: { backgroundColor: colors.surfaceHigh, ...shadows.card },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
  },
}
