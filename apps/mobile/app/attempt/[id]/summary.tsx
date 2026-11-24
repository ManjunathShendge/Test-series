import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { attemptsApi } from '@/lib/api/attempts';
import { ApiRequestError } from '@/lib/api/http';
import { Button, Card, Icon, ProgressBar, Screen, StateView, Text } from '@/ui/primitives';
import { colors, radius, space } from '@/ui/tokens';

const num = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const share = (score: number, max: number) => (max > 0 ? Math.max(0, Math.min(1, score / max)) : 0);

/** The server's score for a closed attempt. Nothing here is computed on the phone. */
export default function AttemptSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const query = useQuery({ queryKey: ['attempt', id, 'summary'], queryFn: () => attemptsApi.summary(id) });
  const data = query.data;

  if (query.isError) {
    const offline = query.error instanceof ApiRequestError && query.error.code === 'NETWORK';
    return (
      <Screen edges={['left', 'right']}>
        <Stack.Screen options={{ title: 'Score' }} />
        <StateView
          kind={offline ? 'offline' : 'error'}
          title={offline ? 'You’re offline' : 'Couldn’t load your score'}
          message={offline ? 'Connect to the internet to see your score.' : 'Please try again in a moment.'}
          actionLabel="Try again"
          onAction={() => void query.refetch()}
        />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen edges={['left', 'right']}>
        <Stack.Screen options={{ title: 'Score' }} />
        <StateView kind="empty" title="Loading your score" message="Fetching your result from the server." />
      </Screen>
    );
  }
  if (data.status === 'in_progress') {
    return (
      <Screen edges={['left', 'right']}>
        <Stack.Screen options={{ title: 'Score' }} />
        <StateView
          kind="empty"
          title="This test is still running"
          message="Your score appears here once you submit or the time runs out."
          actionLabel="Continue the test"
          onAction={() => router.replace({ pathname: '/attempt/[id]', params: { id } })}
        />
      </Screen>
    );
  }

  const accuracy = data.attempted ? Math.round((data.correct / data.attempted) * 100) : 0;
  return (
    <>
      <Stack.Screen options={{ title: 'Score' }} />
      <Screen edges={['left', 'right']}>
        <View style={styles.hero} accessible accessibilityLabel={`You scored ${num(data.score)} out of ${num(data.maxScore)}`}>
          <Text variant="caption" style={styles.heroLabel}>
            {data.testTitle}
          </Text>
          <Text variant="display" tabular style={styles.heroScore}>
            {num(data.score)}
            <Text variant="title" style={styles.heroLabel}>
              {' '}
              / {num(data.maxScore)}
            </Text>
          </Text>
          <Text variant="bodySmall" style={styles.heroLabel}>
            {data.status === 'timed_out' ? 'Time ran out, so the test was submitted automatically.' : 'Submitted.'}
          </Text>
        </View>

        <View style={styles.grid}>
          <Stat label={data.rank !== null ? `Rank of ${data.rankedAttempts}` : 'Rank counts first attempts only'} value={data.rank !== null ? `#${data.rank}` : '—'} />
          <Stat label="Percentile" value={data.percentile !== null ? num(data.percentile) : '—'} />
          <Stat label="Correct" value={String(data.correct)} color={colors.success} />
          <Stat label="Wrong" value={String(data.incorrect)} color={colors.error} />
          <Stat label="Not answered" value={String(data.skipped)} />
          <Stat label={`Accuracy (${data.attempted} attempted)`} value={`${accuracy}%`} />
        </View>

        {data.lateEvents > 0 ? (
          <View style={styles.warn}>
            <Icon name="time-outline" size={16} color={colors.warning} />
            <Text variant="bodySmall" tone="warning" style={{ flex: 1 }}>
              {data.lateEvents} change{data.lateEvents === 1 ? '' : 's'} reached us after time was up and {data.lateEvents === 1 ? 'was' : 'were'} not counted.
            </Text>
          </View>
        ) : null}

        {data.sections.length > 1 ? (
          <View style={{ gap: space.md }}>
            <Text variant="heading">Section scores</Text>
            <Card>
              <View style={{ gap: space.lg }}>
                {data.sections.map((s) => (
                  <View key={s.sectionId} style={{ gap: space.xs }} accessible accessibilityLabel={`${s.name}: ${num(s.score)} of ${num(s.maxScore)}, ${s.correct} correct, ${s.incorrect} wrong`}>
                    <View style={styles.rowBetween}>
                      <Text variant="bodyStrong">{s.name}</Text>
                      <Text variant="bodyStrong" tabular>
                        {num(s.score)} / {num(s.maxScore)}
                      </Text>
                    </View>
                    <ProgressBar value={share(s.score, s.maxScore)} label={`${s.name} score`} />
                    <Text variant="caption" tone="secondary">
                      {s.correct} correct · {s.incorrect} wrong · {s.attempted}/{s.total} attempted
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          </View>
        ) : null}

        <Button label="Back to Home" icon="home-outline" fullWidth onPress={() => router.replace('/')} />
      </Screen>
    </>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="title" tabular style={color ? { color } : undefined}>
        {value}
      </Text>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: space.xs, padding: space.xl, borderRadius: radius.lg, backgroundColor: colors.inverse },
  heroLabel: { color: colors.onInverseSecondary },
  heroScore: { color: colors.onInverse },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  stat: { flexBasis: '45%', flexGrow: 1, gap: 2, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  warn: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', padding: space.md, borderRadius: radius.md, backgroundColor: colors.warningSoft },
});
