import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const courses = sqliteTable('courses', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  source: text('source', { enum: ['bundled', 'overpass', 'ml'] }).notNull(),
  rawDataBlob: text('raw_data_blob').notNull(),
  bounds: text('bounds').notNull(),
  addedAt: integer('added_at').notNull(),
})
