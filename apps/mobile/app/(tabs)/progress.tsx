import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SectionHeader } from '@/features/catalogue/components/SectionHeader';
import { usePractice, useProgress } from '@/features/results/queries';
import { formatDate } from '@/lib/format';
import { Card, Chip, FeatureTile, Icon, IconButton, ProgressBar, Screen, StateView, Text, type IconName } from '@/ui/primitives';
import { LineChart } from '@/ui/patterns/LineChart';
import { colors, radius, space, tiles, type TileTone } from '@/ui/tokens';

/**
 * Progress (PRD 6.6) from the server: topic accuracy, weakest topic, score trend (percent of
 * full marks, so different tests compare), recommended tests and practice lists. Every chart
 * has a text equivalent.
 */
export default function ProgressScreen() {
  const router = useRouter();
  const progress = useProgress();
  const mistakes = usePractice('mistakes');
  const bookmarks = usePractice('bookmarks');
  const data = progress.data;
  const [point, setPoint] = useState(0);
  const trend = data?.trend ?? [];
  useEffect(() => setPoint(Math.max(0, trend.length - 1)), [trend.length]);

  if (progress.isError)
    return (
      <Screen>
        <Text variant="display">Progress</Text>
        <StateView kind="error" title="Couldn’t load your progress" message="Please try again in a moment." actionLabel="Try again" onAction={() => void progress.refetch()} />
      </Screen>
    );
  if (!data)
    return (
      <Screen>
        <Text variant="display">Progress</Text>
        <StateView kind="empty" title="Loading your progress" message="Fetching your results from the server." />
      </Screen>
    );
  if (data.totals.tests === 0)
    return (
      <Screen>
        <Text variant="display">Progress</Text>
        <StateView
          kind="empty"
          title="No finished tests yet"
          message="Your topic accuracy, score trend and mistake notebook build up as you finish tests."
          actionLabel="Find a free test"
          onAction={() => router.push('/discover')}
        />
      </Screen>
    );

  const selected = trend[point];
  const pcts = trend.map((p) => p.percentage);
  const best = pcts.length ? Math.max(...pcts) : 0;
  const average = pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : 0;
  const accuracy = data.totals.attempted ? Math.round((data.totals.correct / data.totals.attempted) * 100) : 0;
  const topics = [...data.topics].sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101));

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="display" accessibilityRole="header">
          Progress
        </Text>
        <IconButton icon="search-outline" label="Find a test" onPress={() => router.push('/discover')} />
      </View>

      {data.weakest ? (
        <View style={styles.focus}>
          <View style={styles.focusTag}>
            <Icon name="trending-down-outline" size={14} color={colors.onAccent} />
            <Text variant="caption" style={{ color: colors.onAccent }}>
              Weakest topic
            </Text>
          </View>
          <Text variant="title" tone="inverse">
            Focus next on {data.weakest.topic}
          </Text>
          <Text variant="bodySmall" tone="inverseSecondary">
            {data.weakest.accuracy}% accuracy over {data.weakest.attempted} answered questions in {data.weakest.subject}.
          </Text>
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metrics}>
        <Metric tone="ice" icon="document-text-outline" label="Tests finished" value={String(data.totals.tests)} />
        <Metric tone="sky" icon="checkmark-done-outline" label="Accuracy" value={`${accuracy}%`} />
        <Metric tone="cyan" icon="trophy-outline" label="Best score" value={`${best}%`} />
        <Metric tone="navy" icon="pulse-outline" label="Average" value={`${average}%`} />
      </ScrollView>

      {trend.length > 1 && selected ? (
        <View style={styles.block}>
          <SectionHeader title="Score trend" subtitle="Percent of full marks" />
          <Card>
            <Text variant="metric" tabular accessibilityLiveRegion="polite">
              {selected.percentage}%
            </Text>
            <Text variant="caption" tone="secondary" numberOfLines={1}>
              {selected.testTitle} · {selected.score}/{selected.maxScore}
            </Text>
            <View style={styles.dateNav}>
              <Pressable
                onPress={() => setPoint((i) => Math.max(0, i - 1))}
                disabled={point === 0}
                accessibilityRole="button"
                accessibilityLabel="Previous test"
                hitSlop={8}
                style={[styles.navBtn, point === 0 && styles.navOff]}
              >
                <Icon name="chevron-back" size={18} color={colors.text} />
              </Pressable>
              <Text variant="bodySmallStrong">{formatDate(selected.submittedAt)}</Text>
              <Pressable
                onPress={() => setPoint((i) => Math.min(trend.length - 1, i + 1))}
                disabled={point === trend.length - 1}
                accessibilityRole="button"
                accessibilityLabel="Next test"
                hitSlop={8}
                style={[styles.navBtn, point === trend.length - 1 && styles.navOff]}
              >
                <Icon name="chevron-forward" size={18} color={colors.text} />
              </Pressable>
            </View>
            <LineChart
              points={trend.map((p) => ({
                label: formatDate(p.submittedAt).slice(0, 6),
                value: p.percentage,
                description: `${p.testTitle}, ${formatDate(p.submittedAt)}: ${p.percentage} percent`,
              }))}
              max={100}
              selectedIndex={point}
              onSelect={setPoint}
            />
          </Card>
        </View>
      ) : null}

      <View style={styles.block}>
        <SectionHeader title="Practice" subtitle="Revise what you missed" />
        <View style={styles.tiles}>
          <FeatureTile
            tone="ice"
            icon="close-circle-outline"
            title="Mistake notebook"
            value={String(mistakes.data?.length ?? 0)}
            description="Questions you got wrong"
            action="Practise"
            onPress={() => router.push({ pathname: '/practice/[list]', params: { list: 'mistakes' } })}
            style={styles.tile}
          />
          <FeatureTile
            tone="sky"
            icon="bookmark-outline"
            title="Bookmarks"
            value={String(bookmarks.data?.length ?? 0)}
            description="Saved to revise later"
            action="Open"
            onPress={() => router.push({ pathname: '/practice/[list]', params: { list: 'bookmarks' } })}
            style={styles.tile}
          />
        </View>
      </View>

      <View style={styles.block}>
        <SectionHeader title="Topic accuracy" subtitle="Weakest first" />
        <Card>
          <View style={{ gap: space.md }}>
            {topics.map((t) => {
              const acc = (t.accuracy ?? 0) / 100;
              return (
                <View key={`${t.subject}|${t.topic}`} style={{ gap: space.xs }}>
                  <View style={styles.rowBetween}>
                    <Text variant="bodySmallStrong" style={{ flex: 1 }} numberOfLines={1}>
                      {t.topic}
                    </Text>
                    <Text variant="bodySmall" tone="secondary" tabular>
                      {t.accuracy === null ? '—' : `${t.accuracy}%`} · {t.attempted}/{t.total}
                    </Text>
                  </View>
                  <ProgressBar value={acc} label={`${t.topic} accuracy`} color={acc >= 0.7 ? colors.success : acc >= 0.4 ? colors.warning : colors.error} />
                </View>
              );
            })}
          </View>
        </Card>
      </View>

      {data.recommended.length ? (
        <View style={styles.block}>
          <SectionHeader title="Recommended next" subtitle="Tests you haven’t taken yet" />
          <View style={styles.suggest}>
            {data.recommended.map((t) => (
              <Chip key={t.testId} label={t.title} tone="primary" icon="play-outline" onPress={() => router.push({ pathname: '/test/[id]', params: { id: t.testId } })} />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.block}>
        <SectionHeader title="Recent results" subtitle="Tap to see solutions" />
        <Card padded={false}>
          {[...trend].reverse().map((p, i) => (
            <Pressable
              key={p.attemptId}
              onPress={() => router.push({ pathname: '/attempt/[id]/summary', params: { id: p.attemptId } })}
              accessibilityRole="button"
              accessibilityLabel={`${p.testTitle}, ${p.percentage} percent. Open result`}
              style={[styles.resultRow, i > 0 && styles.divider]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {p.testTitle}
                </Text>
                <Text variant="caption" tone="secondary">
                  {formatDate(p.submittedAt)} · {p.score}/{p.maxScore}
                </Text>
              </View>
              <Text variant="bodyStrong" tabular>
                {p.percentage}%
              </Text>
              <Icon name="chevron-forward" size={18} color={colors.textSecondary} />
            </Pressable>
          ))}
        </Card>
      </View>
    </Screen>
  );
}

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
  metrics: { gap: space.md },
  metric: { width: 140, gap: space.xs, padding: space.lg, borderRadius: radius.lg },
  metricIcon: { width: 28, height: 28, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  block: { gap: space.md },
  dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: space.sm },
  navBtn: { width: 36, height: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  navOff: { opacity: 0.4 },
  tiles: { flexDirection: 'row', gap: space.md },
  tile: { flex: 1 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  suggest: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  divider: { borderTopWidth: 1, borderTopColor: colors.surfaceMuted },
});
