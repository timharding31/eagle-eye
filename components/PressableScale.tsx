import { ReactNode } from 'react'
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

// A Pressable that springs down on press and back on release — the app-wide
// tactile "juice" for cards and tappable rows. The scale runs entirely on the
// UI thread (Reanimated worklet), so it stays smooth even while JS is busy.
//
// Spring feel is a knob: lower SCALE_TO = deeper press; higher stiffness =
// snappier. [scaleTo 0.90–0.99]
const SPRING = { damping: 16, stiffness: 280, mass: 0.5 }

export function PressableScale({
  children,
  style,
  scaleTo = 0.96,
  onPress,
  onLongPress,
  delayLongPress,
  disabled,
  hitSlop,
  accessibilityLabel,
}: {
  children?: ReactNode
  style?: StyleProp<ViewStyle>
  scaleTo?: number
  onPress?: () => void
  onLongPress?: () => void
  delayLongPress?: number
  disabled?: boolean
  hitSlop?: PressableProps['hitSlop']
  accessibilityLabel?: string
}) {
  const pressed = useSharedValue(0)
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(pressed.value ? scaleTo : 1, SPRING) }],
  }))

  return (
    <AnimatedPressable
      onPressIn={() => {
        pressed.value = 1
      }}
      onPressOut={() => {
        pressed.value = 0
      }}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityLabel={accessibilityLabel}
      style={[style, animStyle]}
    >
      {children}
    </AnimatedPressable>
  )
}
