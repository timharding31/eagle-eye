export type BBox = [west: number, south: number, east: number, north: number]
export type Position = [lng: number, lat: number]

export type GeoPolygon = { type: 'Polygon'; coordinates: Position[][] }
export type GeoPoint = { type: 'Point'; coordinates: Position }

export type Hazard = {
  type: 'water' | 'bunker' | 'ob'
  polygon: GeoPolygon
}

export type Hole = {
  num: number
  par: number
  green: GeoPolygon
  tee: GeoPoint
  fairway?: GeoPolygon
  hazards?: Hazard[]
}

export type Course = {
  id: string
  name: string
  source: 'bundled' | 'overpass' | 'ml'
  bounds: BBox
  holes: Hole[]
  metadata: { addedAt: number; osmId?: string }
}

// Data about a hole that OSM hinted at but couldn't fully assemble — used
// by the tap-to-fix flow to walk the player through providing greens.
export type MissingHole = {
  num: number
  par: number
  tee?: GeoPoint
  holeWay?: Position[]
}

export type NormalizeResult = {
  course: Course
  missing: MissingHole[]
}

export function isCourseValid(course: Course): boolean {
  if (course.holes.length === 0) return false
  return course.holes.every(h => h.green && h.tee)
}
