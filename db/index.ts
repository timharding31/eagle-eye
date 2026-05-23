import * as ExpoSQLite from 'expo-sqlite'
import { drizzle } from 'drizzle-orm/expo-sqlite'
import * as courseSchema from '@/lib/course/schema'
import * as roundSchema from '@/lib/round/schema'

const sqlite = ExpoSQLite.openDatabaseSync('eagle-eye.db')

export const db = drizzle(sqlite, {
  schema: { ...courseSchema, ...roundSchema },
})
