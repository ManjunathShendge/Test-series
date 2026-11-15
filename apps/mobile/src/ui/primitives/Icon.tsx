import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { colors } from '@/ui/tokens';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export interface IconProps {
  name: IconName;
  size?: number;
  color?: ColorValue | null | undefined;
  /**
   * Decorative icons sit beside visible text and are hidden from the
   * accessibility tree. Meaningful icons carry a label instead.
   */
  label?: string;
}

/**
 * Single outline icon family across the whole app (MASTER: SVG icon system, no
 * emoji). Ionicons ships with Expo, so this adds no dependency.
 */
export function Icon({ name, size = 20, color, label }: IconProps) {
  const decorative = label === undefined;
  // Navigation hands us ColorValue (which admits null and legacy numeric colours);
  // Ionicons wants a string or a platform colour object, so narrow here once.
  const resolved = typeof color === 'string' || (typeof color === 'object' && color !== null) ? color : colors.text;
  return (
    <Ionicons
      name={name}
      size={size}
      color={resolved}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
      accessibilityLabel={label}
      accessibilityRole={decorative ? undefined : 'image'}
    />
  );
}
