import { StyleSheet, View } from 'react-native';
import type { Examiner, ExaminerTier } from '@/lib/catalogue/types';
import { formatCount } from '@/lib/format';
import { Avatar, Button, Card, Chip, Text, type ChipTone, type IconName } from '@/ui/primitives';
import { space } from '@/ui/tokens';

const tierMeta: Record<ExaminerTier, { label: string; tone: ChipTone; icon: IconName }> = {
  top: { label: 'Top examiner', tone: 'success', icon: 'ribbon-outline' },
  verified: { label: 'Verified', tone: 'primary', icon: 'shield-checkmark-outline' },
  new: { label: 'New', tone: 'neutral', icon: 'sparkles-outline' },
};

export interface ExaminerCardProps {
  examiner: Examiner;
  isFollowed: boolean;
  onPress: () => void;
  onToggleFollow: () => void;
}

/** Examiner summary with tier (icon + label, never colour alone) and a follow toggle. */
export function ExaminerCard({ examiner, isFollowed, onPress, onToggleFollow }: ExaminerCardProps) {
  const tier = tierMeta[examiner.tier];
  return (
    <Card onPress={onPress} accessibilityLabel={`${examiner.name}, ${tier.label}, ${formatCount(examiner.followers)} followers`}>
      <View style={styles.row}>
        <Avatar name={examiner.name} size={48} />
        <View style={styles.body}>
          <Text variant="heading" numberOfLines={1}>
            {examiner.name}
          </Text>
          <Text variant="bodySmall" tone="secondary" numberOfLines={2}>
            {examiner.credentials}
          </Text>
          <View style={styles.meta}>
            <Chip label={tier.label} tone={tier.tone} icon={tier.icon} />
            <Text variant="bodySmall" tone="secondary">
              {formatCount(examiner.followers)} followers{examiner.publishedTests > 0 ? ` · ${examiner.publishedTests} tests` : ''}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.actions}>
        <Button
          label={isFollowed ? 'Following' : 'Follow'}
          variant={isFollowed ? 'secondary' : 'primary'}
          icon={isFollowed ? 'checkmark' : 'add'}
          onPress={onToggleFollow}
          accessibilityLabel={isFollowed ? `Unfollow ${examiner.name}` : `Follow ${examiner.name}`}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md },
  body: { flex: 1, gap: space.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap', marginTop: space.xs },
  actions: { marginTop: space.lg, flexDirection: 'row' },
});
