import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'

import { Button } from '@/components/Button'
import { GlassHeader } from '@/components/GlassHeader'
import { GlassSurface } from '@/components/GlassSurface'
import { MapBackdrop } from '@/components/MapBackdrop'
import { colors, radius, space, type } from '@/lib/theme'

import { ActiveRoundCard } from './ActiveRoundCard'
import { CourseList } from './CourseList'
import { useHomeScene } from './scene'

// The home screen composition: glass chrome floated over the satellite
// MapBackdrop. Shows the active-round hero or the Course list, plus the error
// banner and the Add Course footer. Pulls everything from the scene context, so
// this is purely layout — mirrors components/hole/HoleLayout.tsx.
export function HomeLayout() {
  const router = useRouter()
  const { activeRound, err } = useHomeScene()

  return (
    <View style={styles.root}>
      <MapBackdrop>
        <GlassHeader
          onLogoPress={() => router.push('/landing' as never)}
          onMenuPress={() => router.push('/history' as never)}
        />
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {activeRound ? <ActiveRoundCard /> : <CourseList />}

          {err && (
            <GlassSurface rounded={radius.lg} style={styles.errorBox}>
              <Text style={styles.errorText}>{err}</Text>
            </GlassSurface>
          )}

          {!activeRound && (
            <View style={styles.foot}>
              <Button
                onPress={() => router.push('/courses/add' as never)}
                label="Add Course"
                variant="ghost"
                style={{ width: '100%' }}
              />
            </View>
          )}
        </ScrollView>
      </MapBackdrop>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: { padding: space.marginMobile, paddingTop: space.md, gap: space.md },

  foot: {
    marginTop: space.lg,
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: space.md,
    paddingBottom: space.lg,
  },

  errorBox: { padding: space.md, borderColor: colors.error },
  errorText: { ...type.bodyMd, color: colors.primary },
})
