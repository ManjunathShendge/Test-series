import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { DELETION_GRACE_DAYS, deletionDate } from '@/lib/demo';
import { formatDate } from '@/lib/format';
import { useAppStore } from '@/lib/store/app';
import { Button, Card, Icon, Screen, Text, TextField, type IconName } from '@/ui/primitives';
import { colors, space, touch } from '@/ui/tokens';

const CONFIRM_WORD = 'DELETE';

const REMOVED: { icon: IconName; text: string }[] = [
  { icon: 'person-outline', text: 'Your profile, preferences and sign-in' },
  { icon: 'stats-chart-outline', text: 'Attempts, results, bookmarks and your mistake notebook' },
  { icon: 'lock-closed-outline', text: 'Access to every test and series you bought' },
];

/**
 * In-app account deletion (store requirement; docs/SECURITY.md): explain what
 * is removed and what is kept, require typed confirmation plus re-sign-in, then
 * a cancellable grace period. Statutory financial records are never promised
 * away.
 */
export default function DeleteAccountScreen() {
  const router = useRouter();
  const requestedAt = useAppStore((s) => s.deletionRequestedAt);
  const requestDeletion = useAppStore((s) => s.requestDeletion);
  const cancelDeletion = useAppStore((s) => s.cancelDeletion);
  const [typed, setTyped] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);

  if (requestedAt) {
    return (
      <Screen edges={['left', 'right']}>
        <Card>
          <View style={styles.center} accessibilityLiveRegion="polite">
            <View style={[styles.badge, { backgroundColor: colors.warningSoft }]}>
              <Icon name="time-outline" size={28} color={colors.warning} />
            </View>
            <Text variant="heading" align="center">
              Deletion scheduled for {formatDate(deletionDate(requestedAt).toISOString())}
            </Text>
            <Text tone="secondary" align="center">
              You can keep using the app until then. Cancel any time before that date and nothing is lost.
            </Text>
          </View>
        </Card>
        <Button label="Cancel deletion" icon="arrow-undo-outline" fullWidth size="lg" onPress={cancelDeletion} />
        <Button label="Back to Profile" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  const ready = understood && typed.trim().toUpperCase() === CONFIRM_WORD;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    await requestDeletion();
    setBusy(false);
  };

  return (
    <Screen edges={['left', 'right']} contentStyle={{ paddingBottom: space['2xl'] }}>
      <Text variant="title">Delete your account</Text>
      <Text tone="secondary">Deletion starts after a {DELETION_GRACE_DAYS}-day grace period. These are removed:</Text>

      <Card>
        <View style={styles.list}>
          {REMOVED.map((r) => (
            <View key={r.text} style={styles.item}>
              <Icon name={r.icon} size={20} color={colors.error} />
              <Text style={{ flex: 1 }}>{r.text}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <View style={styles.item}>
          <Icon name="document-lock-outline" size={20} color={colors.textSecondary} />
          <Text tone="secondary" style={{ flex: 1 }}>
            Invoices and payment records are kept for as long as tax law requires, then deleted. Refunds are not issued automatically on deletion.
          </Text>
        </View>
      </Card>

      <Pressable
        onPress={() => setUnderstood((v) => !v)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: understood }}
        accessibilityLabel="I understand that purchased tests cannot be restored after deletion"
        style={styles.check}
      >
        <View style={[styles.box, understood && styles.boxOn]}>{understood ? <Icon name="checkmark" size={18} color={colors.onPrimary} /> : null}</View>
        <Text style={{ flex: 1 }}>I understand purchased tests cannot be restored after deletion.</Text>
      </Pressable>

      <TextField
        label={`Type ${CONFIRM_WORD} to confirm`}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder={CONFIRM_WORD}
      />

      <Button label="Confirm with Google and delete" variant="danger" icon="trash-outline" fullWidth size="lg" disabled={!ready} loading={busy} onPress={() => void submit()} />
      <Text variant="caption" tone="secondary" align="center">
        For your security you sign in again before deletion is scheduled.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: space.sm },
  badge: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  list: { gap: space.md },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  check: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touch.minSize },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
