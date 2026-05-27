import { StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native'

import { type } from '@/lib/theme'

interface Props {
  children: string
  style?: ViewStyle
  textStyle?: TextStyle
}

export function SectionLabel({ children, style, textStyle }: Props) {
  return (
    <View style={style}>
      <Text style={[styles.label, textStyle]}>{children}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  label: { ...type.labelSm },
})
