import { StyleSheet, View } from 'react-native';
import { getExam, getExaminer, type TestSummary } from '@/lib/demo';
import { formatCount, formatDuration, formatPaise } from '@/lib/format';
import { Card, Chip, Icon, Text } from '@/ui/primitives';
import { colors, space } from '@/ui/tokens';

export interface TestCardProps {
  test: TestSummary;
  hasAccess: boolean;
  onPress: () => void;
  /** Compact variant for horizontal rails. */
  compact?: boolean;
}

const kindLabel: Record<TestSummary['kind'], string> = {
  'full-mock': 'Mini mock',
  sectional: 'Sectional',
  pyq: 'Previous year',
};

/**
 * One test in a list or rail. Shows exam, language, question count, duration,
 * price and a single implied action (MASTER list rule). The whole card is the
 * tap target and its accessible name summarises everything a sighted user sees.
 */
export function TestCard({ test, hasAccess, onPress, compact = false }: TestCardProps) {
  const exam = getExam(test.examId);
  const examiner = getExaminer(test.examinerId);
  const price = formatPaise(test.pricePaise);
  const access = test.pricePaise === 0 ? 'Free' : hasAccess ? 'Owned' : price;

  const a11y = `${test.title}. ${exam?.shortName ?? ''}. ${test.questionCount} questions, ${formatDuration(
    test.durationMinutes,
  )}. ${access}. By ${examiner?.name ?? 'unknown examiner'}.`;

  return (
    <Card onPress={onPress} accessibilityLabel={a11y} style={compact ? styles.compact : undefined}>
      <View style={styles.top}>
        <Chip label={exam?.shortName ?? 'Exam'} tone="primary" />
        <Chip label={kindLabel[test.kind]} />
        {test.languages.includes('hi') ? <Chip label="EN · HI" icon="language-outline" /> : <Chip label="EN" />}
      </View>

      <Text variant="heading" numberOfLines={2} style={styles.title}>
        {test.title}
      </Text>
      <Text variant="bodySmall" tone="secondary" numberOfLines={1}>
        {examiner?.name}
      </Text>

      <View style={styles.meta}>
        <Meta icon="help-circle-outline" text={`${test.questionCount} Qs`} />
        <Meta icon="time-outline" text={formatDuration(test.durationMinutes)} />
        <Meta icon="people-outline" text={`${formatCount(test.attempts)} attempts`} />
      </View>

      <View style={styles.bottom}>
        {test.pricePaise === 0 ? (
          <Chip label="Free" tone="success" icon="gift-outline" />
        ) : hasAccess ? (
          <Chip label="Owned" tone="success" icon="checkmark-circle-outline" />
        ) : (
          <Text variant="bodyStrong">{price}</Text>
        )}
        <View style={styles.cta}>
          <Text variant="bodySmallStrong" tone="primary">
            {hasAccess || test.pricePaise === 0 ? 'Start' : 'View'}
          </Text>
          <Icon name="chevron-forward" size={16} color={colors.primary} />
        </View>
      </View>
    </Card>
  );
}

function Meta({ icon, text }: { icon: React.ComponentProps<typeof Icon>['name']; text: string }) {
  return (
    <View style={styles.metaItem}>
      <Icon name={icon} size={16} color={colors.textSecondary} />
      <Text variant="bodySmall" tone="secondary">
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  compact: { width: 280 },
  top: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  title: { marginTop: space.md },
  meta: { flexDirection: 'row', gap: space.lg, marginTop: space.md, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMuted,
  },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
