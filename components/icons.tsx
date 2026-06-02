import React from 'react'
import Svg, { Path, Rect } from 'react-native-svg'

export {
  CircleCheckIcon,
  CircleXIcon,
  CrosshairIcon,
} from 'lucide-react-native'

export function LandPlotIcon(props: React.ComponentProps<typeof Svg>) {
  return (
    <Svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <Path d="m12 8 6-3-6-3v10" />
      <Path d="m8 11.99-5.5 3.14a1 1 0 0 0 0 1.74l8.5 4.86a2 2 0 0 0 2 0l8.5-4.86a1 1 0 0 0 0-1.74L16 12" />
      <Path d="m6.49 12.85 11.02 6.3" />
      <Path d="M17.51 12.85 6.5 19.15" />
    </Svg>
  )
}

// A golf tee peg: flat top rim, concave sides tapering to a point. Used
// for the "Set Tee" control. Hand-rolled to match the in-house glyph set
// (stroke-based, 24-unit viewBox) — lucide has no golf-tee icon.
export function GolfTeeIcon(props: React.ComponentProps<typeof Svg>) {
  return (
    <Svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <Path d="M7 5h10" />
      <Path d="M9.5 5c.4 4 1.3 6 2.5 15 1.2-9 2.1-11 2.5-15" />
    </Svg>
  )
}

export function GoalIcon(props: React.ComponentProps<typeof Svg>) {
  return (
    <Svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <Path d="M12 13V2l8 4-8 4" />
      <Path d="M20.561 10.222a9 9 0 1 1-12.55-5.29" />
      <Path d="M8.002 9.997a5 5 0 1 0 8.9 2.02" />
    </Svg>
  )
}

export function FullscreenIcon(props: React.ComponentProps<typeof Svg>) {
  return (
    <Svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <Path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <Path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <Path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <Path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <Rect width="10" height="8" x="7" y="8" rx="1" />
    </Svg>
  )
}

export function FlagIcon(props: React.ComponentProps<typeof Svg>) {
  return (
    <Svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <Path d="M6 22V2.8a.8.8 0 0 1 1.17-.71l11.38 5.69a.8.8 0 0 1 0 1.44L6 15.5" />
    </Svg>
  )
}

export function ChevronUpIcon(props: React.ComponentProps<typeof Svg>) {
  return (
    <Svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <Path d="m18 15-6-6-6 6" />
    </Svg>
  )
}

export function ChevronDownIcon(props: React.ComponentProps<typeof Svg>) {
  return (
    <Svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <Path d="m6 9 6 6 6-6" />
    </Svg>
  )
}
