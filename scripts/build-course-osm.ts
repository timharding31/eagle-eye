/// <reference types="node" />
/**
 * build-course-osm.ts
 *
 * Usage: npx tsx scripts/build-course-osm.ts <relation/id|way/id|id> <slug>
 *   e.g. npx tsx scripts/build-course-osm.ts relation/2142043 lincoln-park
 *
 * Overpass-free sibling of build-course.ts. Pulls the same raw OSM elements
 * straight from the OSM API (api.openstreetmap.org) instead of Overpass, for
 * when the Overpass mirrors are timing out. It feeds the identical
 * `normalize()` so the output Course is shape-for-shape the same.
 *
 * How it gets the golf features without Overpass's area query: fetch the
 * relation/way to compute the course bbox, then pull every element in that
 * bbox via the OSM `map` endpoint. `normalize()` already supports the OSM-API
 * way shape (`nodes[]` + separate node elements), not just Overpass `out geom`.
 *
 * Preserves the existing courses/<slug>.json `name` and `metadata.addedAt`
 * when present, so a rebuild doesn't clobber a hand-set name (e.g. "Stinkin'
 * Lincoln") or churn the timestamp — the diff stays scoped to real hole data.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'

import { normalize, type OsmResult } from '@/lib/course/normalize'
import { isCourseValid, type Course } from '@/lib/course/types'

const OSM_API = 'https://api.openstreetmap.org/api/0.6'
const USER_AGENT = 'eagle-eye/0.1 (https://github.com/timharding/eagle-eye)'

const args = process.argv.slice(2)
const [rawTarget, slug] = args.filter(a => !a.startsWith('--'))
if (!rawTarget || !slug) {
  console.error('Usage: build-course-osm.ts <relation/id|way/id|id> <slug>')
  process.exit(1)
}
if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error(`Invalid slug: ${slug}`)
  process.exit(1)
}
const m = rawTarget.match(/^(?:(way|relation)\/)?(\d+)$/)
if (!m) {
  console.error(
    `Invalid target: ${rawTarget} (expected <id>|way/<id>|relation/<id>)`,
  )
  process.exit(1)
}
const osmType = (m[1] ?? 'relation') as 'way' | 'relation'
const osmId = m[2]

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok)
    throw new Error(`OSM API HTTP ${res.status} ${res.statusText} for ${url}`)
  return (await res.json()) as T
}

type Bbox = { w: number; s: number; e: number; n: number }

function bboxOfNodes(
  elements: { type: string; lat?: number; lon?: number }[],
): Bbox {
  let w = 180,
    s = 90,
    e = -180,
    n = -90
  for (const el of elements) {
    if (el.type !== 'node' || el.lat == null || el.lon == null) continue
    if (el.lon < w) w = el.lon
    if (el.lon > e) e = el.lon
    if (el.lat < s) s = el.lat
    if (el.lat > n) n = el.lat
  }
  return { w, s, e, n }
}

async function main() {
  console.log(`Fetching OSM ${osmType} ${osmId} from OSM API…`)
  const full = await getJson<OsmResult>(
    `${OSM_API}/${osmType}/${osmId}/full.json`,
  )
  const { w, s, e, n } = bboxOfNodes(full.elements as never)
  if (!Number.isFinite(w)) {
    console.error('Could not derive a bbox from the relation/way geometry.')
    process.exit(1)
  }
  // Tiny pad so features touching the boundary aren't clipped.
  const pad = 0.0005
  const bbox = `${w - pad},${s - pad},${e + pad},${n + pad}`
  console.log(`Course bbox ${bbox} — fetching area features…`)
  const map = await getJson<OsmResult>(`${OSM_API}/map.json?bbox=${bbox}`)
  console.log(`Got ${map.elements?.length ?? 0} OSM elements. Normalizing…`)

  const { course, missing } = normalize(osmId, map)
  if (missing.length > 0) {
    console.error(
      `Incomplete — missing data for ${missing.length} hole(s): ${missing.map(x => x.num).join(', ')}.`,
    )
    process.exit(1)
  }
  if (!isCourseValid(course)) {
    console.error(
      'Normalized course is invalid (missing green or tee on a hole).',
    )
    process.exit(1)
  }

  // Carry over a hand-set name + the original addedAt from the existing JSON.
  const outPath = resolve(process.cwd(), 'courses', `${slug}.json`)
  if (existsSync(outPath)) {
    const prev = JSON.parse(readFileSync(outPath, 'utf8')) as Course
    course.name = prev.name
    course.metadata.addedAt = prev.metadata.addedAt
    console.log(`Preserved name "${prev.name}" and addedAt from existing JSON.`)
  }

  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(course, null, 2) + '\n')
  console.log(`Wrote ${outPath}`)
  console.log(`Course: "${course.name}" — ${course.holes.length} holes`)
  console.log(`Pars: ${course.holes.map(h => h.par).join(' ')}`)
  console.log(`Total par: ${course.holes.reduce((a, h) => a + h.par, 0)}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
