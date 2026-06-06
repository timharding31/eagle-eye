import {
  OfflineManager,
  type OfflinePack,
  type OfflinePackError,
  type OfflinePackStatus,
  StyleSpecification,
} from '@maplibre/maplibre-react-native'
import { create } from 'zustand'

import type { BBox } from '@/lib/course/types'

const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

export const vectorStyle = OPENFREEMAP_STYLE

// ── Satellite provider (SPIKE: ESRI ↔ Mapbox) ──────────────────────────────
// Flip SATELLITE_PROVIDER to compare imagery providers on-device. ESRI is the
// shipped default (no key, offline-pack friendly). Mapbox is under evaluation
// for nicer color + sharpness at the Presidio (ESRI only looks good at z21).
// See docs/design-experiments/mapbox-satellite-spike.md for the tradeoffs —
// notably Mapbox needs an access token and its ToS restricts the offline-pack
// caching this app relies on, so 'mapbox' is currently a LIVE-RENDER-ONLY spike
// (the offline downloader below still pulls the hosted ESRI style).
type SatelliteProviderId = 'esri' | 'mapbox'
const SATELLITE_PROVIDER: SatelliteProviderId = 'esri'

// Public Mapbox token. Set EXPO_PUBLIC_MAPBOX_TOKEN in .env (Expo inlines
// EXPO_PUBLIC_* into the bundle at build). Never commit a token; use a
// URL-restricted pk.* token.
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? ''

type SatelliteProvider = {
  // XYZ tile template. ESRI is {z}/{y}/{x}; Mapbox is {z}/{x}/{y}.
  tiles: string
  // Pixels the source returns per tile (ESRI 256; Mapbox @2x retina 512).
  nativeTileSize: number
  // Deeper-zoom oversample factor (power of two): renderTileSize =
  // nativeTileSize / oversample. 2 ⇒ MapLibre fetches ~1 level deeper than the
  // camera zoom, so the overview matches screen resolution instead of blurring.
  oversample: number
  // Deepest native zoom the source serves. Clamps offline enumeration and the
  // render source maxzoom. ESRI ~21 over SF; Mapbox satellite advertises 22.
  sourceMaxzoom: number
  attribution: string
}

const PROVIDERS: Record<SatelliteProviderId, SatelliteProvider> = {
  esri: {
    tiles:
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    nativeTileSize: 256,
    oversample: 2,
    sourceMaxzoom: 21,
    attribution: 'Tiles © Esri',
  },
  mapbox: {
    // @2x ⇒ 512px retina imagery (sharper); .jpg90 ⇒ high-quality JPEG.
    tiles: `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${MAPBOX_TOKEN}`,
    nativeTileSize: 512,
    oversample: 2,
    sourceMaxzoom: 22,
    attribution: '© Mapbox © Maxar',
  },
}

function activeProvider(): SatelliteProvider {
  if (SATELLITE_PROVIDER === 'mapbox' && !MAPBOX_TOKEN) {
    // Don't render a blank map on a missing token — fall back to ESRI and make
    // the misconfiguration obvious in the logs.
    console.warn(
      '[tiles] SATELLITE_PROVIDER=mapbox but EXPO_PUBLIC_MAPBOX_TOKEN is unset; falling back to ESRI.',
    )
    return PROVIDERS.esri
  }
  return PROVIDERS[SATELLITE_PROVIDER]
}

const provider = activeProvider()

const MIN_ZOOM = 16
// ESRI World Imagery serves real native tiles to z20 (~0.12 m/px) over our SF
// courses — verified distinct, non-upscaled tiles. Presidio (the home course)
// uniquely also has native z21 (~6 cm/px); every other course tops out at z20.
// The hole-overview camera only frames to ~z16–17, so the deep levels only pay
// off in zoom-to-green mode (see GREEN_ZOOM_ADJUST in HoleMap). Each extra level
// is ~4× the tiles across the whole bbox, so we cap per-course rather than
// globally. Range hint: 19 (smallest packs) – 21 (sharpest, ~16× a z19 pack).
const DEFAULT_SATELLITE_MAX_ZOOM = 20
const SATELLITE_MAX_ZOOM_BY_COURSE: Record<string, number> = {
  presidio: 21,
}
// The hosted offline style's source maxzoom must be ≥ the deepest per-course
// pack maxZoom, or the downloader won't enumerate that level. Keep the ESRI
// value in sync with the "maxzoom" in docs/satellite-style.json. (Mapbox's
// hosted style is not wired up yet — see the spike note above.)
const SATELLITE_SOURCE_MAXZOOM = provider.sourceMaxzoom
// Vector (OpenFreeMap) detail is plenty at z20; no per-course need.
const VECTOR_MAX_ZOOM = 20

export function satelliteMaxZoom(courseId: string): number {
  return SATELLITE_MAX_ZOOM_BY_COURSE[courseId] ?? DEFAULT_SATELLITE_MAX_ZOOM
}

// Per ADR-008: expand the bbox slightly so holes that hug the OSM polygon
// boundary don't hit missing tiles.
const BBOX_EXPAND_PCT = 0.07

// Render-side oversampling. Declaring a SMALLER tileSize than the source's
// native size makes MapLibre fetch DEEPER (sharper) tiles for the same camera
// zoom:
//   requestedTileZoom ≈ round(cameraZoom + log2(nativeTileSize / renderTileSize))
// At native size the hole-overview (camera ~z16.5) pulls z16–17, coarser than
// the screen can show → blurry when zoomed out. At oversample 2 the overview
// pulls z17–18 (crisp, ~matches the screen) and zoom-to-green reaches the cap.
// Each step down is ~4× the tiles drawn per frame — the offline pack already
// holds every level, so this only affects live fetch volume + GPU work, NOT
// pack size, and needs no refetch.
// Derived per provider so ESRI (256 native) and Mapbox (512 @2x) land on the
// same effective +1-level oversample: 256/2 = 128, 512/2 = 256.
// NOTE: applies only to the on-screen render style. The hosted offline style
// (docs/satellite-style.json) keeps the native tileSize so the downloader
// enumerates the pyramid by native zoom.
const SATELLITE_RENDER_TILE_SIZE = provider.nativeTileSize / provider.oversample

function buildSatelliteStyle(maxzoom: number): StyleSpecification {
  return {
    version: 8,
    sources: {
      satellite: {
        type: 'raster',
        tiles: [provider.tiles],
        tileSize: SATELLITE_RENDER_TILE_SIZE,
        attribution: provider.attribution,
        maxzoom,
      },
    },
    layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
  }
}

// Cache by maxzoom so each call returns a stable object reference — the Map
// component remounts when its mapStyle prop identity changes, so we must not
// build a fresh object per render.
const satelliteStyleCache = new Map<number, StyleSpecification>()

// The on-screen render style for a course. The source maxzoom must match the
// course's deepest *downloaded* level: at green-zoom MapLibre overzooms the
// deepest tile the source advertises, so a course capped at z20 must say
// maxzoom:20 (else it requests nonexistent z21 tiles and shows blank), and
// Presidio must say maxzoom:21 to actually render its z21 tiles.
export function satelliteStyleFor(courseId: string): StyleSpecification {
  const mz = satelliteMaxZoom(courseId)
  let style = satelliteStyleCache.get(mz)
  if (!style) {
    style = buildSatelliteStyle(mz)
    satelliteStyleCache.set(mz, style)
  }
  return style
}

// The offline downloader (OfflineTilePyramidRegionDefinition) treats `mapStyle`
// as a resource it must *load* before it can enumerate a source's tile pyramid.
// Things that DON'T work, all confirmed on-device:
//   - raw inline JSON → read as a URL, fails.
//   - a file:// URL → the offline resource loader can't fetch file://.
//   - a data: URI → also not fetched, both leave the pack stuck with the style
//     as its only required resource and zero tiles enumerated (req=1, done=0).
// The loader only fetches over http(s), so the style is hosted as a static file
// on GitHub Pages (docs/satellite-style.json in this repo). The downloader
// fetches it (counted as the first required resource), parses the raster source,
// and enumerates the ESRI tile pyramid (MIN_ZOOM..per-course maxZoom) within the
// pack bounds. The fetch
// only happens at prefetch time, which already requires network — offline play
// at the course is unaffected. To change the style, edit docs/satellite-style.json
// and re-run "Refetch All Imagery" (Pages serves the live file).
const satelliteStyleUrl =
  'https://timharding31.github.io/eagle-eye/satellite-style.json'

export type LayerKind = 'vector' | 'satellite'
export type LayerState = 'idle' | 'downloading' | 'complete' | 'error'

export type LayerStatus = {
  state: LayerState
  percentage: number
  errorMessage?: string
}

export type PrefetchStatus = {
  vector: LayerStatus
  satellite: LayerStatus
}

type StatusStore = {
  byCourse: Record<string, PrefetchStatus>
}

const store = create<StatusStore>(() => ({ byCourse: {} }))

const idle = (): LayerStatus => ({ state: 'idle', percentage: 0 })
const blank = (): PrefetchStatus => ({ vector: idle(), satellite: idle() })

function setLayer(
  courseId: string,
  layer: LayerKind,
  patch: Partial<LayerStatus>,
) {
  store.setState(s => {
    const cur = s.byCourse[courseId] ?? blank()
    return {
      byCourse: {
        ...s.byCourse,
        [courseId]: { ...cur, [layer]: { ...cur[layer], ...patch } },
      },
    }
  })
}

type PackMeta = { courseId?: string; layer?: LayerKind }

function packMatches(
  pack: OfflinePack,
  courseId: string,
  layer: LayerKind,
): boolean {
  const m = pack.metadata as PackMeta | undefined
  return m?.courseId === courseId && m?.layer === layer
}

async function findPack(
  courseId: string,
  layer: LayerKind,
): Promise<OfflinePack | null> {
  const packs = await OfflineManager.getPacks()
  return packs.find(p => packMatches(p, courseId, layer)) ?? null
}

function expandBounds(b: BBox): BBox {
  const [w, s, e, n] = b
  const lngPad = (e - w) * BBOX_EXPAND_PCT
  const latPad = (n - s) * BBOX_EXPAND_PCT
  return [w - lngPad, s - latPad, e + lngPad, n + latPad]
}

// On Android, MapLibre doesn't persist 'complete' across app restarts — a
// finished pack comes back as 'inactive' with percentage=100. Use percentage
// as a fallback so we don't re-download already-complete packs.
function packStateToLayerState(
  status: OfflinePackStatus,
): Exclude<LayerState, 'error'> {
  if (status.state === 'complete' || status.percentage >= 100) return 'complete'
  if (status.state === 'active') return 'downloading'
  return 'idle'
}

function onProgress(courseId: string, layer: LayerKind) {
  return (_pack: OfflinePack, status: OfflinePackStatus) => {
    setLayer(courseId, layer, {
      state: packStateToLayerState(status),
      percentage: status.percentage,
      errorMessage: undefined,
    })
  }
}

function onError(courseId: string, layer: LayerKind) {
  return (_pack: OfflinePack, err: OfflinePackError) => {
    setLayer(courseId, layer, {
      state: 'error',
      errorMessage: err.message,
    })
  }
}

async function downloadLayer(
  courseId: string,
  layer: LayerKind,
  bounds: BBox,
): Promise<void> {
  const existing = await findPack(courseId, layer)
  if (existing) {
    const status = await existing.status()
    const layerState = packStateToLayerState(status)
    setLayer(courseId, layer, {
      state: layerState,
      percentage: status.percentage,
    })
    if (layerState === 'complete') return

    await OfflineManager.addListener(
      existing.id,
      onProgress(courseId, layer),
      onError(courseId, layer),
    )
    setLayer(courseId, layer, { state: 'downloading' })
    await existing.resume()
    return
  }

  setLayer(courseId, layer, { state: 'downloading', percentage: 0 })
  let pack: OfflinePack
  try {
    const mapStyle = layer === 'vector' ? vectorStyle : satelliteStyleUrl
    // The hosted style advertises a source maxzoom of SATELLITE_SOURCE_MAXZOOM;
    // clamp so we never enumerate a level the source can't serve.
    const maxZoom =
      layer === 'satellite'
        ? Math.min(satelliteMaxZoom(courseId), SATELLITE_SOURCE_MAXZOOM)
        : VECTOR_MAX_ZOOM
    pack = await OfflineManager.createPack(
      {
        mapStyle,
        bounds: expandBounds(bounds),
        minZoom: MIN_ZOOM,
        maxZoom,
        metadata: { courseId, layer } satisfies PackMeta,
      },
      onProgress(courseId, layer),
      onError(courseId, layer),
    )
  } catch (e) {
    // createPack rejecting (bad style URL, write failure, etc.) would otherwise
    // leave the layer stuck at 'downloading' 0% with no error surfaced — the
    // exact silent-stall symptom this code path is fixing. Make it visible.
    setLayer(courseId, layer, {
      state: 'error',
      errorMessage: e instanceof Error ? e.message : String(e),
    })
    throw e
  }
  // Race guard: createPack starts the native download before registering the JS
  // listener. Fast packs (vector tiles are tiny) can complete in this window —
  // the onProgress 'complete' event fires before addListener wires up, so it's
  // lost and the store stays stuck at downloading/0%. Poll status once now that
  // the listener is live to catch any missed completion.
  const st = await pack.status()
  if (st.state !== 'active') {
    setLayer(courseId, layer, {
      state: packStateToLayerState(st),
      percentage: st.percentage,
      errorMessage: undefined,
    })
  }
}

const inFlight = new Map<string, Promise<void>>()

export function prefetchForCourse(
  courseId: string,
  bounds: BBox,
): Promise<void> {
  const key = `prefetch:${courseId}`
  const existing = inFlight.get(key)
  if (existing) return existing
  const p = (async () => {
    try {
      await Promise.all([
        downloadLayer(courseId, 'vector', bounds),
        downloadLayer(courseId, 'satellite', bounds),
      ])
    } finally {
      inFlight.delete(key)
    }
  })()
  inFlight.set(key, p)
  return p
}

export async function prefetchStatus(
  courseId: string,
): Promise<PrefetchStatus> {
  const [vec, sat] = await Promise.all([
    findPack(courseId, 'vector'),
    findPack(courseId, 'satellite'),
  ])
  const result: PrefetchStatus = {
    vector: vec ? await packToStatus(vec) : idle(),
    satellite: sat ? await packToStatus(sat) : idle(),
  }
  store.setState(s => ({
    byCourse: { ...s.byCourse, [courseId]: result },
  }))
  return result
}

async function packToStatus(pack: OfflinePack): Promise<LayerStatus> {
  const st = await pack.status()
  return {
    state: packStateToLayerState(st),
    percentage: st.percentage,
  }
}

export async function retryPrefetch(
  courseId: string,
  bounds: BBox,
): Promise<void> {
  for (const layer of ['vector', 'satellite'] as const) {
    const existing = await findPack(courseId, layer)
    if (existing) {
      OfflineManager.removeListener(existing.id)
      await OfflineManager.deletePack(existing.id)
    }
  }
  store.setState(s => ({
    byCourse: { ...s.byCourse, [courseId]: blank() },
  }))
  await prefetchForCourse(courseId, bounds)
}

export function usePrefetchStatus(
  courseId: string | undefined,
): PrefetchStatus | null {
  return store(s => (courseId ? (s.byCourse[courseId] ?? null) : null))
}

export function isLayerReady(
  status: PrefetchStatus | null,
  layer: LayerKind,
): boolean {
  return status?.[layer].state === 'complete'
}
