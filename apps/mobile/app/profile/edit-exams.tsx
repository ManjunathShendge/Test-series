import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { exams, type Profile } from '@/lib/demo';
import { announce } from '@/lib/a11y';
import { useAppStore } from '@/lib/store/app';
import { Button, Icon, Screen, Text, type IconName } from '@/ui/primitives';
import { colors, radius, space } from '@/ui/tokens';

type Stage = Profile['preparationStage'];
const STAGES: { key: Stage; label: string; detail: string; icon: IconName }[] = [
  { key: 'starting', label: 'Just starting', detail: 'Building concepts. Easier sectionals first.', icon: 'leaf-outline' },
  { key: 'revising', label: 'Revising', detail: 'Syllabus covered once. Mocks plus weak-topic drills.', icon: 'refresh-outline' },
  { key: 'final-lap', label: 'Final lap', detail: 'Exam within weeks. Full mocks on the real schedule.', icon: 'flag-outline' },
];

/**
 * Profile > Target exams (PRD 6.7 "target exam preferences"). Edits the same
 * fields onboarding collected; recommendations on Home update immediately.
 */
export default function EditExamsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useAppStore((s) => s.profile);
  const update = useAppStore((s) => s.updatePreferences);
  const [examIds, setExamIds] = useState<string[]>(profile.targetExamIds);
  const [stage, setStage] = useState<Stage>(profile.preparationStage);
  const [error, setError] = useState<string | null>(null);

  const dirty = stage !== profile.preparationStage || examIds.length !== profile.targetExamIds.length || examIds.some((id) => !profile.targetExamIds.includes(id));

  const toggleExam = (id: string) => {
    setError(null);
    setExamIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const save = () => {
    if (examIds.length === 0) {
      setError('Keep at least one exam so Home can recommend tests.');
      return;
    }
    update({ targetExamIds: examIds, preparationStage: stage });
    announce('Preferences saved');
    router.back();
  };

  return (
    <>
      <Screen contentStyle={styles.content} edges={['left', 'right']}>
        <View style={styles.block}>
          <Text variant="heading">Exams you are preparing for</Text>
          <Text variant="bodySmall" tone="secondary">
            Choose one or more. Recommendations and the Progress cutoff line follow this list.
          </Text>
          <View style={styles.list}>
            {exams.map((e) => {
              const on = examIds.includes(e.id);
              return (
                <Pressable key={e.id} onPress={() => toggleExam(e.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${e.name}, ${e.category}`} style={[styles.choice, on && styles.choiceOn]}>
                  <View style={[styles.choiceIcon, on && styles.choiceIconOn]}>
                    <Icon name={on ? 'checkmark' : 'school-outline'} size={20} color={on ? colors.onPrimary : colors.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyStrong">{e.name}</Text>
                    <Text variant="bodySmall" tone="secondary">
                      {e.category} · {e.testCount} tests
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          {error ? (
            <View style={styles.errorRow} accessibilityLiveRegion="assertive">
              <Icon name="alert-circle-outline" size={16} color={colors.error} />
              <Text variant="bodySmall" tone="error">
                {error}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.block}>
          <Text variant="heading">Preparation stage</Text>
          <View style={styles.list} accessibilityRole="radiogroup">
            {STAGES.map((s) => {
              const on = stage === s.key;
              return (
                <Pressable key={s.key} onPress={() => setStage(s.key)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${s.label}. ${s.detail}`} style={[styles.choice, on && styles.choiceOn]}>
                  <View style={[styles.choiceIcon, on && styles.choiceIconOn]}>
                    <Icon name={on ? 'checkmark' : s.icon} size={20} color={on ? colors.onPrimary : colors.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyStrong">{s.label}</Text>
                    <Text variant="bodySmall" tone="secondary">
                      {s.detail}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Screen>

      <View style={[styles.bar, { paddingBottom: insets.bottom + space.md }]}>
        <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
        <Button label="Save changes" icon="checkmark" size="lg" disabled={!dirty} onPress={save} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space['2xl'] },
  block: { gap: space.sm },
  list: { gap: space.sm, marginTop: space.xs },
  choice: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, minHeight: 64 },
  choiceOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  choiceIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  choiceIconOn: { backgroundColor: colors.primary },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
