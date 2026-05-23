/// <reference types="node" />
/**
 * build-course.ts
 *
 * Usage: npm run build:course -- <type/id> <slug>
 *   e.g. npm run build:course -- way/16650363 home
 *   e.g. npm run build:course -- relation/123456 home
 *   A bare id (no prefix) is treated as a relation.
 *
 * Fetches a golf course from Overpass, normalizes to the Course shape, and
 * writes courses/<slug>.json. Works for courses mapped as either a relation
 * (with members) or a single closed way (golf features inferred by area).
 */
import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'

import { normalize, type OsmResult } from '@/lib/course/normalize'
import { isCourseValid } from '@/lib/course/types'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const USER_AGENT = 'eagle-eye/0.1 (https://github.com/timharding/eagle-eye)'

const [, , rawTarget, slug] = process.argv
if (!rawTarget || !slug) {
  console.error('Usage: build-course.ts <type/id> <slug>')
  console.error('  e.g. build-course.ts way/16650363 home')
  console.error('  e.g. build-course.ts relation/123456 home')
  process.exit(1)
}
if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error(
    `Invalid slug: ${slug} (expected lowercase letters, digits, hyphens)`,
  )
  process.exit(1)
}

const targetMatch = rawTarget.match(/^(?:(way|relation)\/)?(\d+)$/)
if (!targetMatch) {
  console.error(
    `Invalid target: ${rawTarget} (expected <id> or way/<id> or relation/<id>)`,
  )
  process.exit(1)
}
const osmType = (targetMatch[1] ?? 'relation') as 'way' | 'relation'
const osmId = targetMatch[2]

const queryByType: Record<'way' | 'relation', string> = {
  // Relation: members + their dependencies recursively.
  relation: `[out:json][timeout:60];
relation(${osmId});
(._; >;);
out geom;`,
  // Way (course mapped as a single closed area): turn the way into an area,
  // collect all golf-tagged features inside it, then recurse to nodes.
  way: `[out:json][timeout:60];
way(${osmId});
map_to_area->.a;
(
  way(area.a)["golf"];
  node(area.a)["golf"];
  way(${osmId});
);
(._; >;);
out geom;`,
}

async function main() {
  const query = queryByType[osmType]
  console.log(`Fetching OSM ${osmType} ${osmId} from Overpass…`)
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: `data=${encodeURIComponent(query)}`,
  })

  if (!res.ok) {
    console.error(`Overpass HTTP ${res.status} ${res.statusText}`)
    const body = await res.text().catch(() => '')
    if (body) console.error(body.slice(0, 500))
    process.exit(1)
  }

  const osmResult = (await res.json()) as OsmResult & { remark?: string }
  if (osmResult.remark) {
    console.warn(`Overpass remark: ${osmResult.remark}`)
  }
  console.log(
    `Got ${osmResult.elements?.length ?? 0} OSM elements. Normalizing…`,
  )

  const course = normalize(osmId, osmResult)
  if (!isCourseValid(course)) {
    console.error(
      'Normalized course is invalid (missing green or tee on at least one hole).',
    )
    process.exit(1)
  }

  const outPath = resolve(process.cwd(), 'courses', `${slug}.json`)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(course, null, 2) + '\n')

  console.log(`Wrote ${outPath}`)
  console.log(`Course: "${course.name}" — ${course.holes.length} holes`)
  console.log(`Pars: ${course.holes.map(h => h.par).join(' ')}`)
  console.log(`Total par: ${course.holes.reduce((s, h) => s + h.par, 0)}`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
