import { default as distance } from '@turf/distance'
import { default as nearestPointOnLine } from '@turf/nearest-point-on-line'
import { default as turfCentroid } from '@turf/centroid'
import { default as booleanPointInPolygon } from '@turf/boolean-point-in-polygon'
import {
  point as turfPoint,
  lineString,
  polygon as turfPolygon,
} from '@turf/helpers'

import type { BBox, GeoPolygon } from '@/lib/course/types'

export type LatLng = { lat: number; lng: number }

function tp({ lat, lng }: LatLng) {
  return turfPoint([lng, lat])
}

function ll([lng, lat]: number[]): LatLng {
  return { lat, lng }
}

export function distanceMeters(a: LatLng, b: LatLng): number {
  return distance(tp(a), tp(b), { units: 'meters' })
}

export function nearestPointOnPolygon(here: LatLng, poly: GeoPolygon): LatLng {
  const ring = poly.coordinates[0]
  const line = lineString(ring)
  const result = nearestPointOnLine(line, tp(here), { units: 'meters' })
  return ll(result.geometry.coordinates)
}

export function farthestPointOnPolygon(here: LatLng, poly: GeoPolygon): LatLng {
  const ring = poly.coordinates[0]
  let bestIdx = 0
  let bestDist = -1
  for (let i = 0; i < ring.length; i++) {
    const [lng, lat] = ring[i]
    const d = distanceMeters(here, { lat, lng })
    if (d > bestDist) {
      bestDist = d
      bestIdx = i
    }
  }
  return ll(ring[bestIdx])
}

export function centroid(poly: GeoPolygon): LatLng {
  const c = turfCentroid(turfPolygon(poly.coordinates))
  return ll(c.geometry.coordinates)
}

export function pointInPolygon(pt: LatLng, poly: GeoPolygon): boolean {
  return booleanPointInPolygon(tp(pt), turfPolygon(poly.coordinates))
}

/**
 * Initial compass bearing from `a` to `b`, in degrees clockwise from true
 * north, in `[0, 360)`. Used to orient the hole-screen camera so the green
 * is "up" from the tee.
 */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const φ1 = toRad(a.lat)
  const φ2 = toRad(b.lat)
  const Δλ = toRad(b.lng - a.lng)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/**
 * Compute a Camera center + zoom + bearing that frames the supplied points
 * into the given viewport with the bearing direction pointing "up". Unlike
 * MapLibre's `fitBounds(bounds, { bearing })`, which fits the lat/lng-axis
 * bbox in *screen* space (leaving slack proportional to how off-cardinal
 * the bearing is), this projects points into the bearing-aligned frame
 * before sizing, so the long axis truly fills the available height.
 *
 * Pass any number of points to enclose (e.g. tee + green ring + fairway).
 * Bearing is computed once via `bearingDeg(tee, greenCentroid)` — the green
 * ends up at the top of the screen and the tee at the bottom.
 */
export function frameForHole(args: {
  tee: LatLng
  greenCentroid: LatLng
  points: LatLng[]
  viewport: { width: number; height: number }
  padding: { top: number; right: number; bottom: number; left: number }
}): { center: LatLng; zoom: number; bearing: number } {
  const { tee, greenCentroid, points, viewport, padding } = args
  const bearing = bearingDeg(tee, greenCentroid)

  // Local equirectangular projection — meters relative to the tee.
  const latRad = (tee.lat * Math.PI) / 180
  const mPerLat = 110540
  const mPerLng = 111320 * Math.cos(latRad)

  // Rotate by -bearing so "forward" (along tee→green) is +y and "side" is +x.
  const θ = (bearing * Math.PI) / 180
  const sinθ = Math.sin(θ)
  const cosθ = Math.cos(θ)

  let minF = Infinity
  let maxF = -Infinity
  let minS = Infinity
  let maxS = -Infinity
  for (const p of points) {
    const dy = (p.lat - tee.lat) * mPerLat
    const dx = (p.lng - tee.lng) * mPerLng
    const forward = dy * cosθ + dx * sinθ
    const side = dx * cosθ - dy * sinθ
    if (forward < minF) minF = forward
    if (forward > maxF) maxF = forward
    if (side < minS) minS = side
    if (side > maxS) maxS = side
  }

  const forwardExtent = Math.max(1, maxF - minF)
  const sideExtent = Math.max(1, maxS - minS)
  const availW = Math.max(1, viewport.width - padding.left - padding.right)
  const availH = Math.max(1, viewport.height - padding.top - padding.bottom)

  // Choose the limiting axis.
  const mPerPx = Math.max(forwardExtent / availH, sideExtent / availW)

  // Center of the bearing-aligned bbox, then bias by asymmetric padding so
  // the visual midpoint of the framed area matches the bbox center.
  // With bearing=bearingDeg(tee,green), green is up on screen and tee is
  // down. Big top padding (e.g. a TopBar) means the visible area is in the
  // lower half of the viewport, so the bbox should appear BELOW the
  // viewport center — which means the camera target must be shifted UP
  // (toward the green, +forward). Symmetric reasoning for the side bias.
  const padBiasForwardPx = (padding.top - padding.bottom) / 2
  const padBiasSidePx = (padding.right - padding.left) / 2
  const centerForward = (maxF + minF) / 2 + padBiasForwardPx * mPerPx
  const centerSide = (maxS + minS) / 2 + padBiasSidePx * mPerPx

  // Un-rotate back to north/east meters, then to lat/lng.
  const centerDy = centerForward * cosθ - centerSide * sinθ
  const centerDx = centerForward * sinθ + centerSide * cosθ
  const center: LatLng = {
    lat: tee.lat + centerDy / mPerLat,
    lng: tee.lng + centerDx / mPerLng,
  }

  // Web Mercator zoom from meters-per-pixel at this latitude.
  const zoom = Math.log2((156543.03392 * Math.cos(latRad)) / mPerPx)

  return { center, zoom, bearing }
}

/**
 * Ground resolution — metres per screen pixel — for a Web-Mercator zoom
 * level at the given latitude. Inverse of the zoom formula in
 * `frameForHole`; use it to turn a pixel span (e.g. the map's on-screen
 * width) back into metres on the ground.
 */
export function metersPerPixel(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180
  return (156543.03392 * Math.cos(latRad)) / Math.pow(2, zoom)
}

/**
 * Initial Landing Zone positions along the straight tee→green-centroid
 * line. Each entry in `fractions` is a value in `[0, 1]` interpreted as
 * "this far from tee toward green centroid" — e.g. `[1/3, 2/3]` for a par 5
 * places LZ1 a third of the way out and LZ2 two-thirds. Pass `[]` (par 3)
 * or `[1/3]` (par 4) for fewer waypoints. The caller owns the fractions so
 * the screen-level knob actually drives behaviour.
 *
 * Pure linear interpolation in lat/lng space — good enough at hole scale
 * (≤ ~600 m); great-circle deviation is well under a metre.
 */
export function lzInitPositions(
  tee: LatLng,
  greenCentroid: LatLng,
  fractions: readonly number[],
): LatLng[] {
  return fractions.map(f => ({
    lat: tee.lat + (greenCentroid.lat - tee.lat) * f,
    lng: tee.lng + (greenCentroid.lng - tee.lng) * f,
  }))
}

/**
 * Scalar projection of `p` onto the segment `a→b`, as a fraction of the
 * segment length: 0 = at `a`, 1 = at `b`, <0 = behind `a`, >1 = past `b`.
 * Lateral offset is discarded — this answers "how far along the tee→green
 * line am I", not "how close to the line". Uses a local equirectangular
 * projection relative to `a` (great-circle deviation is sub-metre at hole
 * scale). Returns 0 for a degenerate (zero-length) segment.
 */
export function projectionFraction(p: LatLng, a: LatLng, b: LatLng): number {
  const latRad = (a.lat * Math.PI) / 180
  const mPerLat = 110540
  const mPerLng = 111320 * Math.cos(latRad)
  const abx = (b.lng - a.lng) * mPerLng
  const aby = (b.lat - a.lat) * mPerLat
  const apx = (p.lng - a.lng) * mPerLng
  const apy = (p.lat - a.lat) * mPerLat
  const denom = abx * abx + aby * aby
  if (denom === 0) return 0
  return (apx * abx + apy * aby) / denom
}

/**
 * Axis-aligned bounding box covering the supplied points, in the
 * `[west, south, east, north]` BBox shape used elsewhere in the app.
 * Throws on empty input — callers should always have at least the tee +
 * green vertices.
 */
export function bboxOf(points: LatLng[]): BBox {
  if (points.length === 0) {
    throw new Error('bboxOf: at least one point required')
  }
  let w = points[0].lng
  let e = points[0].lng
  let s = points[0].lat
  let n = points[0].lat
  for (let i = 1; i < points.length; i++) {
    const p = points[i]
    if (p.lng < w) w = p.lng
    if (p.lng > e) e = p.lng
    if (p.lat < s) s = p.lat
    if (p.lat > n) n = p.lat
  }
  return [w, s, e, n]
}

/**
 * Clamp a point into the hole's Landing-Zone planning envelope, expressed in
 * the bearing-aligned frame (forward = tee→green-centroid, side = lateral on
 * screen — the same projection `frameForHole` uses).
 *
 * The forward axis is bounded by `points`' forward extent (tee + green ring +
 * fairway) so an LZ stays between the tee and the green. The side axis is
 * bounded by ± `sideHalfWidth` metres, centred on the tee→green line — pass
 * half the visible map width so lateral reach matches the phone screen rather
 * than the (frequently missing-from-OSM) fairway polygon. A generous `Infinity`
 * disables the lateral clamp entirely.
 */
export function clampToHoleEnvelope(args: {
  point: LatLng
  tee: LatLng
  greenCentroid: LatLng
  points: LatLng[]
  sideHalfWidth: number
}): LatLng {
  const { point, tee, greenCentroid, points, sideHalfWidth } = args
  const bearing = bearingDeg(tee, greenCentroid)

  // Local equirectangular projection — metres relative to the tee.
  const latRad = (tee.lat * Math.PI) / 180
  const mPerLat = 110540
  const mPerLng = 111320 * Math.cos(latRad)

  // Rotate by -bearing so "forward" (tee→green) is +y and "side" is +x.
  const θ = (bearing * Math.PI) / 180
  const sinθ = Math.sin(θ)
  const cosθ = Math.cos(θ)

  const project = (p: LatLng) => {
    const dy = (p.lat - tee.lat) * mPerLat
    const dx = (p.lng - tee.lng) * mPerLng
    return {
      forward: dy * cosθ + dx * sinθ,
      side: dx * cosθ - dy * sinθ,
    }
  }

  let minF = Infinity
  let maxF = -Infinity
  for (const p of points) {
    const f = project(p).forward
    if (f < minF) minF = f
    if (f > maxF) maxF = f
  }

  const { forward, side } = project(point)
  const clampedForward = Math.max(minF, Math.min(maxF, forward))
  const clampedSide = Math.max(-sideHalfWidth, Math.min(sideHalfWidth, side))

  // Un-rotate back to north/east metres, then to lat/lng.
  const dy = clampedForward * cosθ - clampedSide * sinθ
  const dx = clampedForward * sinθ + clampedSide * cosθ
  return {
    lat: tee.lat + dy / mPerLat,
    lng: tee.lng + dx / mPerLng,
  }
}
