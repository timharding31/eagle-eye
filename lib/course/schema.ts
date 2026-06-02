import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
} from 'drizzle-orm/sqlite-core'

export const courses = sqliteTable('courses', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  source: text('source', { enum: ['bundled', 'overpass', 'ml'] }).notNull(),
  rawDataBlob: text('raw_data_blob').notNull(),
  bounds: text('bounds').notNull(),
  addedAt: integer('added_at').notNull(),
})

// Per-course corrections to a hole's tee position. Layered over the
// read-only bundled JSON (and over installed-course data) in loadCourse,
// so the corrected tee is the single source of truth everywhere
// downstream. Keyed by the course slug stored on rounds.course_id (not
// Course.id, which is just metadata). Persisted = survives across rounds.
export const teeOverrides = sqliteTable(
  'tee_overrides',
  {
    courseId: text('course_id').notNull(),
    holeNum: integer('hole_num').notNull(),
    lat: real('lat').notNull(),
    lng: real('lng').notNull(),
    setAt: integer('set_at').notNull(),
  },
  t => [primaryKey({ columns: [t.courseId, t.holeNum] })],
)
