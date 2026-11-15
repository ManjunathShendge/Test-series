import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors, typography } from '@/ui/tokens';

/**
 * Root navigator. Tabs hold the four top-level destinations. Detail screens use
 * the native header so Android back, predictive back and the header back button
 * all behave identically. The attempt flow hides the header and manages its own
 * exit path (docs/TEST_ENGINE.md).
 */
export default function RootLayout() {
  return (
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
      </Stack>
    </SafeAreaProvider>
  );
}
