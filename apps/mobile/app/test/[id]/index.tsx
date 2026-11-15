import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PurchaseSheet } from '@/features/commerce/PurchaseSheet';
import { getExam, getExaminer, getSeries, getTest } from '@/lib/demo';
import { formatCount, formatDuration, formatPaise } from '@/lib/format';
import { useAppStore, useHasAccess } from '@/lib/store/app';
import { useAttemptStore } from '@/lib/store/attempt';
import { Avatar, Button, Card, Chip, Icon, Screen, StateView, Text, type IconName } from '@/ui/primitives';
import { colors, radius, space } from '@/ui/tokens';

/** Test detail (PRD 6.3): what you get, who made it, and one clear next action. */
export default function TestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const test = getTest(id);
  const hasAccess = useHasAccess(id);
  const attempted = useAppStore((s) => s.attemptedTestIds.includes(id));
  const [buying, setBuying] = useState(false);
  const inProgressTestId = useAttemptStore((s) => (s.status === 'in_progress' ? s.test?.id ?? null : null));
  const inProgressTitle = useAttemptStore((s) => (s.status === 'in_progress' ? s.test?.title ?? '' : ''));

  if (!test) {
    return (
      <Screen edges={['left', 'right']}>
        <StateView kind="error" title="Test not found" message="This test may have been unpublished." actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }

  const exam = getExam(test.examId);
  const examiner = getExaminer(test.examinerId);
  const series = test.seriesId ? getSeries(test.seriesId) : undefined;
  const negative = test.sections[0]?.negativeMarks ?? 0;

  const resuming = inProgressTestId === test.id;
  const startAttempt = () => {
    if (resuming) {
      router.push({ pathname: '/test/[id]/attempt', params: { id: test.id } });
      return;
    }
    // One live attempt at a time: its clock is still running (decision E17/C3).
    if (inProgressTestId) {
      Alert.alert('Finish your current test first', `${inProgressTitle} is still in progress and its timer is running.`, [
        { text: 'Not now', style: 'cancel' },
        { text: 'Continue that test', onPress: () => router.push({ pathname: '/test/[id]/attempt', params: { id: inProgressTestId } }) },
      ]);
      return;
    }
    router.push({ pathname: '/test/[id]/instructions', params: { id: test.id } });
  };

  return (
    <>
      <Stack.Screen options={{ title: exam?.shortName ?? 'Test' }} />
      <Screen contentStyle={{ paddingBottom: 120 }} edges={['left', 'right']}>
        <View style={styles.chips}>
          <Chip label={exam?.name ?? 'Exam'} tone="primary" icon="school-outline" />
          {test.languages.includes('hi') ? <Chip label="English · Hindi" icon="language-outline" /> : <Chip label="English" />}
          {attempted ? <Chip label="Attempted" tone="success" icon="checkmark-done-outline" /> : null}
        </View>
        <Text variant="display">{test.title}</Text>

        {examiner ? (
          <Card
            onPress={() => router.push({ pathname: '/examiner/[id]', params: { id: examiner.id } })}
            accessibilityLabel={`Examiner ${examiner.name}, ${examiner.credentials}. Open profile`}
          >
            <View style={styles.examinerRow}>
              <Avatar name={examiner.name} />
              <View style={styles.examinerText}>
                <Text variant="bodyStrong">{examiner.name}</Text>
                <Text variant="bodySmall" tone="secondary" numberOfLines={1}>
                  {examiner.credentials}
                </Text>
              </View>
              <Icon name="chevron-forward" color={colors.textSecondary} />
            </View>
          </Card>
        ) : null}

        <View style={styles.grid}>
          <Stat icon="help-circle-outline" label="Questions" value={String(test.questionCount)} />
          <Stat icon="time-outline" label="Duration" value={formatDuration(test.durationMinutes)} />
          <Stat icon="trophy-outline" label="Total marks" value={String(test.totalMarks)} />
          <Stat icon="remove-circle-outline" label="Negative" value={negative === 0 ? 'None' : `−${Number(negative.toFixed(2))}`} />
          <Stat icon="people-outline" label="Attempts" value={formatCount(test.attempts)} />
          <Stat icon="layers-outline" label="Sections" value={String(test.sections.length)} />
        </View>

        <View style={styles.block}>
          <Text variant="heading">Sections</Text>
          <Card padded={false}>
            {test.sections.map((s, i) => (
              <View key={s.id} style={[styles.sectionRow, i > 0 && styles.sectionDivider]}>
                <View style={styles.sectionName}>
                  <Text variant="bodyStrong">{s.name.en}</Text>
                  {s.name.hi ? (
                    <Text variant="bodySmall" tone="secondary">
                      {s.name.hi}
                    </Text>
                  ) : null}
                </View>
                <Text variant="bodySmall" tone="secondary" tabular>
                  {s.questionCount} Qs · {s.questionCount * s.marksPerQuestion} marks
                  {s.durationMinutes ? ` · ${s.durationMinutes} min` : ''}
                </Text>
              </View>
            ))}
          </Card>
        </View>

        <View style={styles.block}>
          <Text variant="heading">About this test</Text>
          <View style={styles.bullets}>
            {test.instructions.map((line) => (
              <View key={line} style={styles.bullet}>
                <Icon name="checkmark-circle-outline" size={18} color={colors.success} />
                <Text tone="secondary" style={styles.bulletText}>
                  {line}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {series && !hasAccess ? (
          <Card onPress={() => router.push({ pathname: '/series/[id]', params: { id: series.id } })} accessibilityLabel={`Part of ${series.title}. ${formatPaise(series.pricePaise)} for ${series.testIds.length} tests. Open series`}>
            <Chip label="Better value" tone="success" icon="pricetags-outline" />
            <Text variant="heading" style={{ marginTop: space.sm }}>
              Part of {series.title}
            </Text>
            <Text variant="bodySmall" tone="secondary">
              {series.testIds.length} tests · {series.validityDays} days validity · {formatPaise(series.pricePaise)}
            </Text>
          </Card>
        ) : null}
      </Screen>

      <View style={[styles.bar, { paddingBottom: insets.bottom + space.md }]}>
        <View style={styles.barPrice}>
          {test.pricePaise === 0 ? (
            <Chip label="Free" tone="success" icon="gift-outline" />
          ) : hasAccess ? (
            <Chip label="Owned" tone="success" icon="checkmark-circle-outline" />
          ) : (
            <>
              <Text variant="caption" tone="secondary">
                Price
              </Text>
              <Text variant="title">{formatPaise(test.pricePaise)}</Text>
            </>
          )}
        </View>
        {hasAccess ? (
          <Button label={resuming ? 'Continue attempt' : attempted ? 'Reattempt' : 'Start test'} icon="play" size="lg" onPress={startAttempt} />
        ) : (
          <Button label="Buy test" icon="lock-open-outline" size="lg" onPress={() => setBuying(true)} />
        )}
      </View>

      <PurchaseSheet
        visible={buying}
        item={{ kind: 'test', id: test.id, title: test.title, pricePaise: test.pricePaise, detail: `${test.questionCount} questions · ${formatDuration(test.durationMinutes)} · ${exam?.name ?? ''}` }}
        onClose={() => setBuying(false)}
        onUnlocked={() => {
          setBuying(false);
          startAttempt();
        }}
      />
    </>
  );
}

function Stat({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <Icon name={icon} size={18} color={colors.textSecondary} />
      <Text variant="bodyStrong" tabular>
        {value}
      </Text>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  examinerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  examinerText: { flex: 1, gap: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  stat: {
    width: '30%',
    flexGrow: 1,
    gap: 2,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  block: { gap: space.md },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, padding: space.lg },
  sectionDivider: { borderTopWidth: 1, borderTopColor: colors.surfaceMuted },
  sectionName: { flex: 1, gap: 2 },
  bullets: { gap: space.sm },
  bullet: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  bulletText: { flex: 1 },
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
  barPrice: { gap: 2 },
});
