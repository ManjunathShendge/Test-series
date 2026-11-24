import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { MIN_COHORT } from '@exam-prep/contracts';
import { useReview } from '@/features/results/queries';
import { ApiRequestError } from '@/lib/api/http';
import { Button, Card, Icon, ProgressBar, Screen, StateView, Text } from '@/ui/primitives';
import { colors, radius, space } from '@/ui/tokens';

const num = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const share = (score: number, max: number) => (max > 0 ? Math.max(0, Math.min(1, score / max)) : 0);
const mins = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : `${Math.round(s / 60)} min`);

/** PRD 6.5 result: the server's score, comparison and analysis. Nothing is scored on the phone. */
export default function ResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const query = useReview(id);
  const data = query.data;

  const topics = useMemo(() => {
    const map = new Map<string, { topic: string; attempted: number; correct: number; total: number }>();
    for (const q of data?.questions ?? []) {
      const key = q.topic ?? 'Other';
      const t = map.get(key) ?? { topic: key, attempted: 0, correct: 0, total: 0 };
      t.total++;
      if (q.selected) t.attempted++;
      if (q.isCorrect) t.correct++;
      map.set(key, t);
    }
    return [...map.values()].sort((a, b) => a.correct / Math.max(1, a.attempted) - b.correct / Math.max(1, b.attempted));
  }, [data]);

  if (query.isError) {
    const e = query.error;
    if (e instanceof ApiRequestError && e.code === 'ATTEMPT_IN_PROGRESS')
      return (
        <Screen edges={['left', 'right']}>
          <Stack.Screen options={{ title: 'Result' }} />
          <StateView
            kind="empty"
            title="This test is still running"
            message="Your result appears here once you submit or the time runs out."
            actionLabel="Continue the test"
            onAction={() => router.replace({ pathname: '/attempt/[id]', params: { id } })}
          />
        </Screen>
      );
    const offline = e instanceof ApiRequestError && e.code === 'NETWORK';
    return (
      <Screen edges={['left', 'right']}>
        <Stack.Screen options={{ title: 'Result' }} />
        <StateView
          kind={offline ? 'offline' : 'error'}
          title={offline ? 'You’re offline' : 'Couldn’t load your result'}
          message={offline ? 'Connect to the internet to see your result.' : 'Please try again in a moment.'}
          actionLabel="Try again"
          onAction={() => void query.refetch()}
        />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen edges={['left', 'right']}>
        <Stack.Screen options={{ title: 'Result' }} />
        <StateView kind="empty" title="Loading your result" message="Fetching your result from the server." />
      </Screen>
    );
  }

  const s = data.summary;
  const accuracy = s.attempted ? Math.round((s.correct / s.attempted) * 100) : 0;
  const enough = data.cohort.size >= MIN_COHORT;

  return (
    <>
      <Stack.Screen options={{ title: 'Result' }} />
      <Screen edges={['left', 'right']}>
        <View style={styles.hero} accessible accessibilityLabel={`You scored ${num(s.score)} out of ${num(s.maxScore)}`}>
          <Text variant="caption" style={styles.heroLabel} numberOfLines={2}>
            {s.testTitle}
          </Text>
          <Text variant="display" tabular style={styles.heroScore}>
            {num(s.score)}
            <Text variant="title" style={styles.heroLabel}>
              {' '}
              / {num(s.maxScore)}
            </Text>
          </Text>
          <Text variant="bodySmall" style={styles.heroLabel}>
            {s.status === 'timed_out' ? 'Time ran out, so the test was submitted automatically.' : 'Submitted.'} Time taken {mins(data.timeSeconds)}.
          </Text>
        </View>

        <View style={styles.grid}>
          <Stat label={s.rank !== null ? `Rank of ${s.rankedAttempts}` : 'Rank counts first attempts only'} value={s.rank !== null ? `#${s.rank}` : '—'} />
          <Stat label="Percentile" value={s.percentile !== null ? num(s.percentile) : '—'} />
          <Stat label="Correct" value={String(s.correct)} color={colors.success} />
          <Stat label="Wrong" value={String(s.incorrect)} color={colors.error} />
          <Stat label="Not answered" value={String(s.skipped)} />
          <Stat label={`Accuracy (${s.attempted} attempted)`} value={`${accuracy}%`} />
        </View>

        {s.lateEvents > 0 ? (
          <View style={styles.warn}>
            <Icon name="time-outline" size={16} color={colors.warning} />
            <Text variant="bodySmall" tone="warning" style={{ flex: 1 }}>
              {s.lateEvents} change{s.lateEvents === 1 ? '' : 's'} reached us after time was up and {s.lateEvents === 1 ? 'was' : 'were'} not counted.
            </Text>
          </View>
        ) : null}

        <Button label="Review solutions" icon="book-outline" fullWidth onPress={() => router.push({ pathname: '/attempt/[id]/review', params: { id } })} />

        <View style={{ gap: space.md }}>
          <Text variant="heading">How you compare</Text>
          <Card>
            {enough ? (
              <View style={{ gap: space.md }}>
                <Compare label="You" value={s.score} max={s.maxScore} color={colors.primary} />
                <Compare label="Average" value={data.cohort.averageScore ?? 0} max={s.maxScore} color={colors.textSecondary} />
                <Compare label="Topper" value={data.cohort.topperScore ?? 0} max={s.maxScore} color={colors.success} />
                <Text variant="caption" tone="secondary">
                  Based on {data.cohort.size} students’ first attempts.
                </Text>
              </View>
            ) : (
              <Text tone="secondary">
                Not enough data yet: {data.cohort.size} student{data.cohort.size === 1 ? ' has' : 's have'} finished this test. Comparisons appear once {MIN_COHORT} have.
              </Text>
            )}
          </Card>
        </View>

        {s.sections.length > 1 ? (
          <View style={{ gap: space.md }}>
            <Text variant="heading">Section scores</Text>
            <Card>
              <View style={{ gap: space.lg }}>
                {s.sections.map((x) => (
                  <View key={x.sectionId} style={{ gap: space.xs }} accessible accessibilityLabel={`${x.name}: ${num(x.score)} of ${num(x.maxScore)}`}>
                    <View style={styles.rowBetween}>
                      <Text variant="bodyStrong">{x.name}</Text>
                      <Text variant="bodyStrong" tabular>
                        {num(x.score)} / {num(x.maxScore)}
                      </Text>
                    </View>
                    <ProgressBar value={share(x.score, x.maxScore)} label={`${x.name} score`} />
                    <Text variant="caption" tone="secondary">
                      {x.correct} correct · {x.incorrect} wrong · {x.attempted}/{x.total} attempted
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          </View>
        ) : null}

        <View style={{ gap: space.md }}>
          <Text variant="heading">Topic analysis</Text>
          <Card>
            <View style={{ gap: space.md }}>
              {topics.map((t) => {
                const acc = t.attempted ? t.correct / t.attempted : 0;
                return (
                  <View key={t.topic} style={{ gap: space.xs }}>
                    <View style={styles.rowBetween}>
                      <Text variant="bodySmallStrong" style={{ flex: 1 }} numberOfLines={1}>
                        {t.topic}
                      </Text>
                      <Text variant="bodySmall" tone="secondary" tabular>
                        {t.correct}/{t.attempted} · {t.attempted ? `${Math.round(acc * 100)}%` : '—'}
                      </Text>
                    </View>
                    <ProgressBar value={acc} label={`${t.topic} accuracy`} color={acc >= 0.7 ? colors.success : acc >= 0.4 ? colors.warning : colors.error} />
                  </View>
                );
              })}
            </View>
          </Card>
        </View>

        <Button label="My progress" icon="analytics-outline" variant="secondary" fullWidth onPress={() => router.push('/progress')} />
        <Button label="Back to Home" icon="home-outline" variant="ghost" fullWidth onPress={() => router.replace('/')} />
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

function Compare({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <View style={{ gap: space.xs }} accessible accessibilityLabel={`${label}: ${num(value)}`}>
      <View style={styles.rowBetween}>
        <Text variant="bodySmallStrong">{label}</Text>
        <Text variant="bodySmallStrong" tabular>
          {num(value)}
        </Text>
      </View>
      <ProgressBar value={share(value, max)} label={label} color={color} />
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
