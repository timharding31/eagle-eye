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

export function isCourseValid(course: Course): boolean {
  return course.holes.every(h => h.green && h.tee)
}
