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
import { Map, Camera, OfflineManager } from '@maplibre/maplibre-react-native'
import { vectorStyle, satelliteStyleJSON } from '@/lib/tiles'

const SPIKE_CENTER: [number, number] = [-122.0822035425919, 37.4226711132062]

type Log = { text: string; ok: boolean }

export default function SpikeScreen() {
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
    <View style={styles.container}>
      <Map
        style={styles.map}
        mapStyle={mapStyle}
        onDidFinishLoadingMap={() => log(`${layer} map loaded OK`)}
        onDidFailLoadingMap={() => log(`${layer} map FAILED to load`, false)}
      >
        <Camera initialViewState={{ center: SPIKE_CENTER, zoom: 15 }} />
      </Map>

      <TouchableOpacity
        style={styles.toggle}
        onPress={() => setLayer(l => (l === 'vector' ? 'satellite' : 'vector'))}
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
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  toggle: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,33,76,0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  toggleText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  logBox: {
    maxHeight: 180,
    backgroundColor: '#111827',
    padding: 12,
  },
  logLine: { color: '#A2DDC1', fontFamily: 'monospace', fontSize: 12 },
  logError: { color: '#DC2626' },
})
