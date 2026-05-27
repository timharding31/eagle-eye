/**
 * Phase 0 risk spike — validates three things before sinking weeks in:
 *   1. ESRI World Imagery serves tiles to MapLibre RN without auth/CORS issues.
 *   2. OpenFreeMap vector tiles render correctly.
 *   3. MapLibre offline-pack API is accessible (offlinePack creation).
 *
 * This screen is not part of the MVP — delete after Phase 0 validation.
 */
import { useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Map, Camera, OfflineManager } from '@maplibre/maplibre-react-native'

import { TopBar } from '@/components/TopBar'
import { ScreenShell } from '@/components/ScreenShell'
import { colors, fonts, radius, space } from '@/lib/theme'
import { vectorStyle, satelliteStyleJSON } from '@/lib/tiles'

const SPIKE_CENTER: [number, number] = [-122.0822035425919, 37.4226711132062]

type Log = { text: string; ok: boolean }

export default function SpikeScreen() {
  const router = useRouter()
  const [layer, setLayer] = useState<'vector' | 'satellite'>('vector')
  const [logs, setLogs] = useState<Log[]>([])

  function log(text: string, ok = true) {
    setLogs(prev => [...prev, { text, ok }])
  }

  useEffect(() => {
    testOfflinePack()
  }, [])

  async function testOfflinePack() {
    try {
      const packs = await OfflineManager.getPacks()
      log(`offlineManager accessible — ${packs.length} existing pack(s)`)
    } catch (e) {
      log(`offlineManager error: ${String(e)}`, false)
    }
  }

  const mapStyle =
    layer === 'vector' ? vectorStyle : JSON.parse(satelliteStyleJSON)

  return (
    <ScreenShell>
      <TopBar
        title="MAP SPIKE"
        subtitle="PHASE 0 VALIDATION"
        onBack={() => router.back()}
      />
      <View style={styles.container}>
        <Map
          style={styles.map}
          mapStyle={mapStyle}
          compass={false}
          onDidFinishLoadingMap={() => log(`${layer} map loaded OK`)}
          onDidFailLoadingMap={() => log(`${layer} map FAILED to load`, false)}
        >
          <Camera initialViewState={{ center: SPIKE_CENTER, zoom: 15 }} />
        </Map>

        <TouchableOpacity
          style={styles.toggle}
          onPress={() =>
            setLayer(l => (l === 'vector' ? 'satellite' : 'vector'))
          }
        >
          <Text style={styles.toggleText}>
            {layer === 'vector' ? 'Satellite' : 'Vector'}
          </Text>
        </TouchableOpacity>

        <ScrollView style={styles.logBox}>
          {logs.map((l, i) => (
            <Text key={i} style={[styles.logLine, !l.ok && styles.logError]}>
              {l.ok ? '✓' : '✗'} {l.text}
            </Text>
          ))}
          {logs.length === 0 && <Text style={styles.logLine}>Loading…</Text>}
        </ScrollView>
      </View>
    </ScreenShell>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  toggle: {
    position: 'absolute',
    top: space.md,
    right: space.md,
    backgroundColor: colors.glass,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
  },
  toggleText: {
    color: colors.primary,
    fontFamily: 'Sora_600SemiBold',
    fontSize: 13,
  },
  logBox: {
    maxHeight: 180,
    backgroundColor: colors.surfaceLowest,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  logLine: {
    color: colors.onSurfaceVariant,
    fontFamily: fonts.data,
    fontSize: 12,
    lineHeight: 18,
  },
  logError: { color: colors.error },
})
