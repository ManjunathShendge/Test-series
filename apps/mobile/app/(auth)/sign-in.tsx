import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import type { Device } from '@exam-prep/contracts';
import { ApiRequestError } from '@/lib/api/http';
import { createSession, deviceLimitDevices, revokeDevice } from '@/lib/api/identity';
import {
  authErrorMessage,
  currentUser,
  refreshVerification,
  resendVerificationEmail,
  sendPasswordReset,
  signInWithEmail,
  signOutOfFirebase,
  signUpWithEmail,
} from '@/lib/auth';
import { formatRelative } from '@/lib/format';
import { useAppStore } from '@/lib/store/app';
import { Button, Card, Chip, Icon, ListRow, Screen, Text, TextField } from '@/ui/primitives';
import { colors, radius, space, touch } from '@/ui/tokens';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

type Mode = 'providers' | 'email' | 'verify' | 'devices';

/**
 * Sign-in (PRD 6.1 as amended, DECISIONS D01/C1/C4): verified email and password through
 * Firebase, then the API registers this device. Google, and Apple on iOS, arrive with the
 * native development build. No phone OTP. The 18+ gate is the proposed O05 policy and is
 * labelled as a confirmation, not a legal claim.
 */
export default function SignInScreen() {
  const router = useRouter();
  const applyServerProfile = useAppStore((s) => s.applyServerProfile);
  const [adult, setAdult] = useState(false);
  const [mode, setMode] = useState<Mode>('providers');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [limitDevices, setLimitDevices] = useState<Device[]>([]);

  const fail = (message: string) => { setNotice(null); setError(message); };

  const requireAdult = () => {
    if (adult) return true;
    fail('Confirm you are 18 or older to continue.');
    return false;
  };

  /** Registers this device with the API and routes to onboarding or Home. */
  const finishSignIn = async () => {
    setBusy('session');
    try {
      const session = await createSession();
      applyServerProfile(session.profile);
      router.replace(session.profile.onboarded ? '/' : '/(auth)/onboarding');
    } catch (e) {
      const devices = deviceLimitDevices(e);
      if (devices) {
        setLimitDevices(devices);
        setMode('devices');
      } else if (e instanceof ApiRequestError && e.code === 'EMAIL_NOT_VERIFIED') {
        setMode('verify');
      } else if (e instanceof ApiRequestError && ['ACCOUNT_EXISTS_WITH_DIFFERENT_SIGN_IN', 'ACCOUNT_BLOCKED'].includes(e.code)) {
        await signOutOfFirebase();
        setMode('email');
        fail(e.message);
      } else {
        fail(e instanceof ApiRequestError ? e.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setBusy(null);
    }
  };

  const submitEmail = async () => {
    if (!requireAdult()) return;
    if (creating && !name.trim()) return fail('Enter your name.');
    if (!EMAIL.test(email.trim())) return fail('Enter a valid email address, like name@example.com.');
    if (password.length < (creating ? MIN_PASSWORD : 1)) {
      return fail(creating ? `Choose a password of at least ${MIN_PASSWORD} characters.` : 'Enter your password.');
    }
    setError(null);
    setBusy('email');
    try {
      const user = creating ? await signUpWithEmail(name, email, password) : await signInWithEmail(email, password);
      setPassword('');
      if (!user.emailVerified) {
        setNotice(creating ? null : 'Your email is not verified yet. We can send the link again.');
        setMode('verify');
        return;
      }
      await finishSignIn();
    } catch (e) {
      fail(authErrorMessage(e));
    } finally {
      setBusy((b) => (b === 'email' ? null : b));
    }
  };

  const confirmVerified = async () => {
    setBusy('verify');
    try {
      if (await refreshVerification()) {
        await finishSignIn();
      } else {
        fail('Not verified yet. Open the link in the email we sent, then tap continue.');
      }
    } catch (e) {
      fail(authErrorMessage(e));
    } finally {
      setBusy((b) => (b === 'verify' ? null : b));
    }
  };

  const resend = async () => {
    setBusy('resend');
    try {
      await resendVerificationEmail();
      setError(null);
      setNotice('Sent. Check your inbox and spam folder.');
    } catch (e) {
      fail(authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const resetPassword = async () => {
    if (!EMAIL.test(email.trim())) return fail('Enter your email above, then tap Forgot password.');
    setBusy('reset');
    try {
      await sendPasswordReset(email);
      setError(null);
      setNotice(`If an account exists for ${email.trim()}, a reset link is on its way.`);
    } catch (e) {
      fail(authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const removeAndContinue = async (device: Device) => {
    setBusy(device.id);
    try {
      await revokeDevice(device.id);
      await finishSignIn();
    } catch (e) {
      fail(e instanceof ApiRequestError ? e.message : 'Could not remove that device. Try again.');
    } finally {
      setBusy((b) => (b === device.id ? null : b));
    }
  };

  const startOver = async () => {
    await signOutOfFirebase().catch(() => undefined);
    setError(null);
    setNotice(null);
    setMode('email');
  };

  const messages = (
    <View style={styles.errorSlot} accessibilityLiveRegion="assertive">
      {error ? (
        <View style={styles.errorRow}>
          <Icon name="alert-circle-outline" size={16} color={colors.error} />
          <Text variant="bodySmall" tone="error" style={{ flex: 1 }}>{error}</Text>
        </View>
      ) : notice ? (
        <View style={styles.errorRow}>
          <Icon name="information-circle-outline" size={16} color={colors.primary} />
          <Text variant="bodySmall" tone="secondary" style={{ flex: 1 }}>{notice}</Text>
        </View>
      ) : null}
    </View>
  );

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
        {mode === 'verify' ? (
          <View style={styles.centered}>
            <View style={styles.sentIcon}>
              <Icon name="mail-open-outline" size={28} color={colors.success} />
            </View>
            <Text variant="heading" align="center">Verify your email</Text>
            <Text tone="secondary" align="center">
              We sent a link to {currentUser()?.email ?? email.trim()}. Open it, then come back and continue.
            </Text>
            <Button label="I've verified, continue" icon="checkmark" fullWidth size="lg" loading={busy === 'verify' || busy === 'session'} onPress={() => void confirmVerified()} />
            <Button label="Send the link again" variant="secondary" fullWidth loading={busy === 'resend'} onPress={() => void resend()} />
            <Button label="Use a different account" variant="ghost" onPress={() => void startOver()} />
            {messages}
          </View>
        ) : mode === 'devices' ? (
          <View style={styles.devices}>
            <Text variant="heading">Two devices already in use</Text>
            <Text tone="secondary">Paid tests are for one student, on up to two devices. Remove one to sign in here. It is signed out straight away.</Text>
            <Card padded={false}>
              {limitDevices.map((d, i) => (
                <ListRow
                  key={d.id}
                  icon={d.platform === 'web' ? 'laptop-outline' : 'phone-portrait-outline'}
                  title={d.name ?? 'Unnamed device'}
                  subtitle={`Last active ${formatRelative(d.lastActiveAt)}`}
                  divider={i > 0}
                  trailing={<Button label="Remove" variant="ghost" loading={busy === d.id} disabled={busy !== null} onPress={() => void removeAndContinue(d)} />}
                />
              ))}
            </Card>
            <Button label="Cancel" variant="ghost" onPress={() => void startOver()} />
            {messages}
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
                {creating ? (
                  <TextField label="Your name" value={name} onChangeText={(v) => { setName(v); setError(null); }} autoCapitalize="words" autoComplete="name" textContentType="name" returnKeyType="next" />
                ) : null}
                <TextField
                  label="Email address"
                  placeholder="name@example.com"
                  value={email}
                  onChangeText={(v) => { setEmail(v); setError(null); }}
                  onClear={() => setEmail('')}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                />
                <TextField
                  label="Password"
                  value={password}
                  onChangeText={(v) => { setPassword(v); setError(null); }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete={creating ? 'new-password' : 'current-password'}
                  textContentType={creating ? 'newPassword' : 'password'}
                  returnKeyType="go"
                  onSubmitEditing={() => void submitEmail()}
                  {...(creating ? { helper: `At least ${MIN_PASSWORD} characters. We will email you a link to verify your address.` } : {})}
                />
                <Button label={creating ? 'Create account' : 'Sign in'} icon={creating ? 'person-add-outline' : 'log-in-outline'} fullWidth size="lg" loading={busy === 'email' || busy === 'session'} disabled={busy !== null} onPress={() => void submitEmail()} />
                <View style={styles.links}>
                  <Button label={creating ? 'I have an account' : 'Create an account'} variant="ghost" onPress={() => { setCreating((c) => !c); setError(null); setNotice(null); }} />
                  {!creating ? <Button label="Forgot password?" variant="ghost" loading={busy === 'reset'} onPress={() => void resetPassword()} /> : null}
                </View>
                <Button label="Back to all options" variant="ghost" onPress={() => { setMode('providers'); setError(null); setNotice(null); }} />
              </View>
            ) : (
              <View style={styles.providers}>
                <Button label="Continue with Google" icon="logo-google" variant="secondary" fullWidth size="lg" disabled accessibilityHint="Available in the next app build" />
                {Platform.OS === 'ios' ? (
                  <Button label="Continue with Apple" icon="logo-apple" variant="secondary" fullWidth size="lg" disabled accessibilityHint="Available in the next app build" />
                ) : null}
                <Button label="Continue with email" icon="mail-outline" fullWidth size="lg" onPress={() => { if (requireAdult()) setMode('email'); }} />
                <Text variant="caption" tone="secondary" align="center">
                  Google{Platform.OS === 'ios' ? ' and Apple' : ''} sign-in arrive with the next app build.
                </Text>
              </View>
            )}

            {/* Space is reserved so the buttons above never move when a message appears. */}
            {messages}
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
  links: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' },
  devices: { gap: space.md },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touch.minSize },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxError: { borderColor: colors.error },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  errorSlot: { minHeight: 40, marginTop: -space.sm, justifyContent: 'flex-start' },
  centered: { alignItems: 'center', gap: space.md },
  sentIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' },
  legal: { marginTop: space.sm },
});
