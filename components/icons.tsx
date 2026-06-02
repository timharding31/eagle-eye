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
      <Path
        d="M9.31445 3.50488H20.4863C20.4787 3.98609 20.4839 4.47146 20.4883 4.94922C20.4934 5.501 20.4964 6.04372 20.4824 6.57617C20.3848 6.62608 20.2883 6.67807 20.1924 6.73145C16.8423 8.57669 14.8935 11.7665 13.8818 15.2725L13.8809 15.2773C13.2539 17.5365 13.0896 19.2863 13.0459 21.4912C12.3609 21.4853 11.6467 21.4829 10.959 21.4922C10.8976 18.8926 10.7067 16.8199 9.78711 14.1895C8.6687 10.9906 6.63628 8.16845 3.52246 6.57812C3.48426 5.68189 3.50336 4.49667 3.51074 3.51074C5.39156 3.54781 7.48207 3.50441 9.31445 3.50488Z"
        fill="currentColor"
        stroke="currentColor"
      />
    </Svg>
  )
}

export function GreenFrontIcon(props: React.ComponentProps<typeof Svg>) {
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
      <Path d="M21 10C21 10 18 14 12 14C6 14 3 10 3 10" />
    </Svg>
  )
}

export function GreenBackIcon(props: React.ComponentProps<typeof Svg>) {
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
      <Path d="M3 14C3 14 6 10 12 10C18 10 21 14 21 14" />
    </Svg>
  )
}

export function GolfTeeIcon2(props: React.ComponentProps<typeof Svg>) {
  return (
    <Svg viewBox="0 0 24 24" fill="none" {...props}>
      <Path
        d="M12.4293 1.00039C16.0169 0.961741 18.9577 3.80788 18.9995 7.35925C19.0414 10.9106 16.1687 13.824 12.5812 13.8684C8.98959 13.9128 6.04242 11.0651 6.00045 7.50965C5.95847 3.95422 8.83759 1.03907 12.4293 1.00039ZM7.66187 7.90464C7.85598 7.88292 8.02316 7.75926 8.09923 7.58115C8.1753 7.40304 8.14842 7.19816 8.02892 7.0452C7.90942 6.89223 7.71585 6.81497 7.52258 6.84305C7.23056 6.8855 7.02687 7.15191 7.06488 7.44166C7.1029 7.73138 7.36859 7.93744 7.66187 7.90464ZM9.06214 6.84374C8.77251 6.8994 8.58178 7.17508 8.63404 7.46253C8.68631 7.74995 8.96216 7.94251 9.25321 7.89472C9.44506 7.86322 9.60494 7.73192 9.67163 7.55108C9.73834 7.37024 9.70155 7.16786 9.57533 7.02139C9.44912 6.87493 9.25305 6.80706 9.06214 6.84374ZM9.45444 11.4876C9.74626 11.4367 9.94235 11.1628 9.89414 10.8734C9.84592 10.5839 9.57136 10.3869 9.27848 10.4314C9.08616 10.4607 8.92455 10.59 8.85531 10.77C8.78606 10.95 8.81987 11.153 8.94384 11.3015C9.0678 11.4499 9.26279 11.521 9.45444 11.4876ZM11.321 9.95358C11.0312 10.0115 10.8424 10.2893 10.8972 10.5768C10.952 10.8644 11.23 11.0549 11.5212 11.0044C11.7129 10.9712 11.8718 10.8383 11.9369 10.6568C12.0021 10.4752 11.9636 10.273 11.8361 10.1274C11.7086 9.98182 11.5118 9.91542 11.321 9.95358ZM7.98494 8.81967C7.69223 8.86826 7.49391 9.14149 7.54081 9.4316C7.5877 9.7217 7.86224 9.92005 8.15565 9.87577C8.45216 9.83104 8.65509 9.55576 8.60769 9.2626C8.56029 8.96943 8.28073 8.7706 7.98494 8.81967ZM10.0878 8.54928C9.89343 8.56694 9.72378 8.68703 9.64402 8.86339C9.56425 9.03976 9.58678 9.245 9.70294 9.4003C9.81909 9.5556 10.0108 9.63682 10.2045 9.61276C10.4972 9.57642 10.7063 9.31448 10.6745 9.02421C10.6426 8.73394 10.3815 8.52256 10.0878 8.54928ZM10.8419 11.6629C10.5491 11.7231 10.3612 12.0071 10.4226 12.2969C10.4839 12.5866 10.7712 12.772 11.0638 12.7107C11.3556 12.6496 11.5422 12.3661 11.481 12.0772C11.4199 11.7882 11.1339 11.6029 10.8419 11.6629Z"
        fill="currentColor"
      />
      <Path
        d="M8.42326 14.4365C9.32916 14.4625 10.3647 14.4386 11.2797 14.4389L16.5779 14.4391C16.5559 15.0115 16.5897 15.6126 16.566 16.1908C16.4831 16.2296 16.4014 16.2712 16.3213 16.3156C14.871 17.1095 14.0164 18.4871 13.5684 20.0301C13.2703 21.0982 13.207 21.9057 13.1938 22.9978C12.7432 22.9933 12.2533 22.9895 11.8045 23C11.7819 21.7294 11.7115 20.781 11.2799 19.5539C10.7728 18.1122 9.84698 16.8644 8.43372 16.1923C8.40252 15.7022 8.42331 14.947 8.42326 14.4365Z"
        fill="currentColor"
      />
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
