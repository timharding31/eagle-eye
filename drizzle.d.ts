declare module '*.sql' {
  const content: string
  export default content
}

declare module '@/drizzle/migrations' {
  type MigrationsBundle = {
    journal: {
      entries: {
        idx: number
        when: number
        tag: string
        breakpoints: boolean
      }[]
    }
    migrations: Record<string, string>
  }
  const bundle: MigrationsBundle
  export default bundle
}
