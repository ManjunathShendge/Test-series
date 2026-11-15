import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsOnline } from '@/lib/api/client';
import { Icon, Text } from '@/ui/primitives';
import { colors, elevation, radius, space } from '@/ui/tokens';

/**
 * App-wide connectivity notice, floating just above the bottom bar so it never
 * pushes headers down or covers the test timer, and never blocks touches. Text
 * plus icon, never colour alone; announced politely.
 */
export function OfflineBanner() {
  const online = useIsOnline();
  const insets = useSafeAreaInsets();
  if (online) return null;
  return (
    <View pointerEvents="none" style={[styles.root, { bottom: insets.bottom + 76 }]} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <Icon name="cloud-offline-outline" size={16} color={colors.warning} />
      <Text variant="bodySmallStrong" tone="warning" style={{ flex: 1 }}>
        You are offline. Answers still save on this phone and sync when you reconnect.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warning,
    ...elevation.raised,
  },
});
