import { View, Text, StyleSheet } from 'react-native'

export default function ScorecardScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Scorecard — Phase 4</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 24, color: '#00214C' },
})
