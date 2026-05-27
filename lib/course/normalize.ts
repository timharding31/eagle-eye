import type {
  Course,
  Hole,
  GeoPolygon,
  GeoPoint,
  Position,
  BBox,
  MissingHole,
  NormalizeResult,
} from './types'

export type OsmElement = {
  type: 'node' | 'way' | 'relation'
  id: number
  tags?: Record<string, string>
  nodes?: number[]
  lat?: number
  lon?: number
  geometry?: Array<{ lat: number; lon: number }>
  members?: Array<{
    type: string
    ref: number
    role: string
    geometry?: Array<{ lat: number; lon: number }>
  }>
}

export type OsmResult = {
  elements: OsmElement[]
}

type Candidate<T> = { ref: string | null; value: T; el: OsmElement }

export function normalize(
  osmId: string,
  osmResult: OsmResult,
  opts: { source?: Course['source'] } = {},
): NormalizeResult {
  const elements = osmResult.elements

  const nodeById = new Map<number, OsmElement>()
  for (const el of elements) {
    if (el.type === 'node' && el.lat != null && el.lon != null)
      nodeById.set(el.id, el)
  }

  const greens: Candidate<GeoPolygon>[] = []
  const tees: Candidate<GeoPoint>[] = []
  const holeWays: Candidate<Position[]>[] = []
  let courseName: string | undefined

  for (const el of elements) {
    const tag = el.tags?.golf
    const ref = el.tags?.ref ?? null

    if (el.tags?.leisure === 'golf_course') {
      courseName = el.tags?.name ?? courseName
    }

    if (el.type === 'way' && tag === 'green') {
      const poly = wayToPolygon(el, nodeById)
      if (poly) greens.push({ ref, value: poly, el })
    } else if (el.type === 'way' && (tag === 'tee' || tag === 'tee_box')) {
      const poly = wayToPolygon(el, nodeById)
      if (poly) {
        const c = ringCentroid(poly.coordinates[0])
        tees.push({ ref, value: { type: 'Point', coordinates: c }, el })
      }
    } else if (el.type === 'node' && tag === 'tee') {
      if (el.lat != null && el.lon != null) {
        tees.push({
          ref,
          value: { type: 'Point', coordinates: [el.lon, el.lat] },
          el,
        })
      }
    } else if (el.type === 'way' && tag === 'hole') {
      const line = wayToLine(el, nodeById)
      if (line && ref) holeWays.push({ ref, value: line, el })
    }
  }

  // Don't throw on missing greens — record them as missing-hole entries so
  // tap-to-fix can ask the player to provide green centres. We only throw
  // if there are zero usable hints at all (no greens AND no hole-ways);
  // there's nothing to walk through in that case.
  if (greens.length === 0 && holeWays.length === 0) {
    throw new Error(
      'No golf=green polygons or golf=hole ways found in OSM data — check tagging or relation membership',
    )
  }

  const refSet = new Set<string>()
  for (const arr of [greens, tees, holeWays]) {
    for (const c of arr) if (c.ref) refSet.add(c.ref)
  }
  const refs = [...refSet]
    .map(r => ({ raw: r, num: parseInt(r, 10) }))
    .filter(r => Number.isFinite(r.num) && r.num >= 1 && r.num <= 36)
    .sort((a, b) => a.num - b.num)
    .map(r => r.raw)

  const usedGreenIdx = new Set<number>()
  const usedTeeIdx = new Set<number>()

  function takeGreenByRef(ref: string): GeoPolygon | undefined {
    const idx = greens.findIndex(
      (g, i) => g.ref === ref && !usedGreenIdx.has(i),
    )
    if (idx === -1) return undefined
    usedGreenIdx.add(idx)
    return greens[idx].value
  }
  function takeTeeByRef(ref: string): GeoPoint | undefined {
    const idx = tees.findIndex((t, i) => t.ref === ref && !usedTeeIdx.has(i))
    if (idx === -1) return undefined
    usedTeeIdx.add(idx)
    return tees[idx].value
  }
  function takeNearestGreen(target: Position): GeoPolygon | undefined {
    let best = -1
    let bestD = Infinity
    for (let i = 0; i < greens.length; i++) {
      if (usedGreenIdx.has(i)) continue
      const c = ringCentroid(greens[i].value.coordinates[0])
      const d = haversineMeters(c, target)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    if (best === -1) return undefined
    usedGreenIdx.add(best)
    return greens[best].value
  }
  function takeNearestTee(target: Position): GeoPoint | undefined {
    let best = -1
    let bestD = Infinity
    for (let i = 0; i < tees.length; i++) {
      if (usedTeeIdx.has(i)) continue
      const d = haversineMeters(tees[i].value.coordinates, target)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    if (best === -1) return undefined
    usedTeeIdx.add(best)
    return tees[best].value
  }

  const holes: Hole[] = []
  const missing: MissingHole[] = []

  for (const ref of refs) {
    const num = parseInt(ref, 10)
    const holeWay = holeWays.find(h => h.ref === ref)

    let green = takeGreenByRef(ref)
    let tee = takeTeeByRef(ref)

    if ((!green || !tee) && holeWay) {
      const line = holeWay.value
      const start = line[0]
      const end = line[line.length - 1]
      if (!green) green = takeNearestGreen(end)
      if (!tee) tee = { type: 'Point', coordinates: start }
    }

    let par = 4
    const parStr =
      holeWay?.el.tags?.par ?? greens.find(g => g.ref === ref)?.el.tags?.par
    if (parStr) {
      const parsed = parseInt(parStr, 10)
      if (Number.isFinite(parsed) && parsed >= 3 && parsed <= 6) par = parsed
    }

    if (!green || !tee) {
      missing.push({ num, par, tee, holeWay: holeWay?.value })
      continue
    }
    holes.push({ num, par, green, tee })
  }

  // If hole bounds collapse (e.g. no holes assembled at all), fall back to
  // the union of every known feature so tap-to-fix has a viewport to frame.
  const bounds =
    holes.length > 0
      ? computeBoundsFromHoles(holes)
      : computeBoundsFromHints(greens, tees, holeWays)

  const course: Course = {
    id: `osm-${osmId}`,
    name: courseName ?? `Course ${osmId}`,
    source: opts.source ?? 'bundled',
    bounds,
    holes,
    metadata: { addedAt: Date.now(), osmId },
  }
  return { course, missing }
}

function wayToPolygon(
  way: OsmElement,
  nodeById: Map<number, OsmElement>,
): GeoPolygon | null {
  const coords = wayCoords(way, nodeById)
  if (!coords || coords.length < 3) return null
  const first = coords[0]
  const last = coords[coords.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) coords.push(first)
  if (coords.length < 4) return null
  return { type: 'Polygon', coordinates: [coords] }
}

function wayToLine(
  way: OsmElement,
  nodeById: Map<number, OsmElement>,
): Position[] | null {
  const coords = wayCoords(way, nodeById)
  if (!coords || coords.length < 2) return null
  return coords
}

function wayCoords(
  way: OsmElement,
  nodeById: Map<number, OsmElement>,
): Position[] | null {
  if (way.geometry?.length) {
    return way.geometry.map(p => [p.lon, p.lat] as Position)
  }
  if (!way.nodes) return null
  const out: Position[] = []
  for (const id of way.nodes) {
    const n = nodeById.get(id)
    if (!n || n.lat == null || n.lon == null) return null
    out.push([n.lon, n.lat])
  }
  return out
}

function ringCentroid(ring: Position[]): Position {
  let sx = 0
  let sy = 0
  const n = ring.length - 1 // ring is closed, skip duplicate
  for (let i = 0; i < n; i++) {
    sx += ring[i][0]
    sy += ring[i][1]
  }
  return [sx / n, sy / n]
}

function haversineMeters(a: Position, b: Position): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(s))
}

function computeBoundsFromHoles(holes: Hole[]): BBox {
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const h of holes) {
    for (const [lng, lat] of h.green.coordinates[0]) {
      if (lng < w) w = lng
      if (lng > e) e = lng
      if (lat < s) s = lat
      if (lat > n) n = lat
    }
    const [lng, lat] = h.tee.coordinates
    if (lng < w) w = lng
    if (lng > e) e = lng
    if (lat < s) s = lat
    if (lat > n) n = lat
  }
  return [w, s, e, n]
}

function computeBoundsFromHints(
  greens: Candidate<GeoPolygon>[],
  tees: Candidate<GeoPoint>[],
  holeWays: Candidate<Position[]>[],
): BBox {
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  const acc = ([lng, lat]: Position) => {
    if (lng < w) w = lng
    if (lng > e) e = lng
    if (lat < s) s = lat
    if (lat > n) n = lat
  }
  for (const g of greens) for (const p of g.value.coordinates[0]) acc(p)
  for (const t of tees) acc(t.value.coordinates)
  for (const h of holeWays) for (const p of h.value) acc(p)
  if (!Number.isFinite(w)) return [0, 0, 0, 0]
  return [w, s, e, n]
}
