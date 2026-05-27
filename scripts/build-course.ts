/// <reference types="node" />
/**
 * build-course.ts
 *
 * Usage: npm run build:course -- <type/id> <slug> [--force]
 *   e.g. npm run build:course -- way/16650363 home
 *   e.g. npm run build:course -- relation/123456 home
 *   A bare id (no prefix) is treated as a relation.
 *   --force  write JSON even if some holes are missing tee/green data
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

const args = process.argv.slice(2)
const force = args.includes('--force')
const [rawTarget, slug] = args.filter(a => !a.startsWith('--'))
if (!rawTarget || !slug) {
  console.error('Usage: build-course.ts <type/id> <slug> [--force]')
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
  // Relation: members + golf features within the relation's area.
  // OSM-tagged courses split roughly into "outer way is the whole course"
  // and "relation groups all the features"; we pull both for robustness.
  relation: `[out:json][timeout:60];
relation(${osmId});
map_to_area->.a;
(
  way(area.a)["golf"];
  node(area.a)["golf"];
  relation(${osmId});
);
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

  const { course, missing } = normalize(osmId, osmResult)
  if (missing.length > 0) {
    const nums = missing.map(m => m.num).join(', ')
    if (force) {
      console.warn(
        `Warning: missing data for ${missing.length} hole(s): ${nums}. Writing anyway (--force).`,
      )
    } else {
      console.error(
        `Normalized course is incomplete — missing data for ${missing.length} hole(s): ${nums}.`,
      )
      console.error(
        'Use --force to write anyway, or the in-app Find Nearby + tap-to-fix flow.',
      )
      process.exit(1)
    }
  }
  if (!isCourseValid(course)) {
    if (force) {
      console.warn(
        'Warning: course has holes with missing green or tee. Writing anyway (--force).',
      )
    } else {
      console.error(
        'Normalized course is invalid (missing green or tee on at least one hole).',
      )
      process.exit(1)
    }
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
