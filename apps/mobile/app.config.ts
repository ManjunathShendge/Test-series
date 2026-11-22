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

const config: ExpoConfig = {
  name: 'MakeMePrepare',
  slug: 'testapp',
  owner: 'testseriesapp0312s-team',
  scheme: 'examprep',
  version: '0.0.0',
  orientation: 'portrait',
  newArchEnabled: true,
  userInterfaceStyle: 'light',
  backgroundColor: '#001D39',
  icon: './assets/icon.png',
  ios: { supportsTablet: false, bundleIdentifier: bundleId },
  android: {
    package: bundleId,
    softwareKeyboardLayoutMode: 'resize',
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#FFFFFF' },
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-status-bar',
    'expo-sqlite',
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
