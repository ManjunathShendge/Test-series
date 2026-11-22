import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SectionHeader } from '@/features/catalogue/components/SectionHeader';
import { cutoffOnTrendScale, getExam, getTest, recommendedTests, scoreTrend, topicStrengths } from '@/lib/demo';
import { formatDate, formatOrdinal } from '@/lib/format';
import { useAppStore } from '@/lib/store/app';
import { practiceEntries, useResultsList } from '@/lib/store/results';
import { Card, Chip, FeatureTile, Icon, IconButton, ProgressBar, Screen, StateView, Text, type IconName } from '@/ui/primitives';
import { LineChart } from '@/ui/patterns/LineChart';
import { colors, radius, space, tiles, type TileTone } from '@/ui/tokens';

/**
 * Progress (PRD 6.6): topic strength map, score trend with the admin cutoff
 * line, recent results, and practice lists (mistake notebook, bookmarks). Every
 * chart has a text equivalent; streaks and goals are a later phase and absent.
 * Analytics layout after owner design reference 2: big selected value, date stepper,
 * interactive line chart and a metric rail.
 */
export default function ProgressScreen() {
  const router = useRouter();
  const results = useResultsList();
  const profile = useAppStore((s) => s.profile);
  const attempted = useAppStore((s) => s.attemptedTestIds);

  const weakest = useMemo(() => [...topicStrengths].sort((a, b) => a.accuracy - b.accuracy).slice(0, 3), []);
  const strongest = useMemo(() => [...topicStrengths].sort((a, b) => b.accuracy - a.accuracy).slice(0, 3), []);
  const suggested = useMemo(() => recommendedTests(profile.targetExamIds, new Set(attempted)).slice(0, 2), [profile.targetExamIds, attempted]);
  const mistakes = useMemo(() => practiceEntries(results, 'mistakes').length, [results]);
  const bookmarks = useMemo(() => practiceEntries(results, 'bookmarks').length, [results]);
  // Selected point on the trend chart; starts on the most recent test.
  const [point, setPoint] = useState(scoreTrend.length - 1);

  if (results.length === 0) {
    return (
      <Screen>
        <Text variant="display">Progress</Text>
        <StateView kind="empty" title="No attempts yet" message="Your topic strength map, score trend and mistake notebook build up as you attempt tests." actionLabel="Find a free test" onAction={() => router.push('/discover')} />
      </Screen>
    );
  }

  const latest = scoreTrend[scoreTrend.length - 1];
  const selected = scoreTrend[point];
  const scores = scoreTrend.map((p) => p.score);
  const best = Number(Math.max(...scores).toFixed(1));
  const average = Number((scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length)).toFixed(1));
  const aboveCutoff = scores.filter((s) => s >= cutoffOnTrendScale.score).length;
  const trendSummary = `Scores over ${scoreTrend.length} tests: ${scores.join(', ')} out of ${latest?.maxScore ?? 80}. ${cutoffOnTrendScale.label} is ${cutoffOnTrendScale.score}.`;

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="display" accessibilityRole="header">
          Progress
        </Text>
        <IconButton icon="search-outline" label="Find a test" onPress={() => router.push('/discover')} />
      </View>

      <View style={styles.focus}>
        <View style={styles.focusTag}>
          <Icon name="trending-down-outline" size={14} color={colors.onAccent} />
          <Text variant="caption" style={{ color: colors.onAccent }}>
            Weakest topics
          </Text>
        </View>
        <Text variant="title" tone="inverse">
          Focus next on {weakest.map((t) => t.topic).slice(0, 2).join(' and ')}
        </Text>
        <Text variant="bodySmall" tone="inverseSecondary">
          Built from your last {results.length} attempts. Accuracy on these topics is below 50%.
        </Text>
        {suggested.length > 0 ? (
          <View style={styles.suggest}>
            {suggested.map((t) => (
              <Chip key={t.id} label={`Try: ${t.title}`} tone="primary" icon="play-outline" onPress={() => router.push({ pathname: '/test/[id]', params: { id: t.id } })} />
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.block}>
        <SectionHeader title="Score trend" subtitle={getExam(profile.targetExamIds[0] ?? '')?.name ?? ''} />
        <Card>
          <View style={styles.trendHead}>
            <View style={{ flex: 1 }}>
              <Text variant="metric" tabular accessibilityLiveRegion="polite">
                {selected ? Number(selected.score.toFixed(1)) : '-'}
                <Text variant="heading" tone="secondary">
                  /{selected?.maxScore ?? latest?.maxScore ?? 80}
                </Text>
              </Text>
              <Text variant="caption" tone="secondary" numberOfLines={1}>
                {selected ? `${selected.testTitle} · ${selected.score >= cutoffOnTrendScale.score ? 'at or above' : 'below'} cutoff` : ''}
              </Text>
            </View>
          </View>
          <View style={styles.dateNav}>
            <Pressable onPress={() => setPoint((i) => Math.max(0, i - 1))} disabled={point === 0} accessibilityRole="button" accessibilityLabel="Previous test" hitSlop={8} style={[styles.navBtn, point === 0 && styles.navOff]}>
              <Icon name="chevron-back" size={18} color={colors.text} />
            </Pressable>
            <Text variant="bodySmallStrong">{selected ? formatDate(selected.date) : ''}</Text>
            <Pressable onPress={() => setPoint((i) => Math.min(scoreTrend.length - 1, i + 1))} disabled={point === scoreTrend.length - 1} accessibilityRole="button" accessibilityLabel="Next test" hitSlop={8} style={[styles.navBtn, point === scoreTrend.length - 1 && styles.navOff]}>
              <Icon name="chevron-forward" size={18} color={colors.text} />
            </Pressable>
          </View>
          <View accessibilityLabel={trendSummary}>
            <LineChart
              points={scoreTrend.map((p) => ({
                label: formatDate(p.date).slice(0, 6),
                value: p.score,
                description: `${formatDate(p.date)}: ${p.score} out of ${p.maxScore}, ${p.score >= cutoffOnTrendScale.score ? 'at or above' : 'below'} the cutoff`,
              }))}
              max={latest?.maxScore ?? 80}
              threshold={{ value: cutoffOnTrendScale.score, label: `${cutoffOnTrendScale.label} ${cutoffOnTrendScale.score}` }}
              selectedIndex={point}
              onSelect={setPoint}
            />
          </View>
        </Card>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metrics}>
          <Metric tone="ice" icon="trophy-outline" label="Best score" value={`${best}/${latest?.maxScore ?? 80}`} />
          <Metric tone="sky" icon="pulse-outline" label="Average" value={`${average}/${latest?.maxScore ?? 80}`} />
          <Metric tone="cyan" icon="flag-outline" label="Above cutoff" value={`${aboveCutoff} of ${scoreTrend.length}`} />
          <Metric tone="navy" icon="document-text-outline" label="Tests taken" value={String(results.length)} />
        </ScrollView>
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
          <FeatureTile
            tone="ice"
            icon="close-circle-outline"
            title="Mistake notebook"
            value={String(mistakes)}
            description="Questions you got wrong"
            action="Practise"
            onPress={() => router.push({ pathname: '/practice/[list]', params: { list: 'mistakes' } })}
            style={styles.practiceCard}
          />
          <FeatureTile
            tone="sky"
            icon="bookmark-outline"
            title="Bookmarks"
            value={String(bookmarks)}
            description="Saved to revise later"
            action="Open"
            onPress={() => router.push({ pathname: '/practice/[list]', params: { list: 'bookmarks' } })}
            style={styles.practiceCard}
          />
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

/** Small tinted stat card for the horizontal metric rail. */
function Metric({ tone, icon, label, value }: { tone: TileTone; icon: IconName; label: string; value: string }) {
  const t = tiles[tone];
  return (
    <View style={[styles.metric, { backgroundColor: t.bg }]} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={[styles.metricIcon, { backgroundColor: t.iconBg }]}>
        <Icon name={icon} size={16} color={t.fg} />
      </View>
      <Text variant="bodySmall" style={{ color: t.fgSecondary }}>
        {label}
      </Text>
      <Text variant="title" tabular style={{ color: t.fg }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  focus: { backgroundColor: colors.inverse, borderRadius: radius.xl, padding: space.xl, gap: space.sm },
  focusTag: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start', backgroundColor: colors.accent, borderRadius: radius.full, paddingHorizontal: space.sm, paddingVertical: 2 },
  block: { gap: space.md },
  suggest: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  trendHead: { flexDirection: 'row', alignItems: 'flex-end' },
  dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: space.md },
  navBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  navOff: { opacity: 0.35 },
  metrics: { flexDirection: 'row', gap: space.md, paddingRight: space.lg },
  metric: { width: 140, borderRadius: radius.lg, padding: space.lg, gap: space.xs },
  metricIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  topics: { gap: space.md },
  topicRow: { gap: space.xs },
  topicHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  practice: { flexDirection: 'row', gap: space.md },
  practiceCard: { flex: 1 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  divider: { borderTopWidth: 1, borderTopColor: colors.surfaceMuted },
  resultScore: { alignItems: 'flex-end', gap: space.xs },
});
