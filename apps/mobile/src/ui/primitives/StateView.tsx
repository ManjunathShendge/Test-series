import { StyleSheet, View } from 'react-native';
import { colors, radius, space } from '@/ui/tokens';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

type Kind = 'empty' | 'error' | 'offline' | 'denied';

const presets: Record<Kind, { icon: IconName; color: string; bg: string }> = {
  empty: { icon: 'file-tray-outline', color: colors.textSecondary, bg: colors.surfaceMuted },
  error: { icon: 'alert-circle-outline', color: colors.error, bg: colors.errorSoft },
  offline: { icon: 'cloud-offline-outline', color: colors.warning, bg: colors.warningSoft },
  denied: { icon: 'lock-closed-outline', color: colors.textSecondary, bg: colors.surfaceMuted },
};

export interface StateViewProps {
  kind: Kind;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Empty, error, offline and permission-denied states share one layout so they
 * are recognisable, and each always offers a recovery path when one exists.
 */
export function StateView({ kind, title, message, actionLabel, onAction }: StateViewProps) {
  const preset = presets[kind];
  return (
    <View style={styles.root} accessibilityRole={kind === 'error' ? 'alert' : undefined}>
      <View style={[styles.badge, { backgroundColor: preset.bg }]}>
        <Icon name={preset.icon} size={28} color={preset.color} />
      </View>
      <Text variant="heading" align="center">
        {title}
      </Text>
      <Text tone="secondary" align="center">
        {message}
      </Text>
      {actionLabel && onAction ? <Button label={actionLabel} variant="secondary" onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: space.md, paddingVertical: space['2xl'], paddingHorizontal: space.lg },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
});
