import { Alert, View } from 'react-native';
import { useDevices, useRevokeDevice } from '@/lib/api/account';
import { DEVICE_LIMIT } from '@/lib/demo';
import { formatRelative } from '@/lib/format';
import { Button, Card, Chip, ListRow, Screen, Skeleton, StateView, Text } from '@/ui/primitives';
import { space } from '@/ui/tokens';

/**
 * Registered devices (DECISIONS C4): two at a time; a third is blocked until
 * the student removes one here. This phone cannot remove itself; signing out
 * does that.
 */
export default function DevicesScreen() {
  const query = useDevices();
  const revoke = useRevokeDevice();
  const devices = (query.data ?? []).filter((d) => d.isActive);
  const free = Math.max(0, DEVICE_LIMIT - devices.length);

  const confirmRemove = (id: string, name: string) =>
    Alert.alert(`Remove ${name}?`, 'It is signed out immediately. Any test in progress on it keeps its timer running and can be continued here.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          revoke.mutate(id, {
            onError: (e) => Alert.alert('Could not remove the device', e instanceof Error ? e.message : 'Please try again.'),
          }),
      },
    ]);

  if (query.isPending) {
    return (
      <Screen edges={['left', 'right']}>
        <Skeleton height={72} />
        <Skeleton height={128} />
      </Screen>
    );
  }

  if (query.isError) {
    return (
      <Screen edges={['left', 'right']}>
        <StateView kind="error" title="Could not load your devices" message={query.error.message} actionLabel="Try again" onAction={() => void query.refetch()} />
      </Screen>
    );
  }

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
            icon={/tab|ipad/i.test(d.name ?? '') ? 'tablet-portrait-outline' : 'phone-portrait-outline'}
            iconTone={d.isCurrent ? 'primary' : 'neutral'}
            title={d.name ?? 'Unnamed device'}
            subtitle={d.isCurrent ? 'This device' : `Last active ${formatRelative(d.lastActiveAt)}`}
            divider={i > 0}
            trailing={
              d.isCurrent ? (
                <Chip label="This device" tone="primary" />
              ) : (
                <Button label="Remove" variant="ghost" loading={revoke.isPending && revoke.variables === d.id} onPress={() => confirmRemove(d.id, d.name ?? 'this device')} />
              )
            }
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
