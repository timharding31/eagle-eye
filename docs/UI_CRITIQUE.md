# UI Critique — Hole View

An assessment of the hole screen (see `screenshots/hole-view.png`) and concrete,
file-level suggestions for a more polished, "professional instrument" feel.
Every suggestion points at a token in `lib/theme.ts` or a file in
`components/hole/` so it lands as a root-cause change, not a one-off hex.

## Verdict

It's already a competent, cohesive dark-theme rangefinder — the core job (read
the number at a glance) is done well, and the oklch-generated palette is more
disciplined than most hobby apps. What separates it from a "pro" look is **a
handful of polish tells**: an oversized cropped logo, scattered right-edge
alignment, and glass that reads as flat dark cards rather than real glass. None
are deep; most are an hour each.

## What's already working — keep it

- **Number hierarchy.** The big cream center value over dim front/back is exactly
  right. `tabular-nums` (`fpb.value`) keeps digits from jittering frame to frame —
  a detail most apps miss.
- **Cohesive palette from knobs.** Generating every color from a few oklch bases
  (`theme.ts`) means the app is already internally consistent — the thing that
  most often makes hobby UIs look "off" is already solved.
- **Sora + uppercase micro-labels.** The type system reads as designed.
- **Bottom drawer.** Clean, gold-accented, good radius. This is the most
  "finished" region on screen.

## The polish tells (ranked by impact-per-effort)

### 1. The eagle logo is cropped and oversized — highest-impact fix

`TopBar.tsx` sets the logo to `width: 124, height: 124` inside a `height: 64`
bar with `overflow: 'hidden'`, so on the hole screen you see a chopped-off
eagle head bleeding into the status bar. An oversized, cropped mark is the
single biggest "amateur" signal here.

- **Do:** drop the logo on interior screens entirely (most pro GPS apps show no
  brand mark on the play screen — Garmin Golf, 18Birdies, Hole19 all keep the
  map screen chrome-free), **or** shrink to an optically-balanced ~28–32px mark
  that fits the 64px bar with padding. Reserve the big eagle for the home screen.

### 2. Right-edge chrome doesn't share an alignment grid

Three floating clusters sit at three different right offsets: the F/G/B panel at
`right: space.sm` (8), the button stack at `right: space.lg` (24). Nothing shares
an edge, so the right side reads as scattered rather than composed.

- **Do:** align the F/G/B panel and the button stack to **one** right margin
  (pick `space.md` or `space.lg` and use it for both). A single invisible
  gutter line down the right edge is what makes pro layouts feel "snapped to a
  grid."

### 3. Glass reads as flat dark cards, not glass

`colors.glass` (alpha 0.92) and `glassSoft` (0.85) are nearly opaque, so the
panels look like solid blocks pasted on the map. True frosted glass needs a blur
behind a _more transparent_ fill.

- **Do (best):** put an `expo-blur` `BlurView` behind the panels and drop the
  fill alpha to ~0.55–0.7 so the imagery shows through softly. This is the
  single change that most reads as "premium."
- **Do (cheap):** if you don't want the blur dependency, lean the other way and
  own the _solid instrument_ look — add a 1px inner **top highlight** border
  (`rgba(255,255,255,0.10–0.14)`) to each panel. On busy satellite imagery a
  drop shadow vanishes; a top highlight is what sells "physical surface."

### 4. Mixed panel geometry

Readouts are rounded rectangles (`radius.md`), action buttons are circles, the
tee pill is another rect. Mixed shapes on one surface look less intentional.

- **Do:** make it a _rule_, not an accident — "round = action, rect = readout" is
  defensible, but then keep every readout on the same radius and every action a
  true circle, and document it. Right now it's close but reads as incidental.

### 5. Toggle state lives in text, not in the control

`LZ: ON` / `LZ: OFF` communicates state through a text suffix. Pro toggles show
state _on the control_ — a filled/tinted button when active, outline when off.

- **Do:** drive the active state through `IconButton` appearance (filled
  `goldenEagle` or cream tint when on, ghost when off) and drop the `: ON/OFF`
  suffix to just `LZ`. Same for any other stateful control.

### 6. Distance microlabels would beat the abstract glyphs

The front/back green glyphs (`GreenFrontIcon`/`GreenBackIcon`) read as ambiguous
up/down chevrons at this size and could be mistaken for tappable steppers.

- **Do:** small uppercase `FRONT` / `BACK` text labels (you already have
  `type.labelXs`) are clearer and more "instrument-like" than the glyphs, and
  match the rest of the type system. Keep the center value icon-free.

### 7. One accent, used with discipline

The screen currently mixes cream (numbers), gold (`goldenEagle` — hole number,
me-marker), and maroon (`pinFill`). The maroon CTA barely appears, so the accent
story is muddled.

- **Do:** pick **one** hero accent for the play screen and commit. Either promote
  the center distance to `goldenEagle` (gold = "this is your number") and keep
  everything else neutral, or keep numbers cream and reserve gold strictly for
  the active/selected state. Maroon can stay the home-screen CTA color and sit
  out the map.

### 8. Outdoor legibility headroom

The whole point is reading this in bright sun. The LZ line is thin
(`line-width: 2`) and the LZ distance pills (`152`, `268`) are small.

- **Do:** consider bumping the LZ line to 2.5–3px and the label pill type a step,
  and verify contrast at max screen brightness outdoors. This is a field-test
  item more than a desk one.

## Suggested order of attack

1. **Logo** (#1) — 10 min, biggest visible payoff.
2. **Right-edge alignment** (#2) — 15 min, makes the whole screen feel composed.
3. **Glass depth** (#3, cheap version) — 20 min; the blur version is a bigger lift
   but the highest-end result.
4. **Toggle-as-state + microlabels** (#5, #6) — refinements once the structure
   reads clean.
5. **Accent discipline + outdoor legibility** (#7, #8) — final pass, partly a
   field-test decision.

Items 1–3 alone move it most of the way from "competent hobby app" to "looks
shipped."
