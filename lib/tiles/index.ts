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
      maxzoom: 19,
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
export const satelliteStyleJSON = JSON.stringify(satelliteStyleSpec)

const MIN_ZOOM = 16
const MAX_ZOOM = 18
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

function packStateToLayerState(
  s: OfflinePackStatus['state'],
): Exclude<LayerState, 'error'> {
  if (s === 'complete') return 'complete'
  if (s === 'active') return 'downloading'
  return 'idle'
}

function onProgress(courseId: string, layer: LayerKind) {
  return (_pack: OfflinePack, status: OfflinePackStatus) => {
    setLayer(courseId, layer, {
      state: packStateToLayerState(status.state),
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
    setLayer(courseId, layer, {
      state: packStateToLayerState(status.state),
      percentage: status.percentage,
    })
    if (status.state === 'complete') return

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
  const mapStyle = layer === 'vector' ? vectorStyle : satelliteStyleJSON
  await OfflineManager.createPack(
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
    state: packStateToLayerState(st.state),
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
