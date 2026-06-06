import { and, eq } from 'drizzle-orm'
import { create } from 'zustand'

import { db } from '@/db'
import presidioCourse from '@/courses/presidio.json'
import crystalSpringsCourse from '@/courses/crystal-springs.json'
import hardingParkCourse from '@/courses/harding-park.json'
import lincolnParkCourse from '@/courses/lincoln-park.json'
import peacockGapCourse from '@/courses/peacock-gap.json'

import { normalize, type OsmResult } from './normalize'
import { courses as coursesTable, teeOverrides } from './schema'
import type { BBox, Course, GeoPolygon, MissingHole, Position } from './types'

export type {
  Course,
  Hole,
  GeoPolygon,
  GeoPoint,
  BBox,
  Hazard,
  Position,
  MissingHole,
  NormalizeResult,
} from './types'
export { isCourseValid } from './types'

export type CourseSource = Course['source']

export type CourseSummary = {
  slug: string
  name: string
  bounds: BBox
  source: CourseSource
  holeCount: number
}

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const USER_AGENT = 'eagle-eye/0.1 (https://github.com/timharding/eagle-eye)'

// Bundled courses ship inside the APK. The registry key is the slug
// stored on `rounds.course_id`; the Course.id field is just metadata.
const BUNDLED_REGISTRY: Record<string, Course> = {
  presidio: presidioCourse as Course,
  'harding-park': hardingParkCourse as Course,
  'crystal-springs': crystalSpringsCourse as Course,
  'lincoln-park': lincolnParkCourse as Course,
  'peacock-gap': peacockGapCourse as Course,
}

export async function loadBundledCourse(slug: string): Promise<Course> {
  const course = BUNDLED_REGISTRY[slug]
  if (!course) throw new Error(`Unknown bundled course: ${slug}`)
  return course
}

export function listBundledCourses(): CourseSummary[] {
  return Object.entries(BUNDLED_REGISTRY).map(([slug, c]) => ({
    slug,
    name: c.name,
    bounds: c.bounds,
    source: c.source,
    holeCount: c.holes.length,
  }))
}

export async function loadInstalledCourse(id: string): Promise<Course> {
  const [row] = await db
    .select()
    .from(coursesTable)
    .where(eq(coursesTable.id, id))
    .limit(1)
  if (!row) throw new Error(`Unknown installed course: ${id}`)
  return JSON.parse(row.rawDataBlob) as Course
}

/**
 * Load a Course by its slug from either the bundled registry or SQLite,
 * with any per-course tee corrections layered on top (see
 * `setTeeOverride`). The overlay is the reason callers should always go
 * through `loadCourse` rather than `loadBundledCourse`/`loadInstalledCourse`
 * directly — those return the raw, un-corrected data.
 */
export async function loadCourse(slug: string): Promise<Course> {
  const base =
    slug in BUNDLED_REGISTRY
      ? await loadBundledCourse(slug)
      : await loadInstalledCourse(slug)
  return applyTeeOverrides(slug, base)
}

/**
 * Record (or replace) a corrected tee position for one hole of a course.
 * Persisted per-course so it survives across rounds. Idempotent — the PK
 * is (course_id, hole_num), so re-setting overwrites. `courseId` is the
 * slug stored on `rounds.course_id`.
 */
export async function setTeeOverride(
  courseId: string,
  holeNum: number,
  pos: { lat: number; lng: number },
): Promise<void> {
  const row = {
    courseId,
    holeNum,
    lat: pos.lat,
    lng: pos.lng,
    setAt: Date.now(),
  }
  await db
    .insert(teeOverrides)
    .values(row)
    .onConflictDoUpdate({
      target: [teeOverrides.courseId, teeOverrides.holeNum],
      set: { lat: row.lat, lng: row.lng, setAt: row.setAt },
    })
}

/**
 * Read the stored tee correction for one hole, or null when the hole still
 * uses its source (OSM/bundled) tee. Lets callers reflect whether a
 * correction is active without diffing coordinates.
 */
export async function getTeeOverride(
  courseId: string,
  holeNum: number,
): Promise<{ lat: number; lng: number; setAt: number } | null> {
  const [row] = await db
    .select()
    .from(teeOverrides)
    .where(
      and(
        eq(teeOverrides.courseId, courseId),
        eq(teeOverrides.holeNum, holeNum),
      ),
    )
    .limit(1)
  return row ? { lat: row.lat, lng: row.lng, setAt: row.setAt } : null
}

/**
 * Remove a hole's tee correction, restoring its source (OSM/bundled) tee on
 * the next loadCourse. The inverse of setTeeOverride and a no-op when none
 * exists — the recovery path for an errant correction.
 */
export async function clearTeeOverride(
  courseId: string,
  holeNum: number,
): Promise<void> {
  await db
    .delete(teeOverrides)
    .where(
      and(
        eq(teeOverrides.courseId, courseId),
        eq(teeOverrides.holeNum, holeNum),
      ),
    )
}

/**
 * Return a copy of `course` with any stored tee overrides applied. When no
 * overrides exist the original reference is returned unchanged (so the
 * bundled-registry object is never mutated); otherwise only the corrected
 * holes are cloned.
 */
async function applyTeeOverrides(
  courseId: string,
  course: Course,
): Promise<Course> {
  const rows = await db
    .select()
    .from(teeOverrides)
    .where(eq(teeOverrides.courseId, courseId))
  if (rows.length === 0) return course
  const byHole = new Map(rows.map(r => [r.holeNum, r]))
  const holes = course.holes.map(h => {
    const o = byHole.get(h.num)
    if (!o) return h
    return {
      ...h,
      tee: { type: 'Point' as const, coordinates: [o.lng, o.lat] as Position },
    }
  })
  return { ...course, holes }
}

export async function listInstalledCourses(): Promise<CourseSummary[]> {
  const rows = await db.select().from(coursesTable)
  return rows.map(r => ({
    slug: r.id,
    name: r.name,
    bounds: JSON.parse(r.bounds) as BBox,
    source: r.source,
    holeCount: (JSON.parse(r.rawDataBlob) as Course).holes.length,
  }))
}

export async function listAllCourses(): Promise<CourseSummary[]> {
  const installed = await listInstalledCourses()
  return [...listBundledCourses(), ...installed]
}

// ---------------------------------------------------------------------------
// Overpass adapter: discovery (findNearby) + fetch
// (fetchCourseFromOverpass). Per ADR-003, this is the second adapter onto
// `normalize()` — `lib/course` graduates from a hypothetical to a real
// seam now that there are two production callers feeding the same Course
// shape.
// ---------------------------------------------------------------------------

export type NearbyCourse = {
  osmType: 'way' | 'relation'
  osmId: string
  name: string
  distanceM: number
  center: { lat: number; lng: number }
}

type OverpassNearbyResponse = {
  elements: {
    type: 'way' | 'relation' | 'node'
    id: number
    tags?: Record<string, string>
    center?: { lat: number; lon: number }
    bounds?: {
      minlat: number
      minlon: number
      maxlat: number
      maxlon: number
    }
  }[]
}

/**
 * Overpass query for `leisure=golf_course` ways and relations within
 * `radiusKm` of `here`. Results are sorted nearest-first.
 * Throws on network or HTTP failure. Per ADR-007 this is the only
 * course-discovery flow.
 */
export async function findNearby(
  here: { lat: number; lng: number },
  radiusKm: number,
): Promise<NearbyCourse[]> {
  const radiusM = Math.round(radiusKm * 1000)
  const query = `[out:json][timeout:30];
(
  way["leisure"="golf_course"](around:${radiusM},${here.lat},${here.lng});
  relation["leisure"="golf_course"](around:${radiusM},${here.lat},${here.lng});
);
out center tags bb;`

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: `data=${encodeURIComponent(query)}`,
  })
  if (!res.ok) {
    throw new Error(`Overpass HTTP ${res.status} ${res.statusText}`)
  }
  const json = (await res.json()) as OverpassNearbyResponse

  const out: NearbyCourse[] = []
  for (const el of json.elements) {
    if (el.type !== 'way' && el.type !== 'relation') continue
    const name = el.tags?.name ?? `Unnamed (${el.type} ${el.id})`
    const center =
      el.center != null
        ? { lat: el.center.lat, lng: el.center.lon }
        : el.bounds != null
          ? {
              lat: (el.bounds.minlat + el.bounds.maxlat) / 2,
              lng: (el.bounds.minlon + el.bounds.maxlon) / 2,
            }
          : null
    if (!center) continue
    out.push({
      osmType: el.type,
      osmId: String(el.id),
      name,
      distanceM: haversineMeters(here, center),
      center,
    })
  }
  out.sort((a, b) => a.distanceM - b.distanceM)
  return out
}

const FETCH_QUERY_BY_TYPE: Record<'way' | 'relation', (id: string) => string> =
  {
    // Relation: members + golf features within the relation's area.
    // OSM-tagged courses split roughly into "outer way is the whole
    // course" and "relation groups all the features"; we pull both for
    // robustness.
    relation: id => `[out:json][timeout:60];
relation(${id});
map_to_area->.a;
(
  way(area.a)["golf"];
  node(area.a)["golf"];
  relation(${id});
);
(._; >;);
out geom;`,
    way: id => `[out:json][timeout:60];
way(${id});
map_to_area->.a;
(
  way(area.a)["golf"];
  node(area.a)["golf"];
  way(${id});
);
(._; >;);
out geom;`,
  }

/**
 * Fetch a course from Overpass and normalize it. Returns the (possibly
 * partial) Course plus a list of holes that need a green polygon supplied
 * via the tap-to-fix flow before the course is `installCourse`-able.
 */
export async function fetchCourseFromOverpass(
  osmType: 'way' | 'relation',
  osmId: string,
): Promise<{ course: Course; missing: MissingHole[] }> {
  const query = FETCH_QUERY_BY_TYPE[osmType](osmId)
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: `data=${encodeURIComponent(query)}`,
  })
  if (!res.ok) {
    throw new Error(`Overpass HTTP ${res.status} ${res.statusText}`)
  }
  const osmResult = (await res.json()) as OsmResult
  // Encode the OSM type into the id so a way and a relation that share a
  // numeric id can both install without colliding on the courses PK.
  return normalize(`${osmType}-${osmId}`, osmResult, { source: 'overpass' })
}

/**
 * Persist a Course (typically the output of fetchCourseFromOverpass +
 * tap-to-fix) into SQLite so it can be played offline. Idempotent — the
 * primary key is course.id, re-installs overwrite.
 */
export async function installCourse(course: Course): Promise<void> {
  await db
    .insert(coursesTable)
    .values({
      id: course.id,
      name: course.name,
      source: course.source,
      rawDataBlob: JSON.stringify(course),
      bounds: JSON.stringify(course.bounds),
      addedAt: course.metadata.addedAt,
    })
    .onConflictDoUpdate({
      target: coursesTable.id,
      set: {
        name: course.name,
        source: course.source,
        rawDataBlob: JSON.stringify(course),
        bounds: JSON.stringify(course.bounds),
        addedAt: course.metadata.addedAt,
      },
    })
}

export async function removeInstalledCourse(id: string): Promise<void> {
  await db.delete(coursesTable).where(eq(coursesTable.id, id))
}

// ---------------------------------------------------------------------------
// Tap-to-fix: synthesize green polygons from user-provided centres so a
// partial Course can be completed in-app.
// ---------------------------------------------------------------------------

const SYNTHESIZED_GREEN_RADIUS_M = 9 // typical green ≈ 5-15 m radius

/**
 * Apply a `holeNum -> green centre` map of fixes to a partial Course +
 * its missing-hole list. For each fix we synthesize a small circular
 * green polygon (~9 m radius). Returns the updated course/missing pair
 * so the screen drives off a single source of truth.
 */
export function applyMissingFixes(
  course: Course,
  missing: MissingHole[],
  fixes: Record<number, { lat: number; lng: number }>,
): { course: Course; missing: MissingHole[] } {
  const newHoles = [...course.holes]
  const newMissing: MissingHole[] = []
  for (const m of missing) {
    const fix = fixes[m.num]
    if (!fix) {
      newMissing.push(m)
      continue
    }
    const green = circularPolygon(fix, SYNTHESIZED_GREEN_RADIUS_M)
    const tee = m.tee ?? {
      // No holeWay → use the green centre as a placeholder tee. Distances
      // will collapse to ~0 from the tee, but the hole still renders;
      // a future flow can collect tees explicitly.
      type: 'Point' as const,
      coordinates: [fix.lng, fix.lat] as Position,
    }
    newHoles.push({ num: m.num, par: m.par, green, tee })
  }
  newHoles.sort((a, b) => a.num - b.num)

  const bounds = unionBounds(course.bounds, newHoles)
  return {
    course: { ...course, holes: newHoles, bounds },
    missing: newMissing,
  }
}

function circularPolygon(
  center: { lat: number; lng: number },
  radiusM: number,
): GeoPolygon {
  const points = 16
  const latRad = (center.lat * Math.PI) / 180
  const mPerLat = 110540
  const mPerLng = 111320 * Math.cos(latRad)
  const ring: Position[] = []
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * 2 * Math.PI
    const dy = Math.cos(angle) * radiusM
    const dx = Math.sin(angle) * radiusM
    ring.push([center.lng + dx / mPerLng, center.lat + dy / mPerLat])
  }
  ring.push(ring[0])
  return { type: 'Polygon', coordinates: [ring] }
}

function unionBounds(existing: BBox, holes: Course['holes']): BBox {
  let [w, s, e, n] = existing
  if (!Number.isFinite(w) || (w === 0 && s === 0 && e === 0 && n === 0)) {
    w = Infinity
    s = Infinity
    e = -Infinity
    n = -Infinity
  }
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

// ---------------------------------------------------------------------------
// Pending-install store: holds the in-progress Course + missing list while
// the player walks through tap-to-fix. Ephemeral — not persisted until
// the player confirms and we call `installCourse`.
// ---------------------------------------------------------------------------

type PendingInstall = {
  course: Course
  missing: MissingHole[]
  /** Pre-resolved name + nearby distance from Find Nearby, for display. */
  hint?: { name: string; distanceM: number }
} | null

type PendingStore = { pending: PendingInstall }

const pendingStore = create<PendingStore>(() => ({ pending: null }))

export function setPendingInstall(p: PendingInstall): void {
  pendingStore.setState({ pending: p })
}

export function getPendingInstall(): PendingInstall {
  return pendingStore.getState().pending
}

export function clearPendingInstall(): void {
  pendingStore.setState({ pending: null })
}

export function usePendingInstall(): PendingInstall {
  return pendingStore(s => s.pending)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(s))
}
