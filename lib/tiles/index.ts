import {
  OfflineManager,
  type OfflinePack,
  type OfflinePackError,
  type OfflinePackStatus,
  StyleSpecification,
} from '@maplibre/maplibre-react-native'
import { create } from 'zustand'

import type { BBox } from '@/lib/course/types'

const ESRI_SATELLITE_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

export const vectorStyle = OPENFREEMAP_STYLE

const satelliteStyleSpec: StyleSpecification = {
  version: 8,
  sources: {
    esri: {
      type: 'raster',
      tiles: [ESRI_SATELLITE_TILES],
      tileSize: 256,
      attribution: 'Tiles © Esri',
      maxzoom: 20,
    },
  },
  layers: [
    {
      id: 'esri-satellite',
      type: 'raster',
      source: 'esri',
    },
  ],
}

export const satelliteStyle: StyleSpecification = satelliteStyleSpec

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
// and enumerates the z16–20 ESRI tile pyramid within the pack bounds. The fetch
// only happens at prefetch time, which already requires network — offline play
// at the course is unaffected. To change the style, edit docs/satellite-style.json
// and re-run "Refetch All Imagery" (Pages serves the live file).
const satelliteStyleUrl =
  'https://timharding31.github.io/eagle-eye/satellite-style.json'

const MIN_ZOOM = 16
// ESRI World Imagery serves real native tiles to z20 (~0.12 m/px) over our SF
// courses — verified distinct, non-upscaled tiles at z20 (and z21 at Presidio).
// The hole-overview camera only frames to ~z16–17, so z20 only pays off in
// zoom-to-green mode (see GREEN_ZOOM_ADJUST in HoleMap). Going past 20 mostly
// bloats packs (each level ~4× the tiles across the whole bbox) for no gain.
// Range hint: 19 (smallest packs) – 20 (sharp greens, ~4× larger packs).
const MAX_ZOOM = 20
// Per ADR-008: expand the bbox slightly so holes that hug the OSM polygon
// boundary don't hit missing tiles.
const BBOX_EXPAND_PCT = 0.07

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
    // TEMP diagnostic — remove once downloads confirmed working.
    console.log(
      `[tiles] progress ${courseId}/${layer} ${status.percentage}% state=${status.state} completed=${status.completedResourceCount}/${status.requiredResourceCount}`,
    )
    setLayer(courseId, layer, {
      state: packStateToLayerState(status),
      percentage: status.percentage,
      errorMessage: undefined,
    })
  }
}

function onError(courseId: string, layer: LayerKind) {
  return (_pack: OfflinePack, err: OfflinePackError) => {
    // TEMP diagnostic — remove once downloads confirmed working.
    console.log(`[tiles] ERROR ${courseId}/${layer}: ${err.message}`)
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
  console.log(`[tiles] downloadLayer ${courseId}/${layer} existing=${!!existing}`)
  if (existing) {
    const status = await existing.status()
    const layerState = packStateToLayerState(status)
    console.log(
      `[tiles] resume ${courseId}/${layer} state=${layerState} pct=${status.percentage}`,
    )
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
    console.log(
      `[tiles] createPack ${courseId}/${layer} style=${mapStyle.slice(0, 48)}…`,
    )
    pack = await OfflineManager.createPack(
      {
        mapStyle,
        bounds: expandBounds(bounds),
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        metadata: { courseId, layer } satisfies PackMeta,
      },
      onProgress(courseId, layer),
      onError(courseId, layer),
    )
    console.log(`[tiles] createPack OK ${courseId}/${layer} id=${pack.id}`)
  } catch (e) {
    // createPack rejecting (bad style URL, write failure, etc.) would otherwise
    // leave the layer stuck at 'downloading' 0% with no error surfaced — the
    // exact silent-stall symptom this code path is fixing. Make it visible.
    console.log(
      `[tiles] createPack THREW ${courseId}/${layer}: ${e instanceof Error ? e.message : String(e)}`,
    )
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
  console.log(
    `[tiles] post-create ${courseId}/${layer} state=${st.state} pct=${st.percentage} req=${st.requiredResourceCount} done=${st.completedResourceCount} tiles=${st.completedTileCount}`,
  )
  if (st.state !== 'active') {
    setLayer(courseId, layer, {
      state: packStateToLayerState(st),
      percentage: st.percentage,
      errorMessage: undefined,
    })
  }
  // TEMP: poll a few seconds in to see whether the download actually enumerated
  // tiles and is fetching. requiredResourceCount=0 ⇒ the style yielded no tiles.
  if (layer === 'satellite') {
    setTimeout(() => {
      pack
        .status()
        .then(s =>
          console.log(
            `[tiles] +6s ${courseId}/${layer} state=${s.state} pct=${s.percentage} req=${s.requiredResourceCount} done=${s.completedResourceCount} tiles=${s.completedTileCount}`,
          ),
        )
        .catch(err => console.log(`[tiles] +6s status ERR ${courseId}: ${err}`))
    }, 6000)
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
