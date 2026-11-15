import type { ExpoConfig } from 'expo/config';

/**
 * Expo development builds only - never Expo Go. Native auth, billing and screen
 * capture modules cannot run in Expo Go (docs/MOBILE.md). Product name and
 * bundle identifiers are placeholders until the brand decision (O10) lands.
 */
const config: ExpoConfig = {
  name: 'Exam Prep Marketplace',
  slug: 'exam-prep-marketplace',
  scheme: 'examprep',
  version: '0.0.0',
  orientation: 'portrait',
  newArchEnabled: true,
  userInterfaceStyle: 'light',
  backgroundColor: '#F8FAFC',
  ios: { supportsTablet: false, bundleIdentifier: 'com.example.examprep' },
  android: {
    package: 'com.example.examprep',
    softwareKeyboardLayoutMode: 'resize',
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-status-bar',
    ['expo-splash-screen', { backgroundColor: '#F8FAFC', resizeMode: 'contain' }],
  ],
  experiments: { typedRoutes: true },
};

export default config;
