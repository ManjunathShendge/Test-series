import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useUpdateProfile } from '@/lib/api/account';
import { ApiRequestError } from '@/lib/api/http';
import { exams, type Language, type Profile } from '@/lib/demo';
import { useAppStore } from '@/lib/store/app';
import { Button, Card, Chip, Icon, Screen, Text, type IconName } from '@/ui/primitives';
import { colors, radius, space } from '@/ui/tokens';

type Stage = Profile['preparationStage'];
const STAGES: { key: Stage; label: string; detail: string; icon: IconName }[] = [
  { key: 'starting', label: 'Just starting', detail: 'Building concepts. Recommend easier sectionals first.', icon: 'leaf-outline' },
  { key: 'revising', label: 'Revising', detail: 'Covered the syllabus once. Mix of mocks and weak-topic drills.', icon: 'refresh-outline' },
  { key: 'final-lap', label: 'Final lap', detail: 'Exam within weeks. Full mocks on the real schedule.', icon: 'flag-outline' },
];

/**
 * Onboarding (PRD 6.1): target exams, language and preparation stage across
 * three steps with a progress indicator and back navigation; lands on Home
 * where the featured free test is unlocked.
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const complete = useAppStore((s) => s.completeOnboarding);
  const saveProfile = useUpdateProfile();
  const [step, setStep] = useState(0);
  const [examIds, setExamIds] = useState<string[]>([]);
  const [language, setLanguage] = useState<Language>('en');
  const [stage, setStage] = useState<Stage>('revising');
  const [error, setError] = useState<string | null>(null);

  const toggleExam = (id: string) => {
    setError(null);
    setExamIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const next = () => {
    if (step === 0 && examIds.length === 0) {
      setError('Pick at least one exam so we can recommend the right tests.');
      return;
    }
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    // Language and stage are saved on the server; target exams stay on the device until the
    // catalogue API (milestone B) gives them server ids.
    saveProfile.mutate(
      { preferredLanguage: language, preparationStage: stage },
      {
        onSuccess: () => {
          complete({ targetExamIds: examIds, language, preparationStage: stage });
          router.replace('/');
        },
        onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Could not save your choices. Try again.'),
      },
    );
  };

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']} contentStyle={styles.content}>
      <View style={styles.top}>
        <View style={styles.progressRow} accessible accessibilityLabel={`Step ${step + 1} of 3`}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.progressSeg, i <= step && styles.progressOn]} />
          ))}
        </View>
        <Text variant="caption" tone="secondary">
          Step {step + 1} of 3
        </Text>
      </View>

      <View style={styles.body}>
        {step === 0 ? (
          <>
            <Text variant="display">Which exams are you preparing for?</Text>
            <Text tone="secondary">Choose one or more. You can change this later in Profile.</Text>
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
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Text variant="display">Preferred language</Text>
            <Text tone="secondary">Questions and solutions appear in this language when a translation exists. English sections stay in English.</Text>
            <View style={styles.list} accessibilityRole="radiogroup">
              {(['en', 'hi'] as Language[]).map((l) => {
                const on = language === l;
                return (
                  <Pressable key={l} onPress={() => setLanguage(l)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={l === 'en' ? 'English' : 'Hindi'} style={[styles.choice, on && styles.choiceOn]}>
                    <View style={[styles.choiceIcon, on && styles.choiceIconOn]}>
                      <Icon name={on ? 'checkmark' : 'language-outline'} size={20} color={on ? colors.onPrimary : colors.primary} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="bodyStrong">{l === 'en' ? 'English' : 'हिन्दी (Hindi)'}</Text>
                      <Text variant="bodySmall" tone="secondary">
                        {l === 'en' ? 'Default for all exams' : 'Bilingual papers show Hindi first'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text variant="display">Where are you in your preparation?</Text>
            <Text tone="secondary">This shapes your recommendations on Home.</Text>
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
            <Card>
              <View style={styles.reward}>
                <Icon name="gift-outline" size={22} color={colors.success} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">One free mini mock is unlocked</Text>
                  <Text variant="bodySmall" tone="secondary">
                    It's on your Home screen as soon as you finish.
                  </Text>
                </View>
              </View>
            </Card>
          </>
        ) : null}

        {error ? (
          <View style={styles.errorRow} accessibilityLiveRegion="assertive">
            <Icon name="alert-circle-outline" size={16} color={colors.error} />
            <Text variant="bodySmall" tone="error">
              {error}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        {step > 0 ? <Button label="Back" variant="ghost" icon="arrow-back" onPress={() => setStep(step - 1)} /> : <View />}
        <Button label={step === 2 ? 'Finish' : 'Continue'} icon={step === 2 ? 'checkmark' : 'arrow-forward'} iconPosition="trailing" size="lg" loading={saveProfile.isPending} onPress={next} />
      </View>
      <View style={styles.selectedRow}>
        {examIds.map((id) => {
          const e = exams.find((x) => x.id === id);
          return e ? <Chip key={id} label={e.shortName} tone="primary" /> : null;
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingBottom: space.xl },
  top: { gap: space.sm },
  progressRow: { flexDirection: 'row', gap: space.sm },
  progressSeg: { flex: 1, height: 6, borderRadius: radius.full, backgroundColor: colors.surfaceMuted },
  progressOn: { backgroundColor: colors.primary },
  body: { flex: 1, gap: space.md },
  list: { gap: space.sm, marginTop: space.sm },
  choice: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, minHeight: 64 },
  choiceOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  choiceIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  choiceIconOn: { backgroundColor: colors.primary },
  reward: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.lg },
  selectedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, minHeight: 32 },
});
