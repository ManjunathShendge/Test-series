import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, type DimensionValue } from 'react-native';
import { useReducedMotion } from '@/lib/a11y';
import { colors, radius } from '@/ui/tokens';

export interface SkeletonProps {
  width?: DimensionValue;
  height: number;
  rounded?: keyof typeof radius;
}

/**
 * Placeholder block with fixed dimensions, so content replacing it never shifts
 * the layout. Pulses gently unless the system asks for reduced motion.
 */
export function Skeleton({ width = '100%', height, rounded = 'md' }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      opacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduced]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.block, { width, height, borderRadius: radius[rounded], opacity }]}
    />
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.surfaceMuted },
});
