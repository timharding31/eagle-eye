import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import * as Location from 'expo-location'

import { Button } from '@/components/Button'
import { EagleIcon } from '@/components/EagleIcon'
import { MapBackdrop } from '@/components/MapBackdrop'
import { colors, space, type } from '@/lib/theme'

// First-launch onboarding (HANDOFF §4a). Reached from the home screen when the
// location permission is still undetermined; "Get Started" requests it and
// returns to home. There is no settings/onboarding store — granted or denied,
// the live permission status keeps this from showing again (see §10).
export default function LandingScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [busy, setBusy] = useState(false)

  async function handleGetStarted() {
    setBusy(true)
    try {
      // Either outcome proceeds — distances simply won't update if denied, and
      // the player can still browse courses and history.
      await Location.requestForegroundPermissionsAsync()
    } catch {
      // ignore — fall through to home regardless
    } finally {
      router.replace('/' as never)
    }
  }

  return (
    <View style={styles.root}>
      <MapBackdrop>
        <View
          style={[
            styles.content,
            { paddingTop: insets.top + 54, paddingBottom: insets.bottom + 30 },
          ]}
        >
          <View style={styles.mark}>
            <EagleIcon style={styles.logo} />
          </View>
          <Text style={styles.wordmark}>EAGLE EYE</Text>
          <Text style={styles.sublabel}>GOLF RANGEFINDER</Text>

          <View style={styles.spacer} />

          <Text style={styles.tagline}>
            Stand on the tee.{'\n'}Know the{' '}
            <Text style={styles.gold}>number</Text>.
          </Text>
          <Text style={styles.blurb}>
            Front, center and back of every green — over real satellite imagery,
            fully offline.
          </Text>

          <View style={styles.spacer} />

          <Text style={styles.perm}>
            Location lets us measure your distances.
          </Text>
          <Button
            label="Get Started"
            onPress={handleGetStarted}
            disabled={busy}
            style={styles.cta}
          />
        </View>
      </MapBackdrop>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceLowest },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: space.xl,
  },
  mark: {
    marginBottom: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 96,
    height: 96,
    // Soft glow so the mark lifts off the backdrop.
    shadowColor: colors.goldenEagle,
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  wordmark: {
    fontFamily: 'Sora_800ExtraBold',
    fontSize: 32,
    letterSpacing: 4,
    color: colors.primary,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 2 },
  },
  sublabel: {
    ...type.labelSm,
    color: colors.goldenEagle,
    letterSpacing: 5,
    marginTop: space.sm,
  },
  spacer: { flex: 1 },
  tagline: {
    fontFamily: 'Sora_700Bold',
    fontSize: 27,
    lineHeight: 34,
    letterSpacing: -0.4,
    textAlign: 'center',
    color: colors.primary,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 2 },
    marginBottom: space.md,
  },
  gold: { color: colors.goldenEagle },
  blurb: {
    ...type.bodyMd,
    textAlign: 'center',
    color: colors.onSurfaceVariant,
    maxWidth: 320,
  },
  perm: {
    ...type.labelXs,
    letterSpacing: 0.5,
    textTransform: 'none',
    color: colors.onSurfaceVariant,
    marginBottom: space.md,
    textAlign: 'center',
  },
  cta: { alignSelf: 'stretch' },
})
