import { useEffect } from 'react'
import { config } from '@/lib/gluestack-ui-theme'
import { GluestackUIProvider } from '@gluestack-ui/themed'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, LogBox, StyleSheet, Text, View } from 'react-native'
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator'

import { db } from '@/db'
import migrations from '@/drizzle/migrations'
import { ensureHydrated } from '@/lib/round'

// Gluestack still imports SafeAreaView from 'react-native' (deprecated in 0.85).
// We don't render any SafeAreaView ourselves — silence the upstream noise.
LogBox.ignoreLogs([/SafeAreaView has been deprecated/])

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations)

  useEffect(() => {
    if (success) {
      ensureHydrated().catch(e => console.error('lib/round: hydrate failed', e))
    }
  }, [success])

  return (
    <GluestackUIProvider config={config}>
      <StatusBar style="light" />
      {error ? (
        <BootMessage
          text={`Database migration failed:\n${error.message}`}
          error
        />
      ) : !success ? (
        <BootMessage text="Preparing database…" busy />
      ) : (
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: '#00214C' },
            headerTintColor: '#ffffff',
            headerTitleStyle: { fontWeight: 'bold' },
            contentStyle: { backgroundColor: '#F9FAFB' },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Eagle Eye' }} />
          <Stack.Screen name="round/[hole]" options={{ title: 'Hole' }} />
          <Stack.Screen
            name="round/scorecard"
            options={{ title: 'Scorecard' }}
          />
          <Stack.Screen name="spike" options={{ title: 'Spike: Map Test' }} />
        </Stack>
      )}
    </GluestackUIProvider>
  )
}

function BootMessage({
  text,
  busy,
  error,
}: {
  text: string
  busy?: boolean
  error?: boolean
}) {
  return (
    <View style={styles.boot}>
      {busy ? <ActivityIndicator color="#1a472a" /> : null}
      <Text style={[styles.bootText, error && styles.bootTextError]}>
        {text}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: '#F9FAFB',
  },
  bootText: { color: '#00214C', textAlign: 'center', fontSize: 16 },
  bootTextError: { color: '#DC2626' },
})
