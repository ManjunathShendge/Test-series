import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { PracticeKind, type PracticeItem } from '@exam-prep/contracts';
import { usePractice } from '@/features/results/queries';
import { SolutionItem, type SolutionData } from '@/features/results/SolutionItem';
import { Chip, StateView, Text } from '@/ui/primitives';
import { colors, space } from '@/ui/tokens';

const COPY: Record<PracticeKind, { title: string; lead: string; empty: string }> = {
  mistakes: {
    title: 'Mistake notebook',
    lead: 'Every question you got wrong. Mark one as mastered once you have it.',
    empty: 'Questions you get wrong in a test land here automatically.',
  },
  bookmarks: { title: 'Bookmarks', lead: 'Questions you saved while reviewing results.', empty: 'Bookmark questions from any result’s solutions.' },
};

/** PRD 6.6 practice lists, from the student's closed attempts on the server. */
export default function PracticeScreen() {
  const { list } = useLocalSearchParams<{ list: string }>();
  const router = useRouter();
  const kind = PracticeKind.safeParse(list).success ? (list as PracticeKind) : 'mistakes';
  const query = usePractice(kind);
  const [hidden, setHidden] = useState<string[]>([]);
  const [hi, setHi] = useState(false);
  const copy = COPY[kind];
  const items = (query.data ?? []).filter((i) => !hidden.includes(i.questionId));

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: copy.title }} />
      {query.isError ? (
        <StateView kind="error" title="Couldn’t load this list" message="Please try again in a moment." actionLabel="Try again" onAction={() => void query.refetch()} />
      ) : !query.data ? (
        <StateView kind="empty" title="Loading" message="Fetching your saved questions." />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.questionId}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={{ gap: space.sm }}>
              <Text tone="secondary">{copy.lead}</Text>
              {items.some((i) => i.stemHi) ? (
                <View style={{ flexDirection: 'row' }}>
                  <Chip label="हिन्दी" selected={hi} onPress={() => setHi(!hi)} />
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <StateView kind="empty" title={`No ${kind === 'mistakes' ? 'mistakes' : 'bookmarks'} yet`} message={copy.empty} actionLabel="Find a test" onAction={() => router.push('/discover')} />
          }
          renderItem={({ item, index }) => (
            <SolutionItem
              q={toItem(item, index)}
              hi={hi}
              onChange={(next) => {
                if ((kind === 'mistakes' && !next.inNotebook) || (kind === 'bookmarks' && !next.bookmarked)) setHidden((h) => [...h, item.questionId]);
              }}
            />
          )}
        />
      )}
    </View>
  );
}

function toItem(item: PracticeItem, index: number): SolutionData {
  return {
    questionId: item.questionId,
    attemptId: item.attemptId,
    label: `${index + 1}`,
    context: item.testTitle,
    subject: item.subject,
    topic: item.topic,
    stemEn: item.stemEn,
    stemHi: item.stemHi,
    passageEn: item.passageEn,
    passageHi: item.passageHi,
    options: item.options,
    imageAssetIds: item.imageAssetIds,
    selected: item.selected,
    correctOption: item.correctOption,
    solutionEn: item.solutionEn,
    solutionHi: item.solutionHi,
    bookmarked: item.bookmarked,
    inNotebook: item.inNotebook,
  };
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { padding: space.lg, gap: space.md },
});
