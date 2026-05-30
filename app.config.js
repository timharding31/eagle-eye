// Dynamic config layered on top of app.json.
// EAS passes APP_VARIANT per build profile (see eas.json). The dev variant gets
// its own name, Android package, and scheme so it installs alongside the
// preview/production build instead of overwriting it.
const IS_DEV = process.env.APP_VARIANT === 'development'

export default ({ config }) => {
  if (!IS_DEV) return config

  return {
    ...config,
    name: `[DEV] ${config.name}`,
    scheme: `${config.scheme}-dev`,
    android: {
      ...config.android,
      package: `${config.android.package}.dev`,
    },
  }
}
