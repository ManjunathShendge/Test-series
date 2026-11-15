import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { reportQuestion, ReviewItem } from '@/features/results/ReviewItem';
import { buildPaper, getTest, type PaperQuestion } from '@/lib/demo';
import { formatDate } from '@/lib/format';
import { useAppStore } from '@/lib/store/app';
import { practiceEntries, useResultsList, useResultsStore, type PracticeList } from '@/lib/store/results';
import { Chip, Screen, StateView, Text } from '@/ui/primitives';
import { layout, space } from '@/ui/tokens';

const META: Record<PracticeList, { title: string; empty: string; emptyMessage: string }> = {
  mistakes: {
    title: 'Mistake notebook',
    empty: 'No mistakes yet',
    emptyMessage: 'Questions you answer wrongly collect here automatically, across every test.',
  },
  bookmarks: {
    title: 'Bookmarks',
    empty: 'Nothing saved yet',
    emptyMessage: 'Tap Save on any question in a result review to keep it here for revision.',
  },
};

/**
 * Practice lists (PRD 6.5 mistake notebook, 6.6 "mistake notebook and
 * bookmarks as practice lists"): every wrong or saved question across all
 * attempts, newest first, with its solution and the test it came from.
 */
export default function PracticeListScreen() {
  const params = useLocalSearchParams<{ list: string }>();
  const list: PracticeList = params.list === 'bookmarks' ? 'bookmarks' : 'mistakes';
  const router = useRouter();
  const results = useResultsList();
  const toggleBookmark = useResultsStore((s) => s.toggleBookmark);
  const language = useAppStore((s) => s.profile.language);

  const entries = useMemo(() => practiceEntries(results, list), [results, list]);
  const counts = useMemo(
    () => ({ mistakes: practiceEntries(results, 'mistakes').length, bookmarks: practiceEntries(results, 'bookmarks').length }),
    [results],
  );

  // Question text comes from the key-free paper; the solution comes from the review record.
  const questions = useMemo(() => {
    const map = new Map<string, PaperQuestion>();
    for (const testId of new Set(entries.map((e) => e.testId))) {
      const test = getTest(testId);
      if (test) for (const q of buildPaper(test).questions) map.set(`${testId}:${q.id}`, q);
    }
    return map;
  }, [entries]);

  const meta = META[list];
  const attemptCount = new Set(entries.map((e) => e.attemptId)).size;

  return (
    <>
      <Stack.Screen options={{ title: meta.title }} />
      <Screen scroll={false} padded={false} contentStyle={styles.content} edges={['left', 'right']}>
        <FlatList
          data={entries}
          keyExtractor={(e) => `${e.attemptId}:${e.review.questionId}`}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.tabs} accessibilityRole="tablist">
                <Chip label={`Mistakes (${counts.mistakes})`} icon="close-circle-outline" selected={list === 'mistakes'} onPress={() => router.setParams({ list: 'mistakes' })} />
                <Chip label={`Bookmarks (${counts.bookmarks})`} icon="bookmark-outline" selected={list === 'bookmarks'} onPress={() => router.setParams({ list: 'bookmarks' })} />
              </View>
              {entries.length > 0 ? (
                <Text variant="bodySmall" tone="secondary">
                  {entries.length === 1 ? '1 question' : `${entries.length} questions`} from {attemptCount === 1 ? '1 attempt' : `${attemptCount} attempts`}. Solutions show because these tests are already submitted.
                </Text>
              ) : null}
            </View>
          }
          renderItem={({ item, index }) => {
            const q = questions.get(`${item.testId}:${item.review.questionId}`);
            if (!q) return null;
            const test = getTest(item.testId);
            return (
              <View style={styles.item}>
                <ReviewItem
                  number={index + 1}
                  question={q}
                  review={item.review}
                  language={language}
                  context={`${test?.title ?? 'Test'} · ${formatDate(item.completedAt)}`}
                  onBookmark={() => toggleBookmark(item.attemptId, item.review.questionId)}
                  onReport={reportQuestion}
                />
              </View>
            );
          }}
          ListEmptyComponent={
            <StateView kind="empty" title={meta.empty} message={meta.emptyMessage} actionLabel="Find a test" onAction={() => router.push('/discover')} />
          }
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  content: { maxWidth: undefined, gap: 0 },
  list: { paddingBottom: space['2xl'] },
  header: { paddingHorizontal: layout.gutter, paddingTop: space.lg, gap: space.md },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  item: { paddingHorizontal: layout.gutter, paddingTop: space.md },
});
