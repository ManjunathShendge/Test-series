import { StyleSheet, View } from 'react-native';
import { colors, radius } from '@/ui/tokens';
import { Text } from './Text';

export interface AvatarProps {
  name: string;
  size?: number;
}

/** Initials avatar. Decorative beside the visible name, so hidden from assistive tech. */
export function Avatar({ name, size = 40 }: AvatarProps) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.circle, { width: size, height: size }]}
    >
      <Text variant={size >= 48 ? 'heading' : 'bodySmallStrong'} tone="primary">
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
