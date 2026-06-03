import { Modal, Pressable, View, Text, StyleSheet } from 'react-native'

import { distanceMeters } from '@/lib/geo'
import { colors, fonts, radius, shadows, space, type } from '@/lib/theme'
import { Button } from '@/components/Button'
import { GolfTeeIcon } from '@/components/icons'

import { useHoleScene } from './scene'
import { M_TO_YD } from './units'

// Confirm dialog for the Set Tee button. Opening it (rather than committing on
// tap) is the guard against an errant touch: it previews how far the tee would
// move before writing, and — once a hole is corrected — offers a one-tap
// "Clear correction" to restore the source (OSM) tee. Clearing is non-
// destructive (it just drops the overlay), so it reads as a neutral action,
// not a red one.
export function TeeOverrideDialog() {
  const {
    currentHole,
    teeDialogOpen,
    closeTeeDialog,
    position,
    teeLL,
    hasTeeOverride,
    setTee,
    clearTee,
    teeBusy,
  } = useHoleScene()

  const moveYards =
    position != null
      ? Math.round(distanceMeters(teeLL, position) * M_TO_YD)
      : null

  const caption =
    moveYards == null
      ? 'Waiting for a GPS fix before the tee can be moved.'
      : moveYards === 0
        ? 'Snap the tee to where you’re standing.'
        : `Move the ${hasTeeOverride ? 'corrected ' : ''}tee ${moveYards} yds to where you’re standing.`

  const handleMove = async () => {
    await setTee()
    closeTeeDialog()
  }
  const handleClear = async () => {
    await clearTee()
    closeTeeDialog()
  }

  return (
    <Modal
      visible={teeDialogOpen}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={teeBusy ? undefined : closeTeeDialog}
    >
      <Pressable
        style={styles.backdrop}
        onPress={teeBusy ? undefined : closeTeeDialog}
      >
        {/* Inner press becomes the touch responder, so taps on the card don't
            fall through to the dismiss-on-backdrop handler above. */}
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>HOLE {currentHole.num} · TEE</Text>
            {hasTeeOverride && (
              <View style={styles.badge}>
                <View style={styles.badgeDot} />
                <Text style={styles.badgeText}>CORRECTED</Text>
              </View>
            )}
          </View>

          <Text style={styles.title}>Correct tee position</Text>

          {moveYards != null && (
            <View style={styles.stat}>
              <GolfTeeIcon width={26} height={26} color={colors.goldenEagle} />
              <View style={styles.statText}>
                <Text style={styles.statValue}>{moveYards}</Text>
                <Text style={styles.statUnit}>YDS</Text>
              </View>
            </View>
          )}

          <Text style={styles.caption}>{caption}</Text>

          <View style={styles.actions}>
            <Button
              label={teeBusy ? 'Saving…' : 'Move tee here'}
              onPress={handleMove}
              variant="primary"
              disabled={!position || teeBusy}
            />
            {hasTeeOverride && (
              <Button
                label="Clear correction"
                onPress={handleClear}
                variant="secondary"
                disabled={teeBusy}
              />
            )}
            <Button
              label="Cancel"
              onPress={closeTeeDialog}
              variant="ghost"
              disabled={teeBusy}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius['3xl'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    padding: space.lg,
    gap: space.md,
    ...shadows.drawer,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: { ...type.labelSm, color: colors.onSurfaceVariant },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceLow,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.goldenEagle,
  },
  badgeText: {
    ...type.labelXs,
    color: colors.goldenEagle,
  },

  title: { ...type.headlineMd },

  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  statText: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
  },
  statValue: {
    fontFamily: 'Sora_700Bold',
    fontSize: 48,
    lineHeight: 52,
    letterSpacing: -1,
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  statUnit: {
    fontFamily: fonts.label,
    fontSize: 16,
    letterSpacing: 1.6,
    color: colors.onSurfaceVariant,
  },

  caption: { ...type.bodyMd, color: colors.onSurfaceVariant },

  actions: {
    gap: space.sm,
    marginTop: space.xs,
  },
})
