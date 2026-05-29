import { ReactNode } from 'react'
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { colors, radius, space, type } from '@/lib/theme'
import { EagleIcon } from './EagleIcon'

interface TopBarProps {
  title: string
  subtitle?: string
  onBack?: () => void
  right?: ReactNode
  variant?: 'solid' | 'glass'
  style?: ViewStyle
}

export function TopBar({
  title,
  subtitle,
  onBack,
  right,
  variant = 'solid',
  style,
}: TopBarProps) {
  const insets = useSafeAreaInsets()
  const background = variant === 'glass' ? colors.glassSoft : colors.surface
  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: background, paddingTop: insets.top },
        style,
      ]}
    >
      <View style={styles.inner}>
        <View style={styles.left}>
          {onBack ? (
            <TouchableOpacity
              onPress={onBack}
              style={styles.backBtn}
              accessibilityLabel="Back"
              hitSlop={8}
            >
              <Text style={styles.backGlyph}>‹</Text>
            </TouchableOpacity>
          ) : (
            <EagleIcon style={styles.logo} />
          )}
          <View style={styles.titleBlock}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  )
}

interface IconActionProps {
  onPress: () => void
  label: string
  glyph: string | React.ReactElement
}

export function IconAction({ onPress, label, glyph }: IconActionProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={label}
      style={iconActionStyles.btn}
      hitSlop={8}
    >
      <Text style={iconActionStyles.glyph}>{glyph}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  bar: {
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant,
  },
  inner: {
    height: 64,
    paddingHorizontal: space.marginMobile,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  right: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  logo: {
    width: 128,
    height: 128,
    borderRadius: radius.full,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceLow,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
  },
  backGlyph: {
    color: colors.onSurface,
    fontFamily: 'Sora_700Bold',
    fontSize: 28,
    lineHeight: 30,
    marginTop: -3,
  },
  titleBlock: { flex: 1, gap: 2 },
  title: { ...type.headlineMd, color: colors.primary },
  subtitle: { ...type.labelXs },
})

const iconActionStyles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    color: colors.onSurfaceVariant,
    fontSize: 22,
    fontFamily: 'Sora_600SemiBold',
  },
})
