import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold } from '@expo-google-fonts/outfit';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { OfflineBanner } from '@/features/common/OfflineBanner';
import { ApiProvider } from '@/lib/api/client';
import { onAuthChange } from '@/lib/auth';
import { missingConfig } from '@/lib/config';
import { useAppStore } from '@/lib/store/app';
import { resetLocalSession } from '@/lib/store/session';
import { useResultsStore } from '@/lib/store/results';
import { useHydrated } from '@/lib/store/storage';
import { Text } from '@/ui/primitives';
import { colors, space, typography } from '@/ui/tokens';

const MISSING_CONFIG = missingConfig();

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
  const storesHydrated = useHydrated([useAppStore, useResultsStore]);
  // Bundled with the JS, so this resolves offline. On a load error the app still starts
  // and React Native falls back to the system face.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
  });
  const hydrated = storesHydrated && (fontsLoaded || !!fontError);

  useEffect(() => {
    if (!hydrated) return;
    // Running attempts resume from the server (timer, answers); its finalizer closes expired ones.
    void SplashScreen.hideAsync();
  }, [hydrated]);

  // Firebase restores its own session; if it has no user (signed out, revoked or a fresh
  // install with old local state), the local session must not outlive it.
  useEffect(() => {
    if (!hydrated || MISSING_CONFIG.length) return undefined;
    return onAuthChange((user) => {
      if (!user && useAppStore.getState().session.signedIn) resetLocalSession();
    });
  }, [hydrated]);

  if (!hydrated) return null;

  if (MISSING_CONFIG.length) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: space.xl, gap: space.md, backgroundColor: colors.background }}>
        <Text variant="heading">App configuration is incomplete</Text>
        <Text tone="secondary">Set these in apps/mobile/.env and restart Expo: {MISSING_CONFIG.join(', ')}</Text>
      </View>
    );
  }

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
        <Stack.Screen name="attempt/[id]/index" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="attempt/[id]/summary" options={{ title: 'Score' }} />
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
