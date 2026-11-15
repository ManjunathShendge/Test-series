import { Alert, View } from 'react-native';
import { DEVICE_LIMIT } from '@/lib/demo';
import { formatDate, formatRelative } from '@/lib/format';
import { useAppStore } from '@/lib/store/app';
import { Button, Card, Chip, ListRow, Screen, Text } from '@/ui/primitives';
import { space } from '@/ui/tokens';

/**
 * Registered devices (DECISIONS C4): two at a time; a third is blocked until
 * the student removes one here. This phone cannot remove itself; signing out
 * does that.
 */
export default function DevicesScreen() {
  const devices = useAppStore((s) => s.devices);
  const removeDevice = useAppStore((s) => s.removeDevice);
  const free = Math.max(0, DEVICE_LIMIT - devices.length);

  const confirmRemove = (id: string, name: string) =>
    Alert.alert(`Remove ${name}?`, 'It is signed out immediately. Any test in progress on it keeps its timer running and can be continued here.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeDevice(id) },
    ]);

  return (
    <Screen edges={['left', 'right']}>
      <Card>
        <Text variant="heading">
          {devices.length} of {DEVICE_LIMIT} devices in use
        </Text>
        <Text variant="bodySmall" tone="secondary" style={{ marginTop: space.xs }}>
          {free > 0
            ? `You can sign in on ${free} more ${free === 1 ? 'device' : 'devices'}.`
            : 'Signing in on a new device is blocked until you remove one below.'}
        </Text>
      </Card>

      <Card padded={false}>
        {devices.map((d, i) => (
          <ListRow
            key={d.id}
            icon={d.platform === 'ios' ? 'phone-portrait-outline' : d.name.toLowerCase().includes('tab') ? 'tablet-portrait-outline' : 'phone-portrait-outline'}
            iconTone={d.current ? 'primary' : 'neutral'}
            title={d.name}
            subtitle={d.current ? `This device · added ${formatDate(d.registeredAt)}` : `Last active ${formatRelative(d.lastActiveAt)} · added ${formatDate(d.registeredAt)}`}
            divider={i > 0}
            trailing={d.current ? <Chip label="This device" tone="primary" /> : <Button label="Remove" variant="ghost" onPress={() => confirmRemove(d.id, d.name)} />}
          />
        ))}
      </Card>

      <View style={{ gap: space.xs }}>
        <Text variant="bodySmall" tone="secondary">
          Why a limit? Paid tests are for one student. Two devices covers a phone and a tablet without letting an account be shared.
        </Text>
      </View>
    </Screen>
  );
}
