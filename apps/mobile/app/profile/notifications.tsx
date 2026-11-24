import { Linking, View } from 'react-native';
import type { NotificationPrefs } from '@exam-prep/contracts';
import { useNotificationPrefs, useUpdateNotificationPrefs } from '@/lib/api/account';
import { Card, ListRow, Screen, Skeleton, StateView, Text, ToggleRow } from '@/ui/primitives';
import { space } from '@/ui/tokens';

/**
 * Notification preferences (docs/NOTIFICATIONS.md), saved on the server so every device and
 * the server's sender agree. Transactional notices are shown but locked on; optional
 * engagement can be switched off. Push permission itself lives in the phone's settings.
 */
export default function NotificationsScreen() {
  const query = useNotificationPrefs();
  const update = useUpdateNotificationPrefs();
  const prefs = query.data;
  const setPref = (key: keyof NotificationPrefs, value: boolean) => update.mutate({ [key]: value });

  return (
    <Screen edges={['left', 'right']}>
      <Text tone="secondary">
        Results, receipts and account notices are always sent. You can switch off the reminders and updates below.
      </Text>

      <Text variant="heading">Push notifications</Text>
      {prefs ? (
        <Card padded={false}>
          <ToggleRow title="Results and corrected scores" subtitle="When your result, rank or a corrected score is ready" value locked />
          <ToggleRow title="Unfinished tests" subtitle="A reminder while a test you started can still be continued" value={prefs.unfinishedAttempt} onValueChange={(v) => setPref('unfinishedAttempt', v)} divider />
          <ToggleRow title="New tests from examiners you follow" subtitle="Only when a new test goes live" value={prefs.newTestsFromFollowed} onValueChange={(v) => setPref('newTestsFromFollowed', v)} divider />
          <ToggleRow title="Exam date changes" subtitle="Official date changes for your target exams" value={prefs.examDateChanges} onValueChange={(v) => setPref('examDateChanges', v)} divider />
        </Card>
      ) : query.isError || query.fetchStatus === 'paused' ? (
        <StateView
          kind={query.isError ? 'error' : 'offline'}
          title={query.isError ? 'Could not load your preferences' : 'Waiting for a connection'}
          message={query.isError ? 'Something went wrong. Try again in a moment.' : 'Your preferences load as soon as you are back online.'}
          actionLabel="Try again"
          onAction={() => void query.refetch()}
        />
      ) : (
        <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading notification preferences" style={{ gap: space.sm }}>
          <Skeleton height={72} rounded="lg" />
          <Skeleton height={72} rounded="lg" />
          <Skeleton height={72} rounded="lg" />
        </View>
      )}
      {update.isError ? (
        <Text variant="bodySmall" tone="error" accessibilityLiveRegion="polite">
          Your change was not saved. Check your connection and try again.
        </Text>
      ) : null}

      <Text variant="heading">Email</Text>
      <Card padded={false}>
        <ToggleRow title="Receipts and invoices" subtitle="Sent for every purchase" value locked />
      </Card>

      <Card padded={false}>
        <ListRow icon="settings-outline" title="Phone notification settings" subtitle="Allow or block all notifications from this app" onPress={() => void Linking.openSettings()} />
      </Card>
      <Text variant="bodySmall" tone="secondary" style={{ marginTop: -space.sm }}>
        This app does not send SMS or WhatsApp messages.
      </Text>
    </Screen>
  );
}
