import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { announce } from '@/lib/a11y';
import { reportQuestion, ReviewItem } from '@/features/results/ReviewItem';
import { buildPaper, getExam, getTest } from '@/lib/demo';
import { formatCount, formatDate, formatOrdinal } from '@/lib/format';
import { useAppStore } from '@/lib/store/app';
import { useResultsStore } from '@/lib/store/results';
import { Button, Card, Chip, Icon, ProgressBar, Screen, Skeleton, StateView, Text, type IconName } from '@/ui/primitives';
import { colors, layout, radius, space } from '@/ui/tokens';

type Filter = 'all' | 'wrong' | 'skipped' | 'bookmarked';

/**
 * Result and review (PRD 6.5, docs/RESULTS.md): score, rank, percentile with
 * its definition, sectional breakdown, topper/average benchmark and the
 * question-by-question review with solutions, time and percent-correct.
 */
export default function ResultScreen() {
  const { attemptId, fresh } = useLocalSearchParams<{ attemptId: string; fresh?: string }>();
  const router = useRouter();
  const result = useResultsStore((s) => s.results[attemptId]);
  const toggleBookmark = useResultsStore((s) => s.toggleBookmark);
  const language = useAppStore((s) => s.profile.language);
  const [filter, setFilter] = useState<Filter>('all');
  // Straight after submit the server scores and ranks the attempt (results.score job).
  const [scoring, setScoring] = useState(fresh === '1');
  useEffect(() => {
    if (!scoring) return;
    const t = setTimeout(() => {
      setScoring(false);
      announce('Your result is ready');
    }, 1400);
    return () => clearTimeout(t);
  }, [scoring]);

  const test = result ? getTest(result.testId) : undefined;
  const paper = useMemo(() => (test ? buildPaper(test) : undefined), [test]);
  const questionIndex = useMemo(() => new Map(paper?.questions.map((q) => [q.id, q]) ?? []), [paper]);

  if (scoring) {
    return (
      <Screen edges={['left', 'right']}>
        <View style={styles.scoring} accessible accessibilityRole="progressbar" accessibilityLabel="Calculating your score">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text variant="heading" align="center">
            Calculating your score
          </Text>
          <Text tone="secondary" align="center">
            Checking answers and comparing you with everyone who took this test.
          </Text>
        </View>
        <Skeleton height={180} rounded="lg" />
        <Skeleton height={140} rounded="lg" />
      </Screen>
    );
  }

  if (!result || !test || !paper) {
    return (
      <Screen>
        <StateView kind="error" title="Result not available" message="This attempt has no result yet, or it belongs to another account." actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }

  const exam = getExam(test.examId);
  const filtered = result.review.filter((r) => {
    if (filter === 'wrong') return r.selectedOptionId !== undefined && !r.isCorrect;
    if (filter === 'skipped') return r.selectedOptionId === undefined;
    if (filter === 'bookmarked') return r.bookmarked;
    return true;
  });

  const counts = {
    wrong: result.review.filter((r) => r.selectedOptionId !== undefined && !r.isCorrect).length,
    skipped: result.review.filter((r) => r.selectedOptionId === undefined).length,
    bookmarked: result.review.filter((r) => r.bookmarked).length,
  };

  const header = (
    <View style={styles.header}>
      <View style={styles.chips}>
        <Chip label={exam?.shortName ?? 'Exam'} tone="primary" />
        {result.status === 'auto_submitted' ? (
          <Chip label="Auto-submitted at deadline" tone="warning" icon="alarm-outline" />
        ) : (
          <Chip label="Submitted" tone="success" icon="checkmark-circle-outline" />
        )}
      </View>
      <Text variant="title">{test.title}</Text>
      <Text variant="bodySmall" tone="secondary">
        {formatDate(result.completedAt)}
      </Text>

      <Card>
        <View style={styles.scoreRow}>
          <View>
            <Text variant="caption" tone="secondary">
              Score
            </Text>
            <View style={styles.scoreLine}>
              <Text variant="display" tabular>
                {Number(result.score.toFixed(2))}
              </Text>
              <Text variant="heading" tone="secondary" tabular>
                / {result.maxScore}
              </Text>
            </View>
          </View>
          <View style={styles.rankBox}>
            <Text variant="caption" tone="secondary">
              Rank
            </Text>
            <Text variant="title" tabular>
              {formatOrdinal(result.rank)}
            </Text>
            <Text variant="caption" tone="secondary">
              of {formatCount(result.cohortSize)}
            </Text>
          </View>
        </View>

        <View style={styles.tally}>
          <Tally icon="checkmark-circle" color={colors.success} label="Correct" value={result.correct} />
          <Tally icon="close-circle" color={colors.error} label="Wrong" value={result.wrong} />
          <Tally icon="remove-circle" color={colors.textSecondary} label="Skipped" value={result.skipped} />
        </View>

        <View style={styles.percentile}>
          <Text variant="bodyStrong" tabular>
            {result.percentile.toFixed(1)} percentile
          </Text>
          <Text variant="caption" tone="secondary">
            Share of the cohort who scored strictly lower. Cohort: first completed attempt per student, snapshot of {formatCount(result.cohortSize)}.
          </Text>
        </View>
      </Card>

      <Card>
        <Text variant="heading">Benchmark</Text>
        <View style={styles.benchRows}>
          <Bench label="You" value={result.score} max={result.maxScore} color={colors.primary} />
          <Bench label="Average" value={result.averageScore} max={result.maxScore} color={colors.borderStrong} />
          <Bench label="Topper" value={result.topperScore} max={result.maxScore} color={colors.success} />
        </View>
      </Card>

      <Card>
        <Text variant="heading">Sections</Text>
        <View style={styles.benchRows}>
          {result.sections.map((s) => (
            <View key={s.sectionId} style={styles.sectionRow} accessible accessibilityLabel={`${s.name}: ${s.score} of ${s.maxScore}, ${s.correct} correct, ${s.wrong} wrong, ${s.skipped} skipped, ${s.timeSpentMinutes} minutes`}>
              <View style={styles.sectionHead}>
                <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                  {s.name}
                </Text>
                <Text variant="bodyStrong" tabular>
                  {Number(s.score.toFixed(2))}/{s.maxScore}
                </Text>
              </View>
              <ProgressBar value={s.maxScore ? Math.max(0, s.score) / s.maxScore : 0} label={`${s.name} score`} />
              <Text variant="caption" tone="secondary">
                {s.correct} correct · {s.wrong} wrong · {s.skipped} skipped · {s.timeSpentMinutes} min
              </Text>
            </View>
          ))}
        </View>
      </Card>

      <View style={styles.reviewHead}>
        <Text variant="heading">Question review</Text>
        <View style={styles.filters}>
          <Chip label={`All (${result.review.length})`} selected={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label={`Wrong (${counts.wrong})`} icon="close-circle-outline" selected={filter === 'wrong'} onPress={() => setFilter('wrong')} />
          <Chip label={`Skipped (${counts.skipped})`} icon="remove-circle-outline" selected={filter === 'skipped'} onPress={() => setFilter('skipped')} />
          <Chip label={`Saved (${counts.bookmarked})`} icon="bookmark-outline" selected={filter === 'bookmarked'} onPress={() => setFilter('bookmarked')} />
        </View>
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Result' }} />
      <Screen scroll={false} padded={false} contentStyle={styles.content} edges={['left', 'right']}>
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.questionId}
          ListHeaderComponent={header}
          renderItem={({ item, index }) => {
            const q = questionIndex.get(item.questionId);
            return q ? (
              <View style={styles.item}>
                <ReviewItem
                  number={result.review.findIndex((r) => r.questionId === item.questionId) + 1 || index + 1}
                  question={q}
                  review={item}
                  language={language}
                  onBookmark={() => toggleBookmark(result.attemptId, item.questionId)}
                  onReport={reportQuestion}
                />
              </View>
            ) : null;
          }}
          ListEmptyComponent={<StateView kind="empty" title="Nothing here" message="No questions match this filter." />}
          ListFooterComponent={
            <View style={styles.footer}>
              <Button label="Reattempt this test" variant="secondary" icon="refresh" fullWidth onPress={() => router.push({ pathname: '/test/[id]', params: { id: test.id } })} />
              <Text variant="caption" tone="secondary" align="center">
                Reattempts are practice only and do not change your rank.
              </Text>
            </View>
          }
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      </Screen>
    </>
  );
}

function Tally({ icon, color, label, value }: { icon: IconName; color: string; label: string; value: number }) {
  return (
    <View style={styles.tallyItem} accessible accessibilityLabel={`${value} ${label.toLowerCase()}`}>
      <Icon name={icon} size={18} color={color} />
      <Text variant="bodyStrong" tabular>
        {value}
      </Text>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

function Bench({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <View style={styles.bench}>
      <View style={styles.benchLabel}>
        <Text variant="bodySmall" tone="secondary">
          {label}
        </Text>
        <Text variant="bodySmallStrong" tabular>
          {Number(value.toFixed(1))}
        </Text>
      </View>
      <ProgressBar value={max ? Math.max(0, value) / max : 0} label={`${label} ${Number(value.toFixed(1))} of ${max}`} color={color} height={10} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { maxWidth: undefined, gap: 0 },
  scoring: { alignItems: 'center', gap: space.md, paddingVertical: space['2xl'] },
  list: { paddingBottom: space['2xl'] },
  header: { paddingHorizontal: layout.gutter, paddingTop: space.lg, gap: space.lg },
  chips: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  scoreLine: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  rankBox: { alignItems: 'flex-end', gap: 2 },
  tally: { flexDirection: 'row', gap: space.md, marginTop: space.lg, paddingTop: space.lg, borderTopWidth: 1, borderTopColor: colors.surfaceMuted },
  tallyItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  percentile: { marginTop: space.lg, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, gap: 2 },
  benchRows: { gap: space.md, marginTop: space.md },
  bench: { gap: space.xs },
  benchLabel: { flexDirection: 'row', justifyContent: 'space-between' },
  sectionRow: { gap: space.xs },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  reviewHead: { gap: space.md },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  item: { paddingHorizontal: layout.gutter, paddingTop: space.md },
  footer: { paddingHorizontal: layout.gutter, paddingTop: space.xl, gap: space.sm },
});
