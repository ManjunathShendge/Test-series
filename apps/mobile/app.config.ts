import type { ExpoConfig } from 'expo/config';

/**
 * Expo Go runs the demo today; development builds (expo-dev-client) add native modules
 * such as Google Sign-In (docs/MOBILE.md). Product name MakeMePrepare (O10, 22 November
 * 2026); brand assets in assets/ are derived from the owner's MMP-logo.png.
 *
 * Build-time settings (not EXPO_PUBLIC_, never in the JS bundle). Locally they come from
 * apps/mobile/.env; for EAS builds set them as EAS environment variables (docs/SETUP.md):
 * - APP_BUNDLE_ID: iOS bundle identifier and Android package. Google's OAuth clients are
 *   tied to it, so choose the real one before creating them.
 * - GOOGLE_IOS_URL_SCHEME: REVERSED_CLIENT_ID from GoogleService-Info.plist.
 */
// Development package name (owner can still change it before the first store release).
const bundleId = process.env.APP_BUNDLE_ID || 'com.testapp.examprep';
const googleIosUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME ?? '';

// A cloud build without the scheme would install fine and then fail at the Google picker.
if (process.env.EAS_BUILD === 'true' && process.env.EAS_BUILD_PLATFORM === 'ios' && !googleIosUrlScheme) {
  throw new Error('GOOGLE_IOS_URL_SCHEME is not set for this EAS build environment (docs/SETUP.md).');
}
// A store build under the development package name could never be updated once published.
const storeBuild = process.env.EAS_BUILD_PROFILE === 'production';
if (storeBuild && !process.env.APP_BUNDLE_ID) {
  throw new Error('APP_BUNDLE_ID is not set for the production EAS environment (docs/STORE_RELEASE.md).');
}

const config: ExpoConfig = {
  name: 'MakeMePrepare',
  slug: 'testapp',
  owner: 'testseriesapp0312s-team',
  scheme: 'examprep',
  // Store version shown to users; build numbers are managed by EAS (appVersionSource remote).
  version: '1.0.0',
  orientation: 'portrait',
  newArchEnabled: true,
  userInterfaceStyle: 'light',
  backgroundColor: '#001D39',
  icon: './assets/icon.png',
  ios: {
    supportsTablet: false,
    bundleIdentifier: bundleId,
    // HTTPS only, no custom cryptography: exempt, so App Store Connect stops asking per build.
    config: { usesNonExemptEncryption: false },
    // React Native's own required-reason API use; Expo modules ship their own manifests.
    // No tracking. Data collection labels are declared in App Store Connect (STORE_RELEASE.md).
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['CA92.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp', NSPrivacyAccessedAPITypeReasons: ['C617.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime', NSPrivacyAccessedAPITypeReasons: ['35F9.1'] },
      ],
    },
  },
  android: {
    package: bundleId,
    // The app reads no shared storage and draws no overlays; keeping these out avoids Play
    // permission declarations. The overlay stays for development builds (dev menu).
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.RECORD_AUDIO',
      ...(storeBuild || process.env.EAS_BUILD_PROFILE === 'preview' ? ['android.permission.SYSTEM_ALERT_WINDOW'] : []),
    ],
    softwareKeyboardLayoutMode: 'resize',
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#FFFFFF' },
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-status-bar',
    'expo-sqlite',
    // Adds the iOS push entitlement (aps-environment). Android permissions come from the library
    // manifest (POST_NOTIFICATIONS, RECEIVE_BOOT_COMPLETED); nothing extra is requested here.
    'expo-notifications',
    ['expo-splash-screen', { backgroundColor: '#001D39', image: './assets/splash-icon.png', imageWidth: 200, resizeMode: 'contain' }],
    // iosUrlScheme is required when Firebase runs as the JS SDK rather than natively.
    ...(googleIosUrlScheme ? [['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }] as [string, unknown]] : []),
  ],
  experiments: { typedRoutes: true },
  extra: {
    eas: { projectId: '3036cec0-1fd4-4295-b0ed-765e950af6d8' },
  },
};

export default config;
