import { Alert, Pressable, StyleSheet, View } from 'react-native';
import type { PaperQuestion, QuestionReview } from '@/lib/demo';
import { formatClock } from '@/lib/format';
import { Card, Chip, Icon, Text, type IconName } from '@/ui/primitives';
import { colors, radius, space } from '@/ui/tokens';

/**
 * One reviewed question (PRD 6.5 item review): stem, options with the correct
 * and chosen answers marked by icon and colour, solution, your time against the
 * average, percent correct, and bookmark/report actions. Shared by the result
 * screen and the practice lists (PRD 6.6).
 */
export interface ReviewItemProps {
  number: number;
  question: PaperQuestion;
  review: QuestionReview;
  language: 'en' | 'hi';
  onBookmark: () => void;
  onReport: () => void;
  /** Optional context line above the question, e.g. the test it came from. */
  context?: string;
}

/** Report flow shared by every review surface; the server routes it to the examiner (72-hour SLA). */
export function reportQuestion() {
  Alert.alert('Report this question', 'Tell us what is wrong. Our review team responds within 72 hours.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Wrong answer key', onPress: () => Alert.alert('Reported', 'Thanks. We will review the key and notify you.') },
    { text: 'Typo or unclear', onPress: () => Alert.alert('Reported', 'Thanks. We will review the wording.') },
  ]);
}

export function ReviewItem({ number, question, review, language, onBookmark, onReport, context }: ReviewItemProps) {
  const t = (b: { en: string; hi?: string }) => (language === 'hi' && b.hi ? b.hi : b.en);
  const skipped = review.selectedOptionId === undefined;
  const status = skipped
    ? { label: 'Skipped', tone: 'neutral' as const, icon: 'remove-circle-outline' as IconName }
    : review.isCorrect
      ? { label: 'Correct', tone: 'success' as const, icon: 'checkmark-circle-outline' as IconName }
      : { label: 'Wrong', tone: 'error' as const, icon: 'close-circle-outline' as IconName };
  const slower = review.yourTimeSeconds > review.averageTimeSeconds;

  return (
    <Card>
      {context ? (
        <Text variant="caption" tone="secondary" numberOfLines={1} style={{ marginBottom: space.xs }}>
          {context}
        </Text>
      ) : null}
      <View style={styles.itemTop}>
        <Text variant="bodySmallStrong" tone="secondary">
          Q{number} · {question.topic}
        </Text>
        <Chip label={status.label} tone={status.tone} icon={status.icon} />
      </View>
      <Text style={{ marginTop: space.sm }}>{t(question.stem)}</Text>

      <View style={styles.options}>
        {question.options.map((o) => {
          const isCorrect = o.id === review.correctOptionId;
          const isChosen = o.id === review.selectedOptionId;
          const icon: IconName | null = isCorrect ? 'checkmark-circle' : isChosen ? 'close-circle' : null;
          return (
            <View
              key={o.id}
              style={[styles.option, isCorrect && styles.optionCorrect, isChosen && !isCorrect && styles.optionWrong]}
              accessible
              accessibilityLabel={`Option ${o.id}: ${t(o.text)}${isCorrect ? ', correct answer' : ''}${isChosen ? ', your answer' : ''}`}
            >
              <Text variant="bodySmallStrong" tone={isCorrect ? 'success' : isChosen ? 'error' : 'secondary'} tabular>
                {o.id}
              </Text>
              <Text variant="bodySmall" style={{ flex: 1 }}>
                {t(o.text)}
              </Text>
              {icon ? <Icon name={icon} size={18} color={isCorrect ? colors.success : colors.error} /> : null}
            </View>
          );
        })}
      </View>

      <View style={styles.solution}>
        <Text variant="bodySmallStrong">Solution</Text>
        <Text variant="bodySmall" tone="secondary">
          {t(review.solution)}
        </Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem} accessible accessibilityLabel={`Your time ${formatClock(review.yourTimeSeconds)}, average ${formatClock(review.averageTimeSeconds)}`}>
          <Icon name="time-outline" size={16} color={slower ? colors.warning : colors.textSecondary} />
          <Text variant="caption" tone={slower ? 'warning' : 'secondary'} tabular>
            You {formatClock(review.yourTimeSeconds)} · Avg {formatClock(review.averageTimeSeconds)}
          </Text>
        </View>
        <View style={styles.statItem} accessible accessibilityLabel={`${review.percentCorrect} percent of students answered correctly`}>
          <Icon name="people-outline" size={16} color={colors.textSecondary} />
          <Text variant="caption" tone="secondary" tabular>
            {review.percentCorrect}% got it right
          </Text>
        </View>
      </View>

      <View style={styles.itemActions}>
        <Pressable onPress={onBookmark} accessibilityRole="button" accessibilityState={{ selected: review.bookmarked }} accessibilityLabel={review.bookmarked ? 'Remove bookmark' : 'Bookmark question'} style={styles.iconAction}>
          <Icon name={review.bookmarked ? 'bookmark' : 'bookmark-outline'} size={20} color={review.bookmarked ? colors.primary : colors.textSecondary} />
          <Text variant="bodySmallStrong" tone={review.bookmarked ? 'primary' : 'secondary'}>
            {review.bookmarked ? 'Saved' : 'Save'}
          </Text>
        </Pressable>
        <Pressable onPress={onReport} accessibilityRole="button" accessibilityLabel="Report a problem with this question" style={styles.iconAction}>
          <Icon name="flag-outline" size={20} color={colors.textSecondary} />
          <Text variant="bodySmallStrong" tone="secondary">
            Report
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  itemTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  options: { gap: space.sm, marginTop: space.md },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  optionCorrect: { borderColor: colors.success, backgroundColor: colors.successSoft },
  optionWrong: { borderColor: colors.error, backgroundColor: colors.errorSoft },
  solution: { marginTop: space.md, gap: space.xs, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, marginTop: space.md },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  itemActions: { flexDirection: 'row', gap: space.lg, marginTop: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.surfaceMuted },
  iconAction: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 44, paddingRight: space.sm },
});
