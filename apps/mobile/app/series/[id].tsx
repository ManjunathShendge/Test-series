import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PurchaseSheet } from '@/features/commerce/PurchaseSheet';
import { getExam, getExaminer, getSeries, testsInSeries } from '@/lib/demo';
import { formatDuration, formatPaise } from '@/lib/format';
import { useAppStore } from '@/lib/store/app';
import { Avatar, Button, Card, Chip, Icon, ProgressBar, Screen, StateView, Text } from '@/ui/primitives';
import { colors, radius, space } from '@/ui/tokens';

/** Series page (PRD 6.2): test list, syllabus coverage, validity and pricing. */
export default function SeriesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const series = getSeries(id);
  const owned = useAppStore((s) => s.ownedSeriesIds.includes(id));
  const attempted = useAppStore((s) => s.attemptedTestIds);
  const [buying, setBuying] = useState(false);

  if (!series) {
    return (
      <Screen edges={['left', 'right']}>
        <StateView kind="error" title="Series not found" message="This series is unavailable." actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }

  const exam = getExam(series.examId);
  const examiner = getExaminer(series.examinerId);
  const tests = testsInSeries(series);
  const coveragePct = Math.round(series.syllabusCoverage * 100);

  return (
    <>
      <Stack.Screen options={{ title: 'Series' }} />
      <Screen contentStyle={{ paddingBottom: 120 }} edges={['left', 'right']}>
        <View style={styles.chips}>
          <Chip label={exam?.name ?? 'Exam'} tone="primary" icon="school-outline" />
          <Chip label={`${tests.length} tests`} icon="albums-outline" />
          <Chip label={`${series.validityDays} days`} icon="calendar-outline" />
        </View>
        <Text variant="display">{series.title}</Text>
        <Text tone="secondary">{series.description}</Text>

        {examiner ? (
          <Card onPress={() => router.push({ pathname: '/examiner/[id]', params: { id: examiner.id } })} accessibilityLabel={`Examiner ${examiner.name}. Open profile`}>
            <View style={styles.examinerRow}>
              <Avatar name={examiner.name} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{examiner.name}</Text>
                <Text variant="bodySmall" tone="secondary" numberOfLines={1}>
                  {examiner.credentials}
                </Text>
              </View>
              <Icon name="chevron-forward" color={colors.textSecondary} />
            </View>
          </Card>
        ) : null}

        <Card>
          <View style={styles.coverageRow}>
            <Text variant="bodyStrong">Syllabus coverage</Text>
            <Text variant="bodyStrong" tabular>
              {coveragePct}%
            </Text>
          </View>
          <View style={{ marginTop: space.sm }}>
            <ProgressBar value={series.syllabusCoverage} label={`Syllabus coverage ${coveragePct} percent`} />
          </View>
          <Text variant="bodySmall" tone="secondary" style={{ marginTop: space.sm }}>
            Share of the official syllabus topics covered across all tests in this series.
          </Text>
        </Card>

        <View style={styles.block}>
          <Text variant="heading">Schedule</Text>
          <Card padded={false}>
            {tests.map((t, i) => {
              const done = attempted.includes(t.id);
              return (
                <View key={t.id} style={[styles.testRow, i > 0 && styles.divider]}>
                  <View style={[styles.index, done && styles.indexDone]}>
                    {done ? <Icon name="checkmark" size={16} color={colors.success} /> : (
                      <Text variant="bodySmallStrong" tone="primary" tabular>
                        {i + 1}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {t.title}
                    </Text>
                    <Text variant="bodySmall" tone="secondary">
                      {t.questionCount} Qs · {formatDuration(t.durationMinutes)}
                      {t.pricePaise === 0 ? ' · Free' : ''}
                    </Text>
                  </View>
                  <Button label={done ? 'Review' : 'Open'} variant="ghost" onPress={() => router.push({ pathname: '/test/[id]', params: { id: t.id } })} accessibilityLabel={`Open ${t.title}`} />
                </View>
              );
            })}
          </Card>
        </View>
      </Screen>

      <View style={[styles.bar, { paddingBottom: insets.bottom + space.md }]}>
        <View style={{ gap: 2 }}>
          {owned ? (
            <Chip label="Owned" tone="success" icon="checkmark-circle-outline" />
          ) : (
            <>
              <Text variant="caption" tone="secondary">
                Series price
              </Text>
              <Text variant="title">{formatPaise(series.pricePaise)}</Text>
            </>
          )}
        </View>
        {owned ? (
          <Button label="Open first test" icon="play" size="lg" onPress={() => tests[0] && router.push({ pathname: '/test/[id]', params: { id: tests[0].id } })} />
        ) : (
          <Button label="Buy series" icon="lock-open-outline" size="lg" onPress={() => setBuying(true)} />
        )}
      </View>

      <PurchaseSheet
        visible={buying}
        item={{ kind: 'series', id: series.id, title: series.title, pricePaise: series.pricePaise, detail: `${tests.length} tests · ${series.validityDays} days validity` }}
        onClose={() => setBuying(false)}
        onUnlocked={() => {
          setBuying(false);
          if (tests[0]) router.push({ pathname: '/test/[id]', params: { id: tests[0].id } });
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  examinerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  coverageRow: { flexDirection: 'row', justifyContent: 'space-between' },
  block: { gap: space.md },
  testRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, paddingLeft: space.lg, paddingRight: space.xs },
  divider: { borderTopWidth: 1, borderTopColor: colors.surfaceMuted },
  index: { width: 28, height: 28, borderRadius: radius.full, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  indexDone: { backgroundColor: colors.successSoft },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
