import { Pressable, StyleSheet, View } from 'react-native';
import { colors, elevation, radius, touch } from '@/ui/tokens';
import { Icon, type IconName } from './Icon';

export interface IconButtonProps {
  icon: IconName;
  /** Required: icon-only controls need an accessible name. */
  label: string;
  onPress: () => void;
  /** surface: white circle on the canvas; inverse: translucent circle on navy. */
  tone?: 'surface' | 'inverse';
  /** Small dot for unread state; the label must say it too. */
  badge?: boolean;
}

/** Circular 48dp icon control used in screen headers. */
export function IconButton({ icon, label, onPress, tone = 'surface', badge }: IconButtonProps) {
  const inverse = tone === 'inverse';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.base,
        inverse ? styles.inverse : styles.surface,
        pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
      ]}
    >
      <Icon name={icon} size={22} color={inverse ? colors.onInverse : colors.text} />
      {badge ? <View style={styles.badge} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { width: touch.minSize, height: touch.minSize, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  surface: { backgroundColor: colors.surface, ...elevation.card },
  inverse: { backgroundColor: 'rgba(255,255,255,0.14)' },
  badge: { position: 'absolute', top: 11, right: 12, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, borderWidth: 1.5, borderColor: colors.surface },
});
