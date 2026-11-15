import { StyleSheet, View } from 'react-native';
import { Card, Skeleton } from '@/ui/primitives';
import { space } from '@/ui/tokens';

/**
 * Same footprint as TestCard so content replaces it without a layout jump.
 * Hidden from screen readers; the list announces "Loading tests" once instead.
 */
export function TestCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <Card style={compact ? styles.compact : undefined}>
      <View style={styles.row}>
        <Skeleton width={72} height={28} rounded="full" />
        <Skeleton width={88} height={28} rounded="full" />
      </View>
      <View style={styles.gap}>
        <Skeleton width="85%" height={22} />
        <Skeleton width="45%" height={16} />
      </View>
      <View style={[styles.row, styles.gap]}>
        <Skeleton width={64} height={16} />
        <Skeleton width={64} height={16} />
        <Skeleton width={96} height={16} />
      </View>
      <View style={[styles.footer, styles.gap]}>
        <Skeleton width={72} height={32} rounded="full" />
        <Skeleton width={56} height={20} />
      </View>
    </Card>
  );
}

export function TestListSkeleton({ count = 3, compact = false }: { count?: number; compact?: boolean }) {
  return (
    <View style={compact ? styles.rail : styles.list} accessible accessibilityLabel="Loading tests" accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, i) => (
        <TestCardSkeleton key={i} compact={compact} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  gap: { marginTop: space.md, gap: space.xs },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  list: { gap: space.md },
  rail: { flexDirection: 'row', gap: space.md },
  compact: { width: 280 },
});
