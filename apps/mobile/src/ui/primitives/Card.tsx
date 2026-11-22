import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { colors, elevation, radius, space } from '@/ui/tokens';

export interface CardProps {
  children: ReactNode;
  /** When set, the whole card becomes a single accessible button. */
  onPress?: PressableProps['onPress'];
  accessibilityLabel?: string;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * White surface on the pale canvas: large radius, hairline border and a soft navy
 * shadow, after the dashboard reference. Tinted tiles use FeatureTile instead.
 */
export function Card({ children, onPress, accessibilityLabel, padded = true, style }: CardProps) {
  const inner = [styles.card, padded && styles.padded, style];

  if (!onPress) {
    return <View style={inner}>{children}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      android_ripple={{ color: colors.surfaceMuted }}
      style={({ pressed }) => [inner, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...elevation.card,
  },
  padded: { padding: space.lg },
  pressed: { backgroundColor: colors.surfaceMuted, transform: [{ scale: 0.99 }] },
});
