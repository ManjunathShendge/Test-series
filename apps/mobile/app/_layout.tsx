import { Stack } from 'expo-router';

/**
 * Root layout. The attempt route is deliberately outside the tab group and
 * blocks back navigation once started; see docs/TEST_ENGINE.md.
 */
export default function RootLayout() {
  return <Stack />;
}
