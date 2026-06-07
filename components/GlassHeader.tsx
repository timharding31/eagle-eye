import { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft, MenuIcon } from 'lucide-react-native'

import { colors, radius, space, type } from '@/lib/theme'
import { EagleIcon } from './EagleIcon'
import { GlassSurface } from './GlassSurface'
import { IconButton } from './Button'

// The shared map-forward header, floated as a glass panel over a blur target
// (the procedural MapBackdrop on list screens, the live map on fix). One
// component, two shapes:
//   • Home shape — Eagle mark + EAGLE EYE wordmark + a trailing control
//     (pass `onMenuPress` or an explicit `right` node).
//   • Sub-screen shape — a back chevron + title (+ optional subtitle), used by
//     history / add / scorecard / fix so every screen wears the same chrome.
// `onBack` is what switches it into sub-screen shape.
export function GlassHeader({
  onBack,
  title,
  subtitle,
  onMenuPress,
  onLogoPress,
  right,
}: {
  onBack?: () => void
  title?: string
  subtitle?: string
  onMenuPress?: () => void
  onLogoPress?: () => void
  right?: ReactNode
}) {
  const insets = useSafeAreaInsets()

  const trailing =
    right ??
    (onMenuPress ? (
      <IconButton
        onPress={onMenuPress}
        glyph={<MenuIcon width={26} height={26} color={colors.onSurface} />}
        width={48}
        height={48}
        variant="ghost"
      />
    ) : null)

  return (
    <GlassSurface
      rounded={radius['2xl']}
      style={[styles.bar, { marginTop: insets.top + space.sm }]}
    >
      {onBack ? (
        <IconButton
          onPress={onBack}
          glyph={
            <ChevronLeft width={26} height={26} color={colors.onSurface} />
          }
          width={48}
          height={48}
          variant="ghost"
        />
      ) : onLogoPress ? (
        <Pressable onPress={onLogoPress} hitSlop={8}>
          <EagleIcon style={styles.logo} />
        </Pressable>
      ) : (
        <EagleIcon style={styles.logo} />
      )}

      <View style={styles.titles}>
        {title ? (
          <>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.wordmark}>EAGLE EYE</Text>
        )}
      </View>

      {trailing}
    </GlassSurface>
  )
}

const LOGO = 64

const styles = StyleSheet.create({
  bar: {
    marginHorizontal: space.marginMobile,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
  },
  logo: { width: LOGO, height: LOGO },
  titles: { flex: 1, minWidth: 0, gap: 2 },
  wordmark: {
    fontFamily: 'Sora_700Bold',
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: 2,
    color: colors.primary,
  },
  title: {
    fontFamily: 'Sora_700Bold',
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: 1,
    color: colors.primary,
  },
  subtitle: {
    ...type.labelXs,
    color: colors.goldenEagle,
    marginTop: 1,
  },
})
