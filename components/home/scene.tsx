import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import { Alert } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'

import {
  listAllCourses,
  listBundledCourses,
  removeInstalledCourse,
  type CourseSummary,
} from '@/lib/course'
import { endRound, isStale, startRound, useActiveRound } from '@/lib/round'
import { prefetchForCourse, prefetchStatus } from '@/lib/tiles'

// The single owner of home-screen state shared across regions: the installed
// Course list, the active Round, and the start/resume/end/remove actions. The
// CourseList and ActiveRoundCard regions consume this via useHomeScene() so
// HomeLayout stays pure composition — mirrors components/hole/scene.tsx.
//
// Hydration + the location-permission gate live one level up in the route
// loader (app/index.tsx); by the time this provider mounts the Round store is
// hydrated and useActiveRound() is live.

type ActiveRound = ReturnType<typeof useActiveRound>

interface HomeScene {
  courses: CourseSummary[]
  activeRound: ActiveRound
  stale: boolean
  busy: boolean
  err: string | null
  start: (slug: string) => void
  remove: (course: CourseSummary) => void
  endActive: () => void
  resume: () => void
}

const HomeSceneContext = createContext<HomeScene | null>(null)

export function HomeSceneProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const activeRound = useActiveRound()

  // Seed with the synchronous bundled list so the screen has something to
  // render immediately; replace with bundled+installed once SQLite returns.
  const [courses, setCourses] = useState<CourseSummary[]>(listBundledCourses())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Refresh the Course list + nudge any missing tile prefetches on focus, so
  // newly installed courses (from Add Course) show up on return.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      listAllCourses()
        .then(list => {
          if (cancelled) return
          setCourses(list)
          for (const c of list) {
            prefetchStatus(c.slug)
              .then(() => prefetchForCourse(c.slug, c.bounds))
              .catch(e => console.error(`tiles prefetch ${c.slug}`, e))
          }
        })
        .catch(e => !cancelled && setErr(String(e)))
      return () => {
        cancelled = true
      }
    }, []),
  )

  const stale = useMemo(
    () => (activeRound ? isStale(activeRound) : false),
    [activeRound],
  )

  const start = useCallback(
    async (slug: string) => {
      setErr(null)
      setBusy(true)
      try {
        const round = await startRound(slug)
        router.push(`/round/${round.currentHole}` as never)
      } catch (e) {
        setErr(String(e))
      } finally {
        setBusy(false)
      }
    },
    [router],
  )

  const remove = useCallback((course: CourseSummary) => {
    Alert.alert(
      `Remove ${course.name}?`,
      'The course will be removed from your device. Saved rounds keep their score history; you can re-add the course later via Find Nearby.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeInstalledCourse(course.slug)
              setCourses(await listAllCourses())
            } catch (e) {
              setErr(String(e))
            }
          },
        },
      ],
    )
  }, [])

  const endActive = useCallback(async () => {
    if (!activeRound) return
    setErr(null)
    setBusy(true)
    try {
      await endRound(activeRound.id)
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }, [activeRound])

  const resume = useCallback(() => {
    if (!activeRound) return
    router.push(`/round/${activeRound.currentHole}` as never)
  }, [activeRound, router])

  const value = useMemo<HomeScene>(
    () => ({
      courses,
      activeRound,
      stale,
      busy,
      err,
      start,
      remove,
      endActive,
      resume,
    }),
    [courses, activeRound, stale, busy, err, start, remove, endActive, resume],
  )

  return (
    <HomeSceneContext.Provider value={value}>
      {children}
    </HomeSceneContext.Provider>
  )
}

export function useHomeScene(): HomeScene {
  const ctx = useContext(HomeSceneContext)
  if (!ctx)
    throw new Error('useHomeScene must be used within HomeSceneProvider')
  return ctx
}
