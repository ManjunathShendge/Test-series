import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OfflineBanner } from '@/features/common/OfflineBanner';
import { ApiProvider } from '@/lib/api/client';
import { useAppStore } from '@/lib/store/app';
import { useAttemptStore } from '@/lib/store/attempt';
import { useResultsStore } from '@/lib/store/results';
import { useHydrated } from '@/lib/store/storage';
import { colors, typography } from '@/ui/tokens';

// Keep the native splash up until persisted state is back, so the first frame
// is the right screen (Home for a signed-in student, never a flash of sign-in).
void SplashScreen.preventAutoHideAsync();

/**
 * Root navigator. Tabs hold the four top-level destinations. Detail screens use
 * the native header so Android back, predictive back and the header back button
 * all behave identically. The attempt flow hides the header and manages its own
 * exit path (docs/TEST_ENGINE.md).
 */
export default function RootLayout() {
  const hydrated = useHydrated([useAppStore, useAttemptStore, useResultsStore]);

  useEffect(() => {
    if (!hydrated) return;
    // Resume rules (PRD 6.4): an attempt that outlived its deadline while the
    // app was closed is auto-submitted now; a live one restarts its clock.
    const attempt = useAttemptStore.getState();
    if (attempt.resume() === 'expired') {
      const result = attempt.submit('deadline');
      if (result) {
        useResultsStore.getState().addResult(result);
        useAppStore.getState().markAttempted(result.testId);
      }
    }
    void SplashScreen.hideAsync();
  }, [hydrated]);

  if (!hydrated) return null;

  return (
    <ApiProvider>
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: true,
          headerStyle: { backgroundColor: colors.surface },
          headerShadowVisible: false,
          headerTintColor: colors.primary,
          headerTitleStyle: { ...typography.heading, color: colors.text },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="exam/[id]" options={{ title: 'Exam' }} />
        <Stack.Screen name="examiner/[id]" options={{ title: 'Examiner' }} />
        <Stack.Screen name="series/[id]" options={{ title: 'Series' }} />
        <Stack.Screen name="test/[id]/index" options={{ title: 'Test' }} />
        <Stack.Screen name="result/[attemptId]" options={{ title: 'Result' }} />
        <Stack.Screen name="test/[id]/instructions" options={{ title: 'Instructions' }} />
        <Stack.Screen name="test/[id]/attempt" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="profile/edit-exams" options={{ title: 'Target exams' }} />
        <Stack.Screen name="practice/[list]" options={{ title: 'Practice' }} />
        <Stack.Screen name="purchase/[id]" options={{ title: 'Purchase' }} />
        <Stack.Screen name="profile/devices" options={{ title: 'Devices' }} />
        <Stack.Screen name="profile/notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="profile/help" options={{ title: 'Help and support' }} />
        <Stack.Screen name="profile/legal" options={{ title: 'Terms and privacy' }} />
        <Stack.Screen name="profile/delete-account" options={{ title: 'Delete account' }} />
      </Stack>
      <OfflineBanner />
    </SafeAreaProvider>
    </ApiProvider>
  );
}
