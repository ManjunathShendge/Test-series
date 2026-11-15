import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, space, touch } from '@/ui/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ChipTone = 'neutral' | 'primary' | 'success' | 'warning' | 'error' | 'review';

const tones: Record<ChipTone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: colors.surfaceMuted, fg: colors.textSecondary, border: colors.border },
  primary: { bg: colors.primarySoft, fg: colors.primary, border: colors.primarySoft },
  success: { bg: colors.successSoft, fg: colors.success, border: colors.successSoft },
  warning: { bg: colors.warningSoft, fg: colors.warning, border: colors.warningSoft },
  error: { bg: colors.errorSoft, fg: colors.error, border: colors.errorSoft },
  review: { bg: colors.reviewSoft, fg: colors.review, border: colors.reviewSoft },
};

export interface ChipProps {
  label: string;
  tone?: ChipTone;
  /** Status chips always pair the colour with an icon, so meaning survives colour-blindness. */
  icon?: IconName;
  selected?: boolean;
  onPress?: () => void;
}

/**
 * Compact label. Static chips are informational; with onPress they become a
 * filter toggle with a 48dp hit area and announced selected state.
 */
export function Chip({ label, tone = 'neutral', icon, selected = false, onPress }: ChipProps) {
  const theme = selected ? tones.primary : tones[tone];
  const body = (
    <View
      style={[
        styles.chip,
        { backgroundColor: theme.bg, borderColor: selected ? colors.primary : theme.border },
      ]}
    >
      {icon ? <Icon name={icon} size={16} color={theme.fg} /> : null}
      <Text variant="bodySmallStrong" style={{ color: theme.fg }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      style={styles.hit}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { minHeight: touch.minSize, justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm - 2,
    borderRadius: radius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
});
