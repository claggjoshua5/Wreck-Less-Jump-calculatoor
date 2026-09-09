/**
 * Expo config plugin: withAbiFilters
 *
 * Injects an ndk { abiFilters } block into the defaultConfig section of
 * app/build.gradle during `expo prebuild`. This ensures the ABI restriction
 * is applied consistently for all builds (local and CI), rather than being
 * patched post-hoc by CI scripts.
 *
 * For debug/CI builds we restrict to arm64-v8a only, which covers the vast
 * majority of modern Android devices and cuts native C++ compile time by ~75%.
 * Release builds should remove this plugin or extend it to include all ABIs.
 */

const { withAppBuildGradle } = require("@expo/config-plugins");

/**
 * @param {import('@expo/config-plugins').ExpoConfig} config
 * @param {{ abiFilters?: string[] }} options
 */
const withAbiFilters = (config, options = {}) => {
  const abiFilters = options.abiFilters ?? ["arm64-v8a"];
  const abiFilterLine = abiFilters.map((abi) => `"${abi}"`).join(", ");

  return withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;

    // Idempotent: skip if abiFilters already present
    if (contents.includes("abiFilters")) {
      return mod;
    }

    // Insert ndk { abiFilters ... } immediately after the defaultConfig { opening line
    contents = contents.replace(
      /(defaultConfig\s*\{)/,
      `$1\n        ndk {\n            abiFilters ${abiFilterLine}\n        }`
    );

    mod.modResults.contents = contents;
    return mod;
  });
};

module.exports = withAbiFilters;
