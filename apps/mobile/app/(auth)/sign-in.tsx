import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useAppStore } from '@/lib/store/app';
import { Button, Chip, Icon, Screen, Text, TextField } from '@/ui/primitives';
import { colors, radius, space, touch } from '@/ui/tokens';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sign-in (PRD 6.1 as amended, DECISIONS D01/C1): Google and verified email on
 * every platform, Apple alongside Google on iOS. No phone OTP. The 18+ gate is
 * the proposed O05 policy and is labelled as a confirmation, not a legal claim.
 */
export default function SignInScreen() {
  const router = useRouter();
  const signIn = useAppStore((s) => s.signIn);
  const [adult, setAdult] = useState(false);
  const [mode, setMode] = useState<'providers' | 'email' | 'sent'>('providers');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const requireAdult = () => {
    if (adult) return true;
    setError('Confirm you are 18 or older to continue.');
    return false;
  };

  const withProvider = async (provider: string) => {
    if (!requireAdult()) return;
    setBusy(provider);
    await new Promise<void>((r) => setTimeout(() => r(), 900));
    setBusy(null);
    signIn();
    router.replace('/(auth)/onboarding');
  };

  const sendLink = async () => {
    if (!requireAdult()) return;
    if (!EMAIL.test(email.trim())) {
      setError('Enter a valid email address, like name@example.com.');
      return;
    }
    setError(null);
    setBusy('email');
    await new Promise<void>((r) => setTimeout(() => r(), 900));
    setBusy(null);
    setMode('sent');
  };

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']} contentStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Icon name="school" size={32} color={colors.onPrimary} />
        </View>
        <Text variant="display">Practice like it's exam day</Text>
        <Text tone="secondary">Timed mocks for SSC, Banking and Railways, written by examiners who have cleared them. One free test is waiting.</Text>
        <View style={styles.badges}>
          <Chip label="SSC CGL" tone="primary" />
          <Chip label="IBPS PO" tone="primary" />
          <Chip label="RRB NTPC" tone="primary" />
        </View>
      </View>

      <View style={styles.form}>
        {mode === 'sent' ? (
          <View style={styles.sent} accessibilityLiveRegion="polite">
            <View style={styles.sentIcon}>
              <Icon name="mail-open-outline" size={28} color={colors.success} />
            </View>
            <Text variant="heading" align="center">
              Check your inbox
            </Text>
            <Text tone="secondary" align="center">
              We sent a sign-in link to {email.trim()}. Open it on this device to continue.
            </Text>
            <Button label="I've verified, continue" icon="checkmark" fullWidth onPress={() => { signIn(); router.replace('/(auth)/onboarding'); }} />
            <Button label="Use a different email" variant="ghost" onPress={() => setMode('email')} />
          </View>
        ) : (
          <>
            <Pressable onPress={() => { setAdult((v) => !v); setError(null); }} accessibilityRole="checkbox" accessibilityState={{ checked: adult }} accessibilityLabel="I confirm I am 18 years or older" style={styles.checkRow}>
              <View style={[styles.checkbox, adult && styles.checkboxOn, !!error && !adult && styles.checkboxError]}>
                {adult ? <Icon name="checkmark" size={18} color={colors.onPrimary} /> : null}
              </View>
              <Text style={{ flex: 1 }}>I confirm I am 18 years or older.</Text>
            </Pressable>

            {mode === 'email' ? (
              <View style={styles.emailForm}>
                <TextField
                  label="Email address"
                  placeholder="name@example.com"
                  value={email}
                  onChangeText={(v) => { setEmail(v); if (error) setError(null); }}
                  onClear={() => setEmail('')}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="send"
                  onSubmitEditing={() => void sendLink()}
                  helper="We email a one-tap sign-in link. No password to remember."
                  {...(error && adult ? { error } : {})}
                />
                <Button label="Send sign-in link" icon="mail-outline" fullWidth size="lg" loading={busy === 'email'} onPress={() => void sendLink()} />
                <Button label="Back to all options" variant="ghost" onPress={() => { setMode('providers'); setError(null); }} />
              </View>
            ) : (
              <View style={styles.providers}>
                <Button label="Continue with Google" icon="logo-google" variant="secondary" fullWidth size="lg" loading={busy === 'google'} onPress={() => void withProvider('google')} />
                {Platform.OS === 'ios' ? (
                  <Button label="Continue with Apple" icon="logo-apple" variant="secondary" fullWidth size="lg" loading={busy === 'apple'} onPress={() => void withProvider('apple')} />
                ) : null}
                <Button label="Continue with email" icon="mail-outline" fullWidth size="lg" onPress={() => { if (requireAdult()) setMode('email'); }} />
              </View>
            )}

            {error && (!adult || mode !== 'email') ? (
              <View style={styles.errorRow} accessibilityLiveRegion="assertive">
                <Icon name="alert-circle-outline" size={16} color={colors.error} />
                <Text variant="bodySmall" tone="error">
                  {error}
                </Text>
              </View>
            ) : null}
          </>
        )}

        <Text variant="caption" tone="secondary" align="center" style={styles.legal}>
          By continuing you agree to the Terms and Privacy Policy. Your phone number is optional and never used for sign-in.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'space-between', paddingVertical: space['2xl'] },
  hero: { gap: space.md },
  logo: { width: 64, height: 64, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  form: { gap: space.lg },
  providers: { gap: space.md },
  emailForm: { gap: space.md },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touch.minSize },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxError: { borderColor: colors.error },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  sent: { alignItems: 'center', gap: space.md },
  sentIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' },
  legal: { marginTop: space.sm },
});
