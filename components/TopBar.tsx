import { ReactNode } from 'react'
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { colors, radius, space, type } from '@/lib/theme'
import { EagleIcon } from './EagleIcon'
import { GlassBackdrop } from './GlassSurface'

interface TopBarProps {
  title?: string
  subtitle?: string
  // A node centered horizontally across the whole bar, independent of the
  // left/right clusters. Use for a tidy centered readout that shouldn't crowd
  // the logo. pointerEvents are disabled so it never intercepts the side
  // controls — keep it non-interactive.
  center?: ReactNode
  onBack?: () => void
  right?: ReactNode
  variant?: 'solid' | 'glass'
  style?: ViewStyle
}

export function TopBar({
  title,
  subtitle,
  center,
  onBack,
  right,
  variant = 'solid',
  style,
}: TopBarProps) {
  const insets = useSafeAreaInsets()
  const glass = variant === 'glass'
  return (
    <View
      style={[
        styles.bar,
        {
          // Glass: transparent so the GlassBackdrop's real blur + translucent
          // fill shows through. Solid: the opaque surface colour.
          backgroundColor: glass ? 'transparent' : colors.surface,
          paddingTop: insets.top,
        },
        style,
      ]}
    >
      {glass && <GlassBackdrop />}
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
          {title ? (
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
          ) : null}
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>

      {center ? (
        <View style={[styles.center, { top: insets.top }]} pointerEvents="none">
          {center}
        </View>
      ) : null}
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

const EAGLE_SIZE = 124

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
  // Overlay centered across the full bar width, sitting over the 64px inner
  // row (below the status-bar inset). Non-interactive so the side clusters
  // stay tappable.
  center: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: EAGLE_SIZE,
    height: EAGLE_SIZE,
    marginTop: 2,
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
  subtitle: { ...type.labelSm },
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
