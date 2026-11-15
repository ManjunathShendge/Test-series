import { Linking } from 'react-native';
import { useAppStore } from '@/lib/store/app';
import { Card, ListRow, Screen, Text, ToggleRow } from '@/ui/primitives';
import { space } from '@/ui/tokens';

/**
 * Notification preferences (docs/NOTIFICATIONS.md). Transactional notices are
 * shown but locked on; optional engagement can be switched off. Push permission
 * itself lives in the phone's settings.
 */
export default function NotificationsScreen() {
  const prefs = useAppStore((s) => s.notificationPrefs);
  const setPref = useAppStore((s) => s.setNotificationPref);

  return (
    <Screen edges={['left', 'right']}>
      <Text variant="heading">Push notifications</Text>
      <Card padded={false}>
        <ToggleRow title="Results and corrected scores" subtitle="When your result, rank or a corrected score is ready" value locked />
        <ToggleRow title="Unfinished tests" subtitle="A reminder while a test you started can still be continued" value={prefs.unfinishedAttempt} onValueChange={(v) => setPref('unfinishedAttempt', v)} divider />
        <ToggleRow title="New tests from examiners you follow" subtitle="Only when a new test goes live" value={prefs.newTestsFromFollowed} onValueChange={(v) => setPref('newTestsFromFollowed', v)} divider />
        <ToggleRow title="Exam date changes" subtitle="Official date changes for your target exams" value={prefs.examDateChanges} onValueChange={(v) => setPref('examDateChanges', v)} divider />
      </Card>

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
