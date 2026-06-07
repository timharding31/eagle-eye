import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import * as Location from 'expo-location'

import { MapBackdrop } from '@/components/MapBackdrop'
import { HomeLayout } from '@/components/home/HomeLayout'
import { HomeSceneProvider } from '@/components/home/scene'
import { ensureHydrated, useIsHydrated } from '@/lib/round'
import { colors } from '@/lib/theme'

// Route loader: hydrate the Round store and clear the location-permission gate,
// then hand the home screen to its scene provider. All the home behavior lives
// under components/home (mirrors app/round/[hole].tsx → components/hole).
export default function HomeScreen() {
  const router = useRouter()
  const hydrated = useIsHydrated()
  const [permChecked, setPermChecked] = useState(false)

  useEffect(() => {
    ensureHydrated().catch(e => console.error('ensureHydrated', e))
  }, [])

  // Onboarding gate: with no settings store, lean on the live permission
  // status — undetermined means we've never asked, so show the landing screen
  // (which requests it). Granted/denied both skip it.
  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then(({ status }) => {
        if (status === 'undetermined') router.replace('/landing' as never)
        else setPermChecked(true)
      })
      .catch(() => setPermChecked(true))
  }, [router])

  if (!hydrated || !permChecked) {
    return (
      <View style={styles.root}>
        <MapBackdrop>
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        </MapBackdrop>
      </View>
    )
  }

  return (
    <HomeSceneProvider>
      <HomeLayout />
    </HomeSceneProvider>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
