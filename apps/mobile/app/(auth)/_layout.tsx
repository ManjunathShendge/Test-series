import { Redirect, Stack } from 'expo-router';
import { useAppStore } from '@/lib/store/app';
import { colors } from '@/ui/tokens';

/** Sign-in and onboarding. Once both are complete the student lands on Home. */
export default function AuthLayout() {
  const session = useAppStore((s) => s.session);
  if (session.signedIn && session.onboarded) return <Redirect href="/" />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'slide_from_right' }}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="onboarding" />
    </Stack>
  );
}
