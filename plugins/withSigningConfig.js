const { withAppBuildGradle } = require('@expo/config-plugins');

// Expo's generated android/app/build.gradle signs release builds with the debug
// keystore. This plugin adds a `release` signing config that reads the upload
// keystore from Gradle properties (~/.gradle/gradle.properties, see README) and
// points the release build type at it. Credentials never enter the repo.

const MARKER = '// randoro-release-signing';

const RELEASE_SIGNING_CONFIG = `
        release { ${MARKER}
            if (project.hasProperty("RANDORO_UPLOAD_STORE_FILE")) {
                storeFile file(project.findProperty("RANDORO_UPLOAD_STORE_FILE"))
                storePassword project.findProperty("RANDORO_UPLOAD_STORE_PASSWORD")
                keyAlias project.findProperty("RANDORO_UPLOAD_KEY_ALIAS")
                keyPassword project.findProperty("RANDORO_UPLOAD_KEY_PASSWORD")
            }
        }`;

function withSigningConfig(config) {
  return withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    if (contents.includes(MARKER)) {
      cfg.modResults.contents = contents;
      return cfg;
    }

    // Add the release config after the debug entry inside signingConfigs.
    const debugSigning = /(signingConfigs\s*\{\s*debug\s*\{[^}]*\})/;
    if (!debugSigning.test(contents)) {
      throw new Error('withSigningConfig: could not find signingConfigs.debug in app/build.gradle');
    }
    contents = contents.replace(debugSigning, `$1${RELEASE_SIGNING_CONFIG}`);

    // Point the release build type at the new config instead of debug.
    const releaseBuildType = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
    if (!releaseBuildType.test(contents)) {
      throw new Error('withSigningConfig: could not find buildTypes.release signingConfig in app/build.gradle');
    }
    contents = contents.replace(releaseBuildType, '$1signingConfig signingConfigs.release');

    cfg.modResults.contents = contents;
    return cfg;
  });
}

module.exports = withSigningConfig;
