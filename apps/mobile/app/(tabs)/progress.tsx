import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SectionHeader } from '@/features/catalogue/components/SectionHeader';
import { cutoffOnTrendScale, getExam, getTest, recommendedTests, scoreTrend, topicStrengths } from '@/lib/demo';
import { formatDate, formatOrdinal } from '@/lib/format';
import { useAppStore } from '@/lib/store/app';
import { useResultsList } from '@/lib/store/results';
import { Card, Chip, Icon, ProgressBar, Screen, StateView, Text } from '@/ui/primitives';
import { colors, radius, space } from '@/ui/tokens';

const CHART_HEIGHT = 140;

/**
 * Progress (PRD 6.6): topic strength map, score trend with the admin cutoff
 * line, recent results, and practice lists (mistake notebook, bookmarks). Every
 * chart has a text equivalent; streaks and goals are a later phase and absent.
 */
export default function ProgressScreen() {
  const router = useRouter();
  const results = useResultsList();
  const profile = useAppStore((s) => s.profile);
  const attempted = useAppStore((s) => s.attemptedTestIds);

  const weakest = useMemo(() => [...topicStrengths].sort((a, b) => a.accuracy - b.accuracy).slice(0, 3), []);
  const strongest = useMemo(() => [...topicStrengths].sort((a, b) => b.accuracy - a.accuracy).slice(0, 3), []);
  const suggested = useMemo(() => recommendedTests(profile.targetExamIds, new Set(attempted)).slice(0, 2), [profile.targetExamIds, attempted]);
  const mistakes = results.reduce((n, r) => n + r.review.filter((q) => q.selectedOptionId !== undefined && !q.isCorrect).length, 0);
  const bookmarks = results.reduce((n, r) => n + r.review.filter((q) => q.bookmarked).length, 0);

  if (results.length === 0) {
    return (
      <Screen>
        <Text variant="display">Progress</Text>
        <StateView kind="empty" title="No attempts yet" message="Your topic strength map, score trend and mistake notebook build up as you attempt tests." actionLabel="Find a free test" onAction={() => router.push('/discover')} />
      </Screen>
    );
  }

  const cutoffRatio = cutoffOnTrendScale.score / cutoffOnTrendScale.maxScore;
  const latest = scoreTrend[scoreTrend.length - 1];
  const trendSummary = `Scores over ${scoreTrend.length} tests: ${scoreTrend.map((p) => p.score).join(', ')} out of ${latest?.maxScore ?? 80}. ${cutoffOnTrendScale.label} is ${cutoffOnTrendScale.score}.`;

  return (
    <Screen>
      <Text variant="display">Progress</Text>

      <Card>
        <Chip label="Weakest topics" tone="warning" icon="trending-down-outline" />
        <Text variant="heading" style={{ marginTop: space.sm }}>
          Focus next on {weakest.map((t) => t.topic).slice(0, 2).join(' and ')}
        </Text>
        <Text variant="bodySmall" tone="secondary">
          Built from your last {results.length} attempts. Accuracy on these topics is below 50%.
        </Text>
        {suggested.length > 0 ? (
          <View style={styles.suggest}>
            {suggested.map((t) => (
              <Chip key={t.id} label={`Try: ${t.title}`} tone="primary" icon="play-outline" onPress={() => router.push({ pathname: '/test/[id]', params: { id: t.id } })} />
            ))}
          </View>
        ) : null}
      </Card>

      <View style={styles.block}>
        <SectionHeader title="Score trend" subtitle={getExam(profile.targetExamIds[0] ?? '')?.name ?? ''} />
        <Card>
          <View style={styles.chart} accessible accessibilityRole="image" accessibilityLabel={trendSummary}>
            <View style={[styles.cutoff, { bottom: CHART_HEIGHT * cutoffRatio }]}>
              <View style={styles.cutoffLine} />
              <Text variant="caption" tone="secondary" style={styles.cutoffLabel}>
                Cutoff {cutoffOnTrendScale.score}
              </Text>
            </View>
            <View style={styles.bars}>
              {scoreTrend.map((p) => {
                const ratio = p.score / p.maxScore;
                const above = p.score >= cutoffOnTrendScale.score;
                return (
                  <View key={p.date} style={styles.barCol}>
                    <Text variant="caption" tabular style={{ color: above ? colors.success : colors.text }}>
                      {p.score}
                    </Text>
                    <View style={[styles.bar, { height: Math.max(6, CHART_HEIGHT * ratio), backgroundColor: above ? colors.success : colors.primary }]} />
                  </View>
                );
              })}
            </View>
          </View>
          <View style={styles.axis}>
            {scoreTrend.map((p) => (
              <Text key={p.date} variant="caption" tone="secondary" style={styles.axisLabel} numberOfLines={1}>
                {formatDate(p.date).slice(0, 6)}
              </Text>
            ))}
          </View>
          <View style={styles.legend}>
            <LegendDot color={colors.primary} label="Below cutoff" />
            <LegendDot color={colors.success} label="At or above cutoff" />
          </View>
        </Card>
      </View>

      <View style={styles.block}>
        <SectionHeader title="Topic strength" subtitle="Accuracy per tagged topic" />
        <Card>
          <View style={styles.topics}>
            {[...strongest, ...weakest].map((t) => {
              const pct = Math.round(t.accuracy * 100);
              const tone = pct >= 75 ? colors.success : pct >= 50 ? colors.warning : colors.error;
              return (
                <View key={t.topic} style={styles.topicRow} accessible accessibilityLabel={`${t.topic}: ${pct} percent accuracy over ${t.attempted} questions`}>
                  <View style={styles.topicHead}>
                    <Text variant="bodySmallStrong" numberOfLines={1} style={{ flex: 1 }}>
                      {t.topic}
                    </Text>
                    <Text variant="bodySmall" tone="secondary" tabular>
                      {pct}% · {t.attempted} Qs
                    </Text>
                  </View>
                  <ProgressBar value={t.accuracy} label={`${t.topic} ${pct} percent`} color={tone} height={6} />
                </View>
              );
            })}
          </View>
        </Card>
      </View>

      <View style={styles.block}>
        <SectionHeader title="Practice lists" />
        <View style={styles.practice}>
          <Card onPress={() => results[0] && router.push({ pathname: '/result/[attemptId]', params: { attemptId: results[0].attemptId } })} accessibilityLabel={`Mistake notebook, ${mistakes} questions`} style={styles.practiceCard}>
            <View style={[styles.practiceIcon, { backgroundColor: colors.errorSoft }]}>
              <Icon name="close-circle-outline" size={22} color={colors.error} />
            </View>
            <Text variant="title" tabular style={{ marginTop: space.sm }}>
              {mistakes}
            </Text>
            <Text variant="bodySmall" tone="secondary">
              Mistake notebook
            </Text>
          </Card>
          <Card onPress={() => results[0] && router.push({ pathname: '/result/[attemptId]', params: { attemptId: results[0].attemptId } })} accessibilityLabel={`Bookmarks, ${bookmarks} questions`} style={styles.practiceCard}>
            <View style={[styles.practiceIcon, { backgroundColor: colors.primarySoft }]}>
              <Icon name="bookmark-outline" size={22} color={colors.primary} />
            </View>
            <Text variant="title" tabular style={{ marginTop: space.sm }}>
              {bookmarks}
            </Text>
            <Text variant="bodySmall" tone="secondary">
              Bookmarks
            </Text>
          </Card>
        </View>
      </View>

      <View style={styles.block}>
        <SectionHeader title="Recent results" />
        <Card padded={false}>
          {results.map((r, i) => {
            const test = getTest(r.testId);
            return (
              <View key={r.attemptId} style={[styles.resultRow, i > 0 && styles.divider]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {test?.title ?? 'Test'}
                  </Text>
                  <Text variant="bodySmall" tone="secondary">
                    {formatDate(r.completedAt)} · Rank {formatOrdinal(r.rank)} · {r.percentile.toFixed(1)} pct
                  </Text>
                </View>
                <View style={styles.resultScore}>
                  <Text variant="bodyStrong" tabular>
                    {Number(r.score.toFixed(1))}/{r.maxScore}
                  </Text>
                  <Chip label="Review" tone="primary" onPress={() => router.push({ pathname: '/result/[attemptId]', params: { attemptId: r.attemptId } })} />
                </View>
              </View>
            );
          })}
        </Card>
      </View>
    </Screen>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.md },
  suggest: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  chart: { height: CHART_HEIGHT + 24, justifyContent: 'flex-end', position: 'relative' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.sm },
  barCol: { flex: 1, alignItems: 'center', gap: space.xs },
  bar: { width: '100%', maxWidth: 40, borderTopLeftRadius: radius.sm, borderTopRightRadius: radius.sm },
  cutoff: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: space.sm, zIndex: 1 },
  cutoffLine: { flex: 1, height: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.warning },
  cutoffLabel: { backgroundColor: colors.surface, paddingHorizontal: space.xs },
  axis: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm, marginTop: space.xs },
  axisLabel: { flex: 1, textAlign: 'center' },
  legend: { flexDirection: 'row', gap: space.lg, marginTop: space.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  dot: { width: 10, height: 10, borderRadius: 5 },
  topics: { gap: space.md },
  topicRow: { gap: space.xs },
  topicHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  practice: { flexDirection: 'row', gap: space.md },
  practiceCard: { flex: 1 },
  practiceIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  divider: { borderTopWidth: 1, borderTopColor: colors.surfaceMuted },
  resultScore: { alignItems: 'flex-end', gap: space.xs },
});
