import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, View } from 'react-native';
import { REPORT_REASON_LABELS, ReportReason, type AttemptOption } from '@exam-prep/contracts';
import { RichText } from '@/features/attempt/RichText';
import { attemptsApi } from '@/lib/api/attempts';
import { ApiRequestError } from '@/lib/api/http';
import { Button, Card, Chip, Icon, Text, type IconName } from '@/ui/primitives';
import { colors, radius, space, typography } from '@/ui/tokens';

/** One question with the student's answer, the key in force and the worked solution. */
export interface SolutionData {
  questionId: string;
  attemptId: string;
  label: string;
  context?: string;
  subject: string | null;
  topic: string | null;
  stemEn: string;
  stemHi: string | null;
  passageEn: string | null;
  passageHi: string | null;
  options: { id: AttemptOption; textEn: string; textHi?: string | undefined }[];
  imageAssetIds: string[];
  selected: AttemptOption | null;
  correctOption: AttemptOption;
  solutionEn: string | null;
  solutionHi: string | null;
  bookmarked: boolean;
  inNotebook: boolean;
  reported?: boolean;
  keyCorrected?: boolean;
  marksAwarded?: number;
  timeSeconds?: number;
  cohort?: { attempted: number; correct: number; avgSeconds: number | null };
}

const secs = (n: number) => (n >= 60 ? `${Math.floor(n / 60)}m ${Math.round(n % 60)}s` : `${Math.round(n)}s`);

export function SolutionItem({ q, hi, onChange }: { q: SolutionData; hi: boolean; onChange?: (next: SolutionData) => void }) {
  const queryClient = useQueryClient();
  const [data, setData] = useState(q);
  const [busy, setBusy] = useState(false);
  useEffect(() => setData(q), [q]);

  const useHi = hi && !!data.stemHi;
  const outcome = data.selected === null ? 'skip' : data.selected === data.correctOption ? 'right' : 'wrong';
  const status: { label: string; tone: 'success' | 'error' | 'neutral'; icon: IconName } =
    outcome === 'right'
      ? { label: 'Correct', tone: 'success', icon: 'checkmark-circle-outline' }
      : outcome === 'wrong'
        ? { label: 'Wrong', tone: 'error', icon: 'close-circle-outline' }
        : { label: 'Not answered', tone: 'neutral', icon: 'remove-circle-outline' };
  const text = { fontSize: typography.body.fontSize, lineHeight: typography.body.lineHeight, fontFamily: typography.body.fontFamily };
  const passage = useHi ? (data.passageHi ?? data.passageEn) : data.passageEn;
  const solution = useHi ? (data.solutionHi ?? data.solutionEn) : data.solutionEn;

  const commit = (next: SolutionData) => {
    setData(next);
    onChange?.(next);
    void queryClient.invalidateQueries({ queryKey: ['me'] });
  };

  async function save(change: { bookmarked?: boolean; inNotebook?: boolean }) {
    setBusy(true);
    try {
      await attemptsApi.saveQuestion(data.questionId, change);
      commit({ ...data, ...change });
    } catch (e) {
      Alert.alert('Could not save', e instanceof ApiRequestError ? e.message : 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  function report() {
    Alert.alert('Report this question', 'What is wrong? The examiner and our reviewers check every report.', [
      ...ReportReason.options.map((reason) => ({
        text: REPORT_REASON_LABELS[reason],
        onPress: () =>
          void attemptsApi.report(data.questionId, { attemptId: data.attemptId, reason }).then(
            () => {
              commit({ ...data, reported: true });
              Alert.alert('Reported', 'Thanks. If the answer key was wrong, scores are corrected for everyone.');
            },
            (e: unknown) => Alert.alert('Could not send the report', e instanceof ApiRequestError ? e.message : 'Try again.'),
          ),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  return (
    <Card>
      <View style={{ gap: space.md }}>
        {data.context ? (
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {data.context}
          </Text>
        ) : null}
        <View style={styles.top}>
          <Text variant="bodySmallStrong" tone="secondary" style={{ flex: 1 }} numberOfLines={1}>
            {data.label}
            {data.topic ? ` · ${data.topic}` : ''}
          </Text>
          <Chip
            label={`${status.label}${data.marksAwarded !== undefined ? ` ${data.marksAwarded > 0 ? '+' : ''}${data.marksAwarded}` : ''}`}
            tone={status.tone}
            icon={status.icon}
          />
        </View>
        {data.keyCorrected ? <Chip label="Answer key corrected" tone="review" icon="refresh-outline" /> : null}
        {passage ? (
          <View style={styles.passage}>
            <RichText text={passage} style={text} />
          </View>
        ) : null}
        <RichText text={useHi ? data.stemHi! : data.stemEn} style={{ ...text, fontFamily: typography.bodyStrong.fontFamily }} />
        {data.imageAssetIds.map((id, i) => (
          <Figure key={id} attemptId={data.attemptId} assetId={id} label={`Figure ${i + 1}`} />
        ))}
        <View style={{ gap: space.sm }}>
          {data.options.map((o) => {
            const correct = o.id === data.correctOption;
            const chosen = o.id === data.selected;
            return (
              <View
                key={o.id}
                style={[styles.option, correct ? styles.optionCorrect : chosen ? styles.optionWrong : null]}
                accessible
                accessibilityLabel={`Option ${o.id}${correct ? ', correct answer' : ''}${chosen ? ', your answer' : ''}`}
              >
                <View style={styles.key}>
                  <Text variant="bodySmallStrong">{o.id}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <RichText text={useHi && o.textHi ? o.textHi : o.textEn} style={text} />
                </View>
                {correct ? <Icon name="checkmark-circle" size={20} color={colors.success} /> : chosen ? <Icon name="close-circle" size={20} color={colors.error} /> : null}
              </View>
            );
          })}
        </View>
        <View style={styles.solution}>
          <Text variant="bodySmallStrong" tone="primary">
            Solution
          </Text>
          {solution ? <RichText text={solution} style={text} /> : <Text tone="secondary">No worked solution was provided for this question.</Text>}
        </View>
        {data.timeSeconds !== undefined || data.cohort ? (
          <Text variant="caption" tone="secondary">
            {[
              data.timeSeconds !== undefined ? `Your time ${secs(data.timeSeconds)}` : null,
              data.cohort?.avgSeconds != null ? `average ${secs(data.cohort.avgSeconds)}` : null,
              data.cohort && data.cohort.attempted > 0
                ? `${Math.round((data.cohort.correct / data.cohort.attempted) * 100)}% of ${data.cohort.attempted} got it right`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Button
            label={data.bookmarked ? 'Bookmarked' : 'Bookmark'}
            icon={data.bookmarked ? 'bookmark' : 'bookmark-outline'}
            variant="secondary"
            disabled={busy}
            onPress={() => void save({ bookmarked: !data.bookmarked })}
          />
          {data.inNotebook ? <Button label="Mastered" icon="checkmark-done-outline" variant="ghost" disabled={busy} onPress={() => void save({ inNotebook: false })} /> : null}
          <Button label={data.reported ? 'Reported' : 'Report'} icon="flag-outline" variant="ghost" disabled={!!data.reported} onPress={report} />
        </View>
      </View>
    </Card>
  );
}

function Figure({ attemptId, assetId, label }: { attemptId: string; assetId: string; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [ratio, setRatio] = useState(4 / 3);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    attemptsApi.image(attemptId, assetId).then(
      (r) => {
        if (!live) return;
        setUrl(r.url);
        Image.getSize(r.url, (w, h) => live && h > 0 && setRatio(w / h), () => undefined);
      },
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [attemptId, assetId]);
  if (failed) return <Text tone="secondary">This image could not be loaded.</Text>;
  if (!url) return <ActivityIndicator color={colors.primary} />;
  return <Image source={{ uri: url }} accessibilityLabel={label} style={[styles.image, { aspectRatio: ratio }]} resizeMode="contain" />;
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  passage: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border },
  optionCorrect: { borderColor: colors.success, backgroundColor: colors.successSoft },
  optionWrong: { borderColor: colors.error, backgroundColor: colors.errorSoft },
  key: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  solution: { gap: space.xs, padding: space.md, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  image: { width: '100%', borderRadius: radius.md, backgroundColor: colors.surface },
});
