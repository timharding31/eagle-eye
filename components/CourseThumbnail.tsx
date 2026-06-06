import { Fragment, memo, useEffect, useState } from 'react'
import { StyleSheet, ViewStyle } from 'react-native'
import Svg, { Circle, Line } from 'react-native-svg'

import { loadCourse, type Course } from '@/lib/course'
import { centroid, type LatLng } from '@/lib/geo'
import { colors, radius } from '@/lib/theme'
import { GlassSurface } from './GlassSurface'

// A real per-Course routing mini-diagram: a faint gold Tee→Green segment for
// each Hole, with a cream Tee dot and a green Green ring. Derived from the
// loaded Course geometry (not faked), normalized into the thumbnail box with a
// local equirectangular projection so the routing isn't squashed by longitude.
//
// Loads the Course by slug (cheap — bundled JSON or one SQLite read) and caches
// it module-wide, since this renders in every course-list row. The drawn
// geometry is memoized per Course id.

const VIEW = 100 // square viewBox units
const PAD = 12

type Projected = {
  tee: { x: number; y: number }
  green: { x: number; y: number }
}

// Module-level cache so the list doesn't reload/reproject a Course per render.
const projectionCache = new Map<string, Projected[]>()

function projectCourse(course: Course): Projected[] {
  const cached = projectionCache.get(course.id)
  if (cached) return cached

  // Tee point + Green centroid per Hole, in LatLng (convert from GeoJSON
  // [lng,lat] right here at the geo boundary, per CLAUDE.md).
  const holes = course.holes.map(h => {
    const tee: LatLng = {
      lat: h.tee.coordinates[1],
      lng: h.tee.coordinates[0],
    }
    return { tee, green: centroid(h.green) }
  })
  if (holes.length === 0) {
    projectionCache.set(course.id, [])
    return []
  }

  const all = holes.flatMap(h => [h.tee, h.green])
  let w = Infinity
  let e = -Infinity
  let s = Infinity
  let n = -Infinity
  for (const p of all) {
    if (p.lng < w) w = p.lng
    if (p.lng > e) e = p.lng
    if (p.lat < s) s = p.lat
    if (p.lat > n) n = p.lat
  }
  const latMid = (s + n) / 2
  const mPerLat = 110540
  const mPerLng = 111320 * Math.cos((latMid * Math.PI) / 180)
  const spanX = Math.max(1, (e - w) * mPerLng)
  const spanY = Math.max(1, (n - s) * mPerLat)
  const avail = VIEW - 2 * PAD
  const scale = Math.min(avail / spanX, avail / spanY)
  // Center the drawn extent within the box.
  const offX = (VIEW - spanX * scale) / 2
  const offY = (VIEW - spanY * scale) / 2

  const toXY = (p: LatLng) => ({
    x: offX + (p.lng - w) * mPerLng * scale,
    // Flip Y: screen grows downward, latitude grows upward.
    y: offY + (n - p.lat) * mPerLat * scale,
  })

  const projected = holes.map(h => ({ tee: toXY(h.tee), green: toXY(h.green) }))
  projectionCache.set(course.id, projected)
  return projected
}

function CourseThumbnailImpl({
  slug,
  size = 58,
  style,
}: {
  slug: string
  size?: number
  style?: ViewStyle
}) {
  const [holes, setHoles] = useState<Projected[] | null>(null)

  useEffect(() => {
    let cancelled = false
    loadCourse(slug)
      .then(course => {
        if (!cancelled) setHoles(projectCourse(course))
      })
      .catch(() => {
        if (!cancelled) setHoles([])
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  return (
    <GlassSurface
      style={[styles.box, { width: size, height: size }]}
      // blur={false}
    >
      {holes && holes.length > 0 ? (
        <Svg width={size} height={size} viewBox={`0 0 ${VIEW} ${VIEW}`}>
          {holes.map((h, i) => (
            <Fragment key={`h${i}`}>
              <Line
                x1={h.tee.x}
                y1={h.tee.y}
                x2={h.green.x}
                y2={h.green.y}
                stroke={colors.fairwayGreen}
                strokeOpacity={0.55}
                strokeWidth={3.2}
                strokeLinecap="round"
              />
              <Circle
                cx={h.green.x}
                cy={h.green.y}
                r={3.2}
                stroke={colors.onSurface}
                fill={colors.fairwayBright}
                strokeWidth={0.6}
              />
              <Circle cx={h.tee.x} cy={h.tee.y} r={1.2} fill={colors.primary} />
            </Fragment>
          ))}
        </Svg>
      ) : null}
    </GlassSurface>
  )
}

export const CourseThumbnail = memo(CourseThumbnailImpl)

const styles = StyleSheet.create({
  box: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 0,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
