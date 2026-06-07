import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator'
import { useFonts } from 'expo-font'
import {
  Sora_400Regular,
  Sora_500Medium,
  Sora_600SemiBold,
  Sora_700Bold,
  Sora_800ExtraBold,
} from '@expo-google-fonts/sora'

import { db } from '@/db'
import migrations from '@/db/migrations'
import { GlassRoot } from '@/components/GlassSurface'
import { PersistentBackdrop } from '@/components/MapBackdrop'
import { ensureHydrated } from '@/lib/round'
import { colors, type } from '@/lib/theme'

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations)
  const [fontsLoaded] = useFonts({
    Sora_400Regular,
    Sora_500Medium,
    Sora_600SemiBold,
    Sora_700Bold,
    Sora_800ExtraBold,
  })

  useEffect(() => {
    if (success) {
      ensureHydrated().catch(e => console.error('hydrate failed', e))
    }
  }, [success])

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {error ? (
        <BootMessage
          text={`Database migration failed:\n${error.message}`}
          error
        />
      ) : !success || !fontsLoaded ? (
        <BootMessage text="Preparing…" busy />
      ) : (
        // The satellite backdrop is mounted ONCE here, behind the router stack,
        // inside the app-wide GlassRoot. Screens render transparent on top
        // (contentStyle is transparent), so list-to-list navigation no longer
        // re-decodes the photo or re-creates the blur target, and the 'fade'
        // transition only crossfades the chrome over a stable background.
        <GlassRoot>
          <View style={styles.appRoot}>
            <PersistentBackdrop />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: 'transparent' },
                animation: 'fade',
              }}
            />
          </View>
        </GlassRoot>
      )}
    </SafeAreaProvider>
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
      {busy ? <ActivityIndicator color={colors.primary} /> : null}
      <Text style={[styles.bootText, error && styles.bootTextError]}>
        {text}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  // Navy floor behind the persistent satellite photo (shows only in the
  // moment before the image paints).
  appRoot: { flex: 1, backgroundColor: colors.surfaceLowest },
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: colors.surface,
  },
  bootText: { ...type.bodyMd, textAlign: 'center' },
  bootTextError: { color: colors.error },
})
