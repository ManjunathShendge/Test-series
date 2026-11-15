import { StyleSheet, View } from 'react-native';
import { colors, radius } from '@/ui/tokens';

export interface ProgressBarProps {
  /** 0 to 1. */
  value: number;
  /** Full phrase for assistive tech, e.g. "Quantitative Aptitude 72 percent accuracy". */
  label: string;
  color?: string;
  height?: number;
}

/** Determinate bar with an accessible value; pair with visible text for the number. */
export function ProgressBar({ value, label, color = colors.primary, height = 8 }: ProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.track, { height, borderRadius: height / 2 }]}
    >
      <View style={[styles.fill, { width: `${clamped * 100}%`, backgroundColor: color, borderRadius: height / 2 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', backgroundColor: colors.surfaceMuted, overflow: 'hidden', borderRadius: radius.full },
  fill: { height: '100%' },
});
