import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getExam, getTest, type Language } from '@/lib/demo';
import { formatDuration } from '@/lib/format';
import { useAppStore } from '@/lib/store/app';
import { useAttemptStore } from '@/lib/store/attempt';
import { Button, Card, Chip, Icon, Screen, StateView, Text } from '@/ui/primitives';
import { colors, radius, space, touch } from '@/ui/tokens';

/**
 * Instructions (PRD 6.4): rules, section table, language choice and the
 * "I have read" acceptance that gates Start. The clock begins only on Start.
 */
export default function InstructionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const test = getTest(id);
  const profileLanguage = useAppStore((s) => s.profile.language);
  const start = useAttemptStore((s) => s.start);
  const [accepted, setAccepted] = useState(false);
  const [language, setLanguage] = useState<Language>(profileLanguage);
  const [error, setError] = useState<string | null>(null);

  if (!test) {
    return (
      <Screen edges={['left', 'right']}>
        <StateView kind="error" title="Test not found" message="This test may have been unpublished." actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }

  const exam = getExam(test.examId);
  const bilingual = test.languages.includes('hi');
  const sectional = test.sections.every((s) => s.durationMinutes !== undefined);

  const onStart = () => {
    if (!accepted) {
      setError('Tick the box to confirm you have read the instructions.');
      return;
    }
    if (start(test.id, bilingual ? language : 'en')) {
      router.replace({ pathname: '/test/[id]/attempt', params: { id: test.id } });
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Instructions' }} />
      <Screen contentStyle={{ paddingBottom: 140 }} edges={['left', 'right']}>
        <Chip label={exam?.name ?? 'Exam'} tone="primary" icon="school-outline" />
        <Text variant="display">{test.title}</Text>

        <View style={styles.facts}>
          <Fact value={String(test.questionCount)} label="Questions" />
          <Fact value={formatDuration(test.durationMinutes)} label={sectional ? 'Total time' : 'Duration'} />
          <Fact value={String(test.totalMarks)} label="Marks" />
        </View>

        <View style={styles.block}>
          <Text variant="heading">Sections</Text>
          <Card padded={false}>
            {test.sections.map((s, i) => (
              <View key={s.id} style={[styles.sectionRow, i > 0 && styles.divider]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyStrong">{s.name.en}</Text>
                  <Text variant="bodySmall" tone="secondary">
                    {s.questionCount} questions · +{s.marksPerQuestion} / −{Number(s.negativeMarks.toFixed(2))} per answer
                  </Text>
                </View>
                {s.durationMinutes ? <Chip label={`${s.durationMinutes} min`} icon="time-outline" /> : null}
              </View>
            ))}
          </Card>
          {sectional ? (
            <Text variant="bodySmall" tone="secondary">
              Sections open one after another. When a section's time ends it locks, and unused time does not carry over.
            </Text>
          ) : (
            <Text variant="bodySmall" tone="secondary">
              Move freely between sections. One timer covers the whole paper.
            </Text>
          )}
        </View>

        <View style={styles.block}>
          <Text variant="heading">Rules</Text>
          <View style={styles.bullets}>
            {test.instructions.map((line) => (
              <View key={line} style={styles.bullet}>
                <Icon name="information-circle-outline" size={18} color={colors.primary} />
                <Text tone="secondary" style={{ flex: 1 }}>
                  {line}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.block}>
          <Text variant="heading">Palette legend</Text>
          <Card>
            <View style={styles.legend}>
              <Legend label="Not visited" style={styles.swUnvisited} />
              <Legend label="Not answered" style={styles.swVisited} icon="ellipse-outline" />
              <Legend label="Answered" style={styles.swAnswered} icon="checkmark" iconColor={colors.success} />
              <Legend label="Marked for review" style={styles.swMarked} icon="bookmark" iconColor={colors.review} />
              <Legend label="Answered and marked" style={styles.swMarkedAnswered} icon="checkmark" iconColor={colors.review} />
            </View>
          </Card>
        </View>

        {bilingual ? (
          <View style={styles.block}>
            <Text variant="heading">Default language</Text>
            <View style={styles.langRow} accessibilityRole="radiogroup">
              {(['en', 'hi'] as Language[]).map((l) => (
                <Chip key={l} label={l === 'en' ? 'English' : 'हिन्दी'} selected={language === l} onPress={() => setLanguage(l)} />
              ))}
            </View>
            <Text variant="bodySmall" tone="secondary">
              You can switch language on any question during the test without losing your answer.
            </Text>
          </View>
        ) : null}
      </Screen>

      <View style={[styles.bar, { paddingBottom: insets.bottom + space.md }]}>
        <Pressable
          onPress={() => {
            setAccepted((v) => !v);
            setError(null);
          }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted }}
          accessibilityLabel="I have read and understood the instructions"
          style={styles.checkRow}
        >
          <View style={[styles.checkbox, accepted && styles.checkboxOn, !!error && styles.checkboxError]}>
            {accepted ? <Icon name="checkmark" size={18} color={colors.onPrimary} /> : null}
          </View>
          <Text style={{ flex: 1 }}>I have read and understood the instructions.</Text>
        </Pressable>
        {error ? (
          <View style={styles.errorRow} accessibilityLiveRegion="assertive">
            <Icon name="alert-circle-outline" size={16} color={colors.error} />
            <Text variant="bodySmall" tone="error">
              {error}
            </Text>
          </View>
        ) : null}
        <Button label="Start test" icon="play" size="lg" fullWidth onPress={onStart} />
      </View>
    </>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.fact} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="title" tabular>
        {value}
      </Text>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

function Legend({ label, style, icon, iconColor }: { label: string; style: object; icon?: React.ComponentProps<typeof Icon>['name']; iconColor?: string }) {
  return (
    <View style={styles.legendItem} accessible accessibilityLabel={label}>
      <View style={[styles.swatch, style]}>{icon ? <Icon name={icon} size={14} color={iconColor ?? colors.textSecondary} /> : null}</View>
      <Text variant="bodySmall">{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  facts: { flexDirection: 'row', gap: space.md },
  fact: { flex: 1, gap: 2, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  block: { gap: space.md },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  divider: { borderTopWidth: 1, borderTopColor: colors.surfaceMuted },
  bullets: { gap: space.sm },
  bullet: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  legend: { gap: space.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  swatch: { width: 32, height: 32, borderRadius: radius.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  swUnvisited: { borderColor: colors.border, borderStyle: 'dashed', backgroundColor: colors.surface },
  swVisited: { borderColor: colors.error, backgroundColor: colors.errorSoft },
  swAnswered: { borderColor: colors.success, backgroundColor: colors.successSoft },
  swMarked: { borderColor: colors.review, backgroundColor: colors.reviewSoft },
  swMarkedAnswered: { borderColor: colors.review, backgroundColor: colors.successSoft },
  langRow: { flexDirection: 'row', gap: space.sm },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: space.md, paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touch.minSize },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxError: { borderColor: colors.error },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
