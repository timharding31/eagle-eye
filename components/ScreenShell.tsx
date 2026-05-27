import { ReactNode } from 'react'
import { StyleSheet, View, ViewStyle } from 'react-native'

import { colors } from '@/lib/theme'

interface ScreenShellProps {
  children: ReactNode
  style?: ViewStyle
}

// Sets the dark teal background under every screen. Screens render their
// own TopBar; the Stack header is disabled globally in app/_layout.tsx.
export function ScreenShell({ children, style }: ScreenShellProps) {
  return <View style={[styles.shell, style]}>{children}</View>
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.surface },
})
