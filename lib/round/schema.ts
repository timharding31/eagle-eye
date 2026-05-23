import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
} from 'drizzle-orm/sqlite-core'

export const rounds = sqliteTable('rounds', {
  id: text('id').primaryKey(),
  courseId: text('course_id').notNull(),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  currentHole: integer('current_hole').notNull().default(1),
  notes: text('notes'),
})

export const holeStates = sqliteTable(
  'hole_states',
  {
    roundId: text('round_id').notNull(),
    holeNum: integer('hole_num').notNull(),
    pinLat: real('pin_lat'),
    pinLng: real('pin_lng'),
    score: integer('score'),
  },
  t => [primaryKey({ columns: [t.roundId, t.holeNum] })],
)

export const teeShots = sqliteTable('tee_shots', {
  roundId: text('round_id').notNull(),
  holeNum: integer('hole_num').notNull(),
  startLat: real('start_lat').notNull(),
  startLng: real('start_lng').notNull(),
  endLat: real('end_lat'),
  endLng: real('end_lng'),
  distanceM: real('distance_m'),
  recordedAt: integer('recorded_at'),
})
