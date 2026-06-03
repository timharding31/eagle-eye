import { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react-native'

import { Hole } from '@/lib/course'
import { colors, radius, shadows, space, type } from '@/lib/theme'
import { IconButton } from '@/components/Button'

import { useHoleScene } from './scene'

// Per-cell size in the hole-grid (square, aspectRatio: 1). Used both for the
// flex layout and for computing the Animated height target on expand. The
// effective natural cell size is (screenW - 2*marginMobile - 5*gap) / 6 —
// we clamp the animation target to that, then add row gaps + paddings.
const GRID_COLS = 6
const GRID_GAP = 8
const GRID_PAD_TOP = space.md
const GRID_PAD_BOTTOM = space.sm

export function BottomDrawer() {
  const insets = useSafeAreaInsets()
  const {
    course,
    currentHole,
    prevHole,
    canAdvance,
    isLastHole,
    goPrev,
    goNext,
    selectHole,
  } = useHoleScene()
  const holes = course.holes

  const { width: screenW } = useWindowDimensions()
  const [expanded, setExpanded] = useState(false)
  // Lazy useState (not useRef) so the value can be referenced from JSX
  // without tripping the react-hooks/refs lint rule. Animated.Value is
  // mutable but stable across renders, so single initialization is fine.
  const [heightAnim] = useState(() => new Animated.Value(0))

  const gridHeight = useMemo(() => {
    const usable = screenW - 2 * space.marginMobile - (GRID_COLS - 1) * GRID_GAP
    const cellSize = Math.max(0, usable / GRID_COLS)
    const numRows = Math.ceil(holes.length / GRID_COLS)
    if (numRows === 0) return 0
    return (
      numRows * cellSize +
      (numRows - 1) * GRID_GAP +
      GRID_PAD_TOP +
      GRID_PAD_BOTTOM
    )
  }, [holes.length, screenW])

  // Snap closed whenever the active hole changes (e.g., Prev/Next pressed
  // while the grid is open). In-render compare avoids a useEffect that
  // would briefly show stale state on remount.
  const [trackedHoleNum, setTrackedHoleNum] = useState(currentHole.num)
  if (trackedHoleNum !== currentHole.num) {
    setTrackedHoleNum(currentHole.num)
    if (expanded) setExpanded(false)
  }

  useEffect(() => {
    Animated.timing(heightAnim, {
      toValue: expanded ? gridHeight : 0,
      duration: 220,
      useNativeDriver: false,
    }).start()
  }, [expanded, gridHeight, heightAnim])

  const handleSelect = (num: number) => {
    setExpanded(false)
    selectHole(num)
  }

  return (
    <View style={[drawer.wrap, { paddingBottom: insets.bottom }]}>
      <Animated.View style={[drawer.gridWrap, { height: heightAnim }]}>
        <HoleGrid
          holes={holes}
          currentHoleNum={currentHole.num}
          onSelect={handleSelect}
        />
      </Animated.View>

      <View style={drawer.nav}>
        <NavButton
          label="PREV"
          glyph={
            <View style={{ paddingTop: 4 }}>
              <ChevronLeftIcon
                color={colors.onSurface}
                width={32}
                height={32}
              />
            </View>
          }
          disabled={!prevHole}
          onPress={goPrev}
        />
        <TouchableOpacity
          style={drawer.navCenter}
          onPress={() => setExpanded(prev => !prev)}
          activeOpacity={0.7}
          accessibilityLabel={
            expanded ? 'Close hole selector' : 'Open hole selector'
          }
        >
          <Text style={drawer.navCenterLabel}>HOLE</Text>
          <View style={drawer.navCenterRow}>
            <Text style={drawer.navCenterNum}>{currentHole.num}</Text>
          </View>
        </TouchableOpacity>
        <NavButton
          label={isLastHole ? 'CARD' : 'NEXT'}
          glyph={
            <View style={{ paddingTop: 4 }}>
              <ChevronRightIcon
                color={colors.onSurface}
                width={32}
                height={32}
              />
            </View>
          }
          glyphRight
          disabled={!canAdvance}
          onPress={goNext}
        />
      </View>
    </View>
  )
}

function HoleGrid({
  holes,
  currentHoleNum,
  onSelect,
}: {
  holes: Hole[]
  currentHoleNum: number
  onSelect: (num: number) => void
}) {
  const rows: Hole[][] = []
  for (let i = 0; i < holes.length; i += GRID_COLS) {
    rows.push(holes.slice(i, i + GRID_COLS))
  }
  return (
    <View style={drawer.gridInner}>
      {rows.map((row, ri) => (
        <View key={ri} style={drawer.gridRow}>
          {row.map(h => {
            const active = h.num === currentHoleNum
            return (
              <TouchableOpacity
                key={h.num}
                style={[drawer.gridCell, active && drawer.gridCellActive]}
                onPress={() => onSelect(h.num)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    drawer.gridCellNum,
                    active && drawer.gridCellNumActive,
                  ]}
                >
                  {h.num}
                </Text>
                <Text
                  style={[
                    drawer.gridCellPar,
                    active && drawer.gridCellParActive,
                  ]}
                >
                  PAR {h.par}
                </Text>
              </TouchableOpacity>
            )
          })}
          {row.length < GRID_COLS &&
            Array.from({ length: GRID_COLS - row.length }).map((_, i) => (
              <View key={`spacer-${i}`} style={drawer.gridCellSpacer} />
            ))}
        </View>
      ))}
    </View>
  )
}

const TEST = false

function NavButton({
  label,
  glyph,
  glyphRight,
  disabled,
  onPress,
}: {
  label: string
  glyph: string | React.ReactElement
  glyphRight?: boolean
  disabled?: boolean
  onPress: () => void
}) {
  if (TEST) {
    return (
      <IconButton
        variant="ghost"
        size={'40%' as any}
        onPress={onPress}
        disabled={disabled}
        label={label}
        glyph={glyph}
      />
    )
  }
  return (
    <TouchableOpacity
      style={[navBtn.wrap, disabled && navBtn.disabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      {!glyphRight && <Text style={navBtn.glyph}>{glyph}</Text>}
      <Text style={navBtn.label}>{label}</Text>
      {glyphRight && <Text style={navBtn.glyph}>{glyph}</Text>}
    </TouchableOpacity>
  )
}

const drawer = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surfaceHighest,
    borderTopLeftRadius: radius['3xl'],
    borderTopRightRadius: radius['3xl'],
    ...shadows.drawer,
  },
  nav: {
    height: 88,
    paddingHorizontal: space.marginMobile,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineVariant,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
  },
  navCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: space.sm,
  },
  navCenterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  navCenterNum: {
    fontFamily: 'Sora_700Bold',
    fontSize: 40,
    lineHeight: 40,
    color: colors.goldenEagle,
  },
  navCenterLabel: { ...type.labelXs, color: colors.goldenEagle },

  gridWrap: {
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant,
  },
  gridInner: {
    paddingHorizontal: space.marginMobile,
    paddingTop: GRID_PAD_TOP,
    paddingBottom: GRID_PAD_BOTTOM,
    gap: GRID_GAP,
  },
  gridRow: {
    flexDirection: 'row',
    gap: GRID_GAP,
  },
  gridCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  gridCellActive: {
    backgroundColor: colors.goldenEagle,
  },
  gridCellSpacer: { flex: 1 },
  gridCellNum: {
    color: colors.primary,
    fontFamily: 'Sora_700Bold',
    fontSize: 18,
    lineHeight: 20,
  },
  gridCellNumActive: {
    color: colors.surfaceHighest,
  },
  gridCellPar: {
    color: colors.onSurfaceVariant,
    fontFamily: 'Sora_600SemiBold',
    fontSize: 9,
    letterSpacing: 1.2,
  },
  gridCellParActive: {
    color: colors.surfaceLow,
  },
})

const navBtn = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.sm,
    paddingVertical: 16,
    minWidth: 80,
  },
  disabled: { opacity: 0.35 },
  glyph: {
    color: colors.onSurface,
    fontFamily: 'Sora_700Bold',
    fontSize: 24,
    lineHeight: 24,
    marginTop: -3,
  },
  label: {
    color: colors.onSurface,
    fontFamily: 'Sora_700Bold',
    fontSize: 11,
    letterSpacing: 1.6,
  },
})
