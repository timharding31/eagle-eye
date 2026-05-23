import type { Course } from './types'

import homeCourse from '@/courses/home.json'

export type {
  Course,
  Hole,
  GeoPolygon,
  GeoPoint,
  BBox,
  Hazard,
  Position,
} from './types'
export { isCourseValid } from './types'

export type CourseSummary = {
  slug: string
  name: string
  bounds: import('./types').BBox
}

const REGISTRY: Record<string, Course> = {
  home: homeCourse as Course,
}

export async function loadBundledCourse(slug: string): Promise<Course> {
  const course = REGISTRY[slug]
  if (!course) throw new Error(`Unknown bundled course: ${slug}`)
  return course
}

export function listBundledCourses(): CourseSummary[] {
  return Object.entries(REGISTRY).map(([slug, c]) => ({
    slug,
    name: c.name,
    bounds: c.bounds,
  }))
}

export function loadInstalledCourse(_id: string): Promise<Course> {
  throw new Error('not implemented — Phase 2')
}
