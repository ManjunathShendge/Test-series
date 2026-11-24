import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TestCard } from '@/features/catalogue/components/TestCard';
import { useExamDetail } from '@/lib/api/queries';
import { formatCount, formatDate, formatPaise } from '@/lib/format';
import { useAccess, useEntitlements } from '@/lib/api/account';
import { Card, Chip, Icon, Screen, StateView, Text, type IconName } from '@/ui/primitives';
import { colors, radius, space } from '@/ui/tokens';

type Tab = 'tests' | 'series' | 'syllabus';

/** Exam page (PRD 6.2): admin-entered pattern, dates, cutoff and syllabus, plus its tests and series. */
export default function ExamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const detail = useExamDetail(id);
  const exam = detail.data?.exam;
  const hasAccess = useAccess();
  const ownedSeries = useEntitlements().data?.seriesIds ?? [];
  const [tab, setTab] = useState<Tab>('tests');

  if (detail.isError) {
    return (
      <Screen edges={['left', 'right']}>
        <StateView kind="error" title="Exam not found" message="This exam is unavailable or could not be loaded." actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }
  if (!exam) {
    return (
      <Screen edges={['left', 'right']}>
        <StateView kind="empty" title="Loading exam" message="Fetching the latest catalogue." />
      </Screen>
    );
  }

  const tests = detail.data?.tests ?? [];
  const series = detail.data?.series ?? [];

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'tests', label: 'Tests', count: tests.length },
    { key: 'series', label: 'Series', count: series.length },
    { key: 'syllabus', label: 'Syllabus', count: exam.syllabus.length },
  ];

  return (
    <>
      <Stack.Screen options={{ title: exam.shortName }} />
      <Screen edges={['left', 'right']}>
        <Chip label={exam.category} tone="primary" icon="ribbon-outline" />
        <Text variant="display">{exam.name}</Text>
        <Text tone="secondary">{exam.pattern}</Text>

        <View style={styles.facts}>
          <Fact icon="calendar-outline" label="Next exam" value={exam.nextDate ? formatDate(exam.nextDate) : 'To be announced'} />
          <Fact icon="flag-outline" label="Last cutoff" value={exam.lastCutoff ? String(exam.lastCutoff) : '—'} />
          <Fact icon="document-text-outline" label="Live tests" value={formatCount(exam.testCount)} />
        </View>

        <View style={styles.tabs} accessibilityRole="tablist">
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <Chip key={t.key} label={`${t.label} (${t.count})`} selected={active} onPress={() => setTab(t.key)} />
            );
          })}
        </View>

        {tab === 'tests' ? (
          tests.length === 0 ? (
            <StateView kind="empty" title="No tests yet" message="Examiners for this exam have not published tests." />
          ) : (
            <View style={styles.stack}>
              {tests.map((t) => (
                <TestCard key={t.id} test={t} hasAccess={hasAccess(t)} onPress={() => router.push({ pathname: '/test/[id]', params: { id: t.id } })} />
              ))}
            </View>
          )
        ) : null}

        {tab === 'series' ? (
          series.length === 0 ? (
            <StateView kind="empty" title="No series yet" message="Series bundle several tests at a lower price." />
          ) : (
            <View style={styles.stack}>
              {series.map((s) => {
                const isOwned = ownedSeries.includes(s.id);
                return (
                  <Card key={s.id} onPress={() => router.push({ pathname: '/series/[id]', params: { id: s.id } })} accessibilityLabel={`${s.title}, ${s.testIds.length} tests, ${isOwned ? 'owned' : formatPaise(s.pricePaise)}`}>
                    <View style={styles.seriesTop}>
                      <Chip label={`${s.testIds.length} tests`} icon="albums-outline" />
                      {isOwned ? <Chip label="Owned" tone="success" icon="checkmark-circle-outline" /> : <Text variant="bodyStrong">{formatPaise(s.pricePaise)}</Text>}
                    </View>
                    <Text variant="heading" style={{ marginTop: space.md }}>
                      {s.title}
                    </Text>
                    <Text variant="bodySmall" tone="secondary">
                      {s.validityDays} days validity
                    </Text>
                  </Card>
                );
              })}
            </View>
          )
        ) : null}

        {tab === 'syllabus' ? (
          <Card padded={false}>
            {exam.syllabus.map((item, i) => (
              <View key={item} style={[styles.syllabusRow, i > 0 && styles.divider]}>
                <View style={styles.index}>
                  <Text variant="bodySmallStrong" tone="primary" tabular>
                    {i + 1}
                  </Text>
                </View>
                <Text style={{ flex: 1 }}>{item}</Text>
              </View>
            ))}
          </Card>
        ) : null}
      </Screen>
    </>
  );
}

function Fact({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={styles.fact} accessible accessibilityLabel={`${label}: ${value}`}>
      <Icon name={icon} size={18} color={colors.textSecondary} />
      <Text variant="bodyStrong" tabular numberOfLines={1}>
        {value}
      </Text>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  facts: { flexDirection: 'row', gap: space.md },
  fact: { flex: 1, gap: 2, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabs: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  stack: { gap: space.md },
  seriesTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  syllabusRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  divider: { borderTopWidth: 1, borderTopColor: colors.surfaceMuted },
  index: { width: 28, height: 28, borderRadius: radius.full, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
