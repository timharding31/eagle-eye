module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['inline-import', { extensions: ['.sql'] }],
      // react-native-worklets/plugin powers Reanimated v4 worklets and MUST be
      // listed last. (In Reanimated v4 the babel plugin moved out of
      // react-native-reanimated into react-native-worklets.)
      'react-native-worklets/plugin',
    ],
  }
}
