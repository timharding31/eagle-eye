# Plan: iOS support for Eagle Eye

## Context

Eagle Eye is an Android-only Expo/React Native golf rangefinder, distributed as a
sideloaded APK. The goal is to also run it on a real iPhone (you use it physically
on a course, so GPS on a real device matters). Chosen distribution: **TestFlight**
(requires Apple Developer Program, $99/yr), with a **Mac + Xcode** available for
fast local iteration before cloud builds.

The good news from exploration: this is a **managed Expo project with no committed
`ios/`/`android/` native directories** — native code is generated at build time
(CNG) from the config plugins. Every native dependency already supports iOS
(`@maplibre/maplibre-react-native`, `expo-blur`, `expo-location`, `expo-sqlite`,
`react-native-reanimated`/`worklets`). The only platform branches in code are
already iOS-aware (`lib/theme.ts:171` Menlo font via `Platform.select`,
`app/round/scorecard.tsx:133` keyboard behavior). So iOS support is **almost
entirely config + verification**, not a refactor.

The two Android-specific runtime concerns are both expected to be no-ops on iOS:

- The glass blur (`components/GlassSurface.tsx`) uses `blurMethod="dimezisBlurViewSdk31Plus"`
  - a `blurTarget` ref + `androidView="texture"` on the map. On iOS, `expo-blur`
    uses native `UIBlurEffect`, which auto-samples what's behind it — `blurTarget`
    and `androidView` are simply ignored. Blur should "just work" but needs a visual
    check (intensity scaling differs between platforms).
- The offline-tile pack-status workaround in `lib/tiles/index.ts` (`percentage === 100`
  fallback because Android doesn't persist `'complete'`) is harmless on iOS; verify
  the pack lifecycle there.

## Prerequisites (you, one-time)

1. **Enroll in the Apple Developer Program** ($99/yr) at developer.apple.com.
2. Decide a **bundle identifier** — recommend `com.timharding.eagleeye` (mirrors the
   Android package). EAS can auto-register the App ID + provisioning on first build.
3. Ensure you're logged in: `eas login` (you already have an EAS project,
   `projectId e70a0bc5-...` in `app.json`).

## Changes

### 1. `app.json` — add an `ios` block

Add alongside the existing `android` block:

```jsonc
"ios": {
  "bundleIdentifier": "com.timharding.eagleeye",
  "buildNumber": "1",
  "supportsTablet": false,            // portrait golf app; iPhone-only
  "infoPlist": {
    "NSLocationWhenInUseUsageDescription":
      "Eagle Eye uses your location to measure distances to the green and pin while you play.",
    "ITSAppUsesNonExemptEncryption": false   // skips the export-compliance prompt on TestFlight
  }
}
```

Notes:

- `icon: ./assets/icon.png` is already set and is reused for iOS — no new asset
  strictly required (iOS ignores `adaptiveIcon`). Optionally add a dedicated
  `ios.icon` later for polish.
- `expo-location` plugin will also surface the permission string; setting it in
  `infoPlist` is the explicit, reviewable source of truth.
- Bump the top-level `version` later via the normal release flow; `buildNumber` is
  auto-incremented by EAS in the production profile (see below).

### 2. `app.config.js` — give the dev variant its own iOS bundle id

Currently the dev variant only re-namespaces `android.package` so it installs
alongside preview/prod. Mirror that for iOS so a `[DEV]` build doesn't collide:

```js
return {
  ...config,
  name: `[DEV] ${config.name}`,
  scheme: `${config.scheme}-dev`,
  android: { ...config.android, package: `${config.android.package}.dev` },
  ios: {
    ...config.ios,
    bundleIdentifier: `${config.ios.bundleIdentifier}.dev`,
  },
}
```

### 3. `eas.json` — add iOS to the build profiles + a submit profile

- Add `"ios": {}` to `development`, `preview`, and `production` so each can target
  iOS. For `production`, `autoIncrement: true` already covers iOS `buildNumber`.
- Keep the existing `development-simulator` profile (already iOS-only) for quick
  Simulator dev-client builds.
- Add a TestFlight submit profile:

```jsonc
"submit": {
  "production": {
    "ios": {
      "appleId": "timharding31@gmail.com",
      "ascAppId": "<App Store Connect app id — created on first submit>",
      "appleTeamId": "<your team id>"
    }
  }
}
```

(EAS can also store these as project secrets / prompt interactively, so the literal
values are optional.)

### 4. CI/CD (optional, do after first manual build succeeds)

Mirror the Android GitHub Actions flow for iOS once a manual `eas build`/`eas submit`
has proven the signing + provisioning works:

- Either extend `.github/workflows/eas-production.yml` to also run
  `eas build --platform ios --profile production` + `eas submit --platform ios`, or
  add a sibling `eas-ios-production.yml` triggered on the same `v*` tag.
- Reuses the existing `EXPO_TOKEN` secret. iOS submit additionally needs an
  **App Store Connect API key** stored as an EAS credential (one-time `eas credentials`).
- Leave this out of the first pass — get a local/manual TestFlight build working first.

## Execution order (fast local iteration first, given Mac + Xcode)

1. Make the `app.json` / `app.config.js` / `eas.json` edits above.
2. **Local Simulator smoke test** (no Apple account needed yet):
   `npx expo run:ios` (or `eas build -p ios --profile development-simulator`) — boots
   the dev client in the iOS Simulator. Confirms the project prebuilds and the JS
   loads. GPS won't be real, but you can set a simulated location in Simulator to
   exercise the hole view.
3. **First device/cloud build for TestFlight:**
   `eas build --platform ios --profile production` — EAS will prompt to create the
   App ID + distribution cert + provisioning profile automatically. Then
   `eas submit --platform ios --profile production` to push to TestFlight.
4. Install via the TestFlight app on your iPhone and verify on a real course.

## Verification (what to actually check on the device)

Run the app on a real iPhone (TestFlight) and confirm, end to end:

- **Location permission prompt** appears with the Info.plist copy, and the hole
  view's F/G/B + Distance-from-Tee pills update as you move (real GPS).
- **MapLibre renders** — both vector and satellite layers; pan/zoom on the hole map.
- **Offline tiles** — trigger `prefetchForCourse` for a course, then enable Airplane
  Mode and confirm tiles still render (validates the iOS pack lifecycle vs. the
  Android `percentage===100` workaround in `lib/tiles/index.ts`).
- **Glass blur** — the `GlassSurface` panels over the map/`MapBackdrop` should frost
  correctly via native `UIBlurEffect`. Watch for intensity differences vs. Android;
  if too strong/weak, the only tuning knob is `intensity` in `components/GlassSurface.tsx`
  (consider a `Platform.select` if iOS needs a different value — but try as-is first).
- **SQLite** — start/resume a round across an app cold-launch (active-round
  hydration via `lib/round.ensureHydrated()`), confirm migrations applied.
- **Fonts** — Sora loads; monospace data font falls back to Menlo on iOS
  (already wired in `lib/theme.ts`).
- **Scorecard keyboard** — the `KeyboardAvoidingView` padding behavior on iOS
  (`app/round/scorecard.tsx`).

## Out of scope / non-goals

- No code refactor of platform logic — existing branches are already iOS-correct.
- No new units toggle, settings panel, or feature work — iOS parity only.
- Background location is **not** used and should **not** be added (no
  `NSLocationAlwaysAndWhenInUseUsageDescription`).
- iOS CI/CD is deferred until a manual TestFlight build is proven (step 4 above).

## Risk notes

- **Lowest-risk path is correct**: managed CNG means there's no native code to port;
  if a plugin misbehaves on iOS it's a plugin/version issue, not app code.
- The only genuine unknowns are **blur appearance** and **offline-tile pack status**
  on iOS — both are verify-on-device items, not code-change items, and both have a
  clear single knob if they need tuning.
- Apple provisioning is the usual friction; letting EAS manage credentials on first
  build avoids hand-managing certs.
