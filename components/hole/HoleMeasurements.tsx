import { View, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  distanceMeters,
  farthestPointOnPolygon,
  nearestPointOnPolygon,
  projectionFraction,
} from '@/lib/geo'
import { colors, space, radius, type, shadows } from '@/lib/theme'
import { GolfTeeIcon, GreenBackIcon, GreenFrontIcon } from '@/components/icons'

import { useHoleScene } from './scene'
import { M_TO_YD } from './units'

// Distance-from-tee marker shows once the player is meaningfully off the
// tee — i.e. past this fraction of the tee→green-centroid line. Below it
// the value is just GPS noise reading "0". No upper bound: the marker
// stays visible even past the green.
const TEE_MARKER_MIN_FRACTION = 0.02

// The top-right F/G/P pill plus the tee-distance pill below it. Owns its own
// distance math — nothing else on the screen needs these values.
export function HoleMeasurements() {
  const insets = useSafeAreaInsets()
  const { position, pin, teeLL, greenC, currentHole } = useHoleScene()

  const distances = position
    ? {
        front: distanceMeters(
          position,
          nearestPointOnPolygon(position, currentHole.green),
        ),
        pin: distanceMeters(position, pin),
        back: distanceMeters(
          position,
          farthestPointOnPolygon(position, currentHole.green),
        ),
      }
    : null

  // Distance from the (possibly corrected) tee, shown once the player is
  // off the tee. Straight-line GPS→tee; lateral offset is ignored — the
  // projection fraction is only the visibility gate.
  const teeFraction = position
    ? projectionFraction(position, teeLL, greenC)
    : null
  const teeDistanceM =
    teeFraction != null && teeFraction > TEE_MARKER_MIN_FRACTION
      ? distanceMeters(position!, teeLL)
      : null

  // Position the stack just under the glass TopBar (insets.top + ~64 bar +
  // small gap). Right-aligned so the narrower tee pill hugs the same edge.
  const floatingTop = insets.top + 72

  return (
    <View
      style={[styles.rightStack, { top: floatingTop }]}
      pointerEvents="none"
    >
      <FpbPanel distances={distances} />
      {teeDistanceM != null && <TeeDistancePanel meters={teeDistanceM} />}
    </View>
  )
}

function FpbPanel({
  distances,
}: {
  distances: { front: number; pin: number; back: number } | null
}) {
  return (
    <View style={fpb.panel} pointerEvents="none">
      <FpbCell value={distances?.back} back />
      <View style={fpb.divider} />
      <FpbCell value={distances?.pin} primary />
      <View style={fpb.divider} />
      <FpbCell value={distances?.front} front />
    </View>
  )
}

// Distance from the (corrected) tee. A sibling of the FPB pill — same glass
// styling, stacked just below it — but a different reference point, so it's
// its own panel rather than a fourth FPB cell.
function TeeDistancePanel({ meters }: { meters: number }) {
  return (
    <View style={[fpb.panel, teePanel.panel]}>
      <GolfTeeIcon width={24} height={24} color={colors.onSurfaceVariant} />
      <Text style={teePanel.value}>{fmtYds(Math.round(meters * M_TO_YD))}</Text>
    </View>
  )
}

function FpbCell({
  label = null,
  value,
  primary,
  front,
  back,
}: {
  label?: string | null
  value: number | undefined
  primary?: boolean
  back?: boolean
  front?: boolean
}) {
  const yds = value != null ? Math.round(value * M_TO_YD) : null
  return (
    <View style={fpb.cell}>
      {(front || back) && (
        <>
          {front ? (
            <GreenFrontIcon
              width={24}
              height={24}
              color={colors.onSurfaceVariant}
            />
          ) : (
            <GreenBackIcon
              width={24}
              height={24}
              color={colors.onSurfaceVariant}
            />
          )}
        </>
      )}
      <Text
        style={[
          fpb.value,
          primary ? fpb.valuePrimary : { color: colors.onSurfaceVariant },
          { flexGrow: 1, textAlign: 'right' },
        ]}
      >
        {fmtYds(yds)}
      </Text>
    </View>
  )
}

function fmtYds(yds: number | null) {
  if (yds == null) return '--'
  if (yds < 1e3) return String(yds)
  return (yds / 1e3).toFixed(0) + '00'
}

const styles = StyleSheet.create({
  // Top-right stack: the FPB pill with the tee-distance pill below it.
  // Right-aligned so the narrower tee pill hugs the same edge.
  rightStack: {
    position: 'absolute',
    right: space.sm,
    alignItems: 'flex-end',
    gap: space.sm,
  },
})

const fpb = StyleSheet.create({
  panel: {
    backgroundColor: colors.glassSoft,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    minWidth: 108,
    ...shadows.card,
  },
  cell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingVertical: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.outlineVariant,
    marginVertical: 4,
  },
  value: {
    color: colors.onSurface,
    fontFamily: 'Sora_600SemiBold',
    fontSize: 22,
    lineHeight: 26,
    fontVariant: ['tabular-nums'],
    alignItems: 'center',
  },
  valuePrimary: {
    color: colors.primary,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.5,
  },
})

const teePanel = StyleSheet.create({
  panel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  value: {
    color: colors.onSurfaceVariant,
    fontFamily: 'Sora_600SemiBold',
    fontSize: 22,
    lineHeight: 26,
    fontVariant: ['tabular-nums'],
  },
})
