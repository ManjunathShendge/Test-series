import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from '@/ui/primitives';
import { colors, space, touch } from '@/ui/tokens';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Heading row for a home/discover section with an optional "See all" affordance. */
export function SectionHeader({ title, subtitle, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.titles}>
        <Text variant="heading">{title}</Text>
        {subtitle ? (
          <Text variant="bodySmall" tone="secondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel}, ${title}`}
          hitSlop={8}
          style={styles.action}
        >
          <Text variant="bodySmallStrong" tone="primary">
            {actionLabel}
          </Text>
          <Icon name="chevron-forward" size={16} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  titles: { flex: 1, gap: 2 },
  action: { flexDirection: 'row', alignItems: 'center', minHeight: touch.minSize, paddingLeft: space.sm },
});
