import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import type { ReviewQuestion } from '@exam-prep/contracts';
import { useReview } from '@/features/results/queries';
import { SolutionItem, type SolutionData } from '@/features/results/SolutionItem';
import { Chip, StateView, Text } from '@/ui/primitives';
import { colors, space } from '@/ui/tokens';

type Filter = 'all' | 'wrong' | 'right' | 'skipped' | 'marked';
const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['wrong', 'Wrong'],
  ['right', 'Correct'],
  ['skipped', 'Not answered'],
  ['marked', 'Marked'],
];
const matches = (q: ReviewQuestion, f: Filter) =>
  f === 'all' ? true : f === 'wrong' ? q.isCorrect === false : f === 'right' ? q.isCorrect === true : f === 'skipped' ? !q.selected : q.marked;

/** PRD 6.5 solution review for a closed attempt, with bookmark and report on each question. */
export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useReview(id);
  const [filter, setFilter] = useState<Filter>('all');
  const [hi, setHi] = useState(false);
  const data = query.data;

  if (query.isError)
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: 'Solutions' }} />
        <StateView kind="error" title="Couldn’t load the solutions" message="Please try again in a moment." actionLabel="Try again" onAction={() => void query.refetch()} />
      </View>
    );
  if (!data)
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: 'Solutions' }} />
        <StateView kind="empty" title="Loading solutions" message="Fetching your answers and the solutions." />
      </View>
    );

  const shown = data.questions.filter((q) => matches(q, filter));
  const hasHindi = data.questions.some((q) => q.stemHi);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Solutions' }} />
      <FlatList
        data={shown}
        keyExtractor={(q) => q.testQuestionId}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {FILTERS.map(([f, label]) => (
              <Chip key={f} label={`${label} (${data.questions.filter((q) => matches(q, f)).length})`} selected={filter === f} onPress={() => setFilter(f)} />
            ))}
            {hasHindi ? <Chip label="हिन्दी" selected={hi} onPress={() => setHi(!hi)} /> : null}
          </ScrollView>
        }
        ListEmptyComponent={<Text tone="secondary">No questions in this view.</Text>}
        renderItem={({ item }) => <SolutionItem q={toItem(item, id)} hi={hi} />}
      />
    </View>
  );
}

function toItem(q: ReviewQuestion, attemptId: string): SolutionData {
  return {
    questionId: q.questionId,
    attemptId,
    label: `Q${q.number}`,
    subject: q.subject,
    topic: q.topic,
    stemEn: q.stemEn,
    stemHi: q.stemHi,
    passageEn: q.passageEn,
    passageHi: q.passageHi,
    options: q.options,
    imageAssetIds: q.imageAssetIds,
    selected: q.selected,
    correctOption: q.correctOption,
    solutionEn: q.solutionEn,
    solutionHi: q.solutionHi,
    bookmarked: q.bookmarked,
    inNotebook: q.inNotebook,
    reported: q.reported,
    keyCorrected: q.keyCorrected,
    marksAwarded: q.marksAwarded,
    timeSeconds: q.timeSeconds,
    cohort: q.cohort,
  };
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { padding: space.lg, gap: space.md },
  filters: { gap: space.sm, paddingBottom: space.sm },
});
