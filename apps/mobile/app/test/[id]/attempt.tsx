import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Palette, PALETTE_META } from '@/features/attempt/Palette';
import type { Bilingual } from '@/lib/demo';
import { formatClock } from '@/lib/format';
import { announce } from '@/lib/a11y';
import { useAppStore } from '@/lib/store/app';
import { isSectionOpen, paletteCounts, paletteState, useAttemptStore, type ZoomLevel } from '@/lib/store/attempt';
import { useResultsStore } from '@/lib/store/results';
import { Button, Chip, Icon, Screen, StateView, Text } from '@/ui/primitives';
import { colors, radius, space, touch, typography } from '@/ui/tokens';

const ZOOMS: ZoomLevel[] = [1, 1.15, 1.3];

/**
 * CBT attempt (PRD 6.4, docs/TEST_ENGINE.md, design override pages/attempt.md):
 * stable header with timer and sync state, section tabs with locks, scrollable
 * question pane, fixed action bar, collapsible palette. Marking never erases an
 * answer. Deadline auto-submit does not depend on any modal confirmation.
 */
export default function AttemptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const a = useAttemptStore();
  const addResult = useResultsStore((s) => s.addResult);
  const markAttempted = useAppStore((s) => s.markAttempted);

  const [now, setNow] = useState(() => Date.now());
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const announced = useRef<Set<string>>(new Set());
  const [leaving, setLeaving] = useState(false);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const active = a.status === 'in_progress' && a.test?.id === id && a.paper;

  // Leaving keeps the attempt in progress; the clock keeps running (decision E17/C3).
  // usePreventRemove covers the header back button, the Android back gesture and
  // programmatic navigation alike (design override pages/attempt.md). expo-router's
  // contract: drop the guard, then `repeat()` the blocked action.
  const disablePrevention = usePreventRemove(!!active && !leaving, ({ repeat }) => {
    Alert.alert('Leave the test?', 'Your answers are saved on this device and the timer keeps running. You can continue from Home.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => {
          setLeaving(true);
          repeat();
        },
      },
    ]);
  });

  // One-second tick: drives the clock, section windows and the deadline.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  const finish = useCallback(
    (reason: 'manual' | 'deadline') => {
      const result = a.submit(reason);
      if (!result) return;
      addResult(result);
      markAttempted(result.testId);
      setLeaving(true);
      disablePrevention();
      router.replace({ pathname: '/result/[attemptId]', params: { attemptId: result.attemptId, fresh: '1' } });
    },
    [a, addResult, markAttempted, router, disablePrevention],
  );

  // Sync indicator: "saved on device" becomes "synced" shortly after each change (mock).
  useEffect(() => {
    if (a.sync !== 'saved') return;
    const t = setTimeout(() => a.markSynced(), 1500);
    return () => clearTimeout(t);
  }, [a.sync, a.eventCount, a]);

  const remaining = Math.max(0, Math.floor((a.deadlineAt - now) / 1000));

  // Deadline and milestone announcements.
  useEffect(() => {
    if (!active) return;
    if (remaining <= 0) {
      finish('deadline');
      return;
    }
    const milestone = remaining === 300 ? '5 minutes remaining' : remaining === 60 ? '1 minute remaining' : null;
    if (milestone && !announced.current.has(milestone)) {
      announced.current.add(milestone);
      announce(milestone);
    }
  }, [remaining, active, finish]);

  // Sectional papers: when the open window moves on, jump to the new section's first question.
  useEffect(() => {
    if (!active || !a.sectionWindows || !a.paper) return;
    const current = a.paper.questions[a.currentIndex];
    if (current && isSectionOpen(a.sectionWindows, current.sectionId, now)) return;
    const open = a.sectionWindows.find((w) => now >= w.startsAt && now < w.endsAt);
    if (!open) return;
    const idx = a.paper.questions.findIndex((q) => q.sectionId === open.sectionId);
    if (idx >= 0) {
      a.visit(idx);
      announce(`${a.test?.sections.find((s) => s.id === open.sectionId)?.name.en ?? 'Next section'} has started`);
    }
  }, [now, active, a]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [a.currentIndex]);

  const counts = useMemo(() => (a.paper ? paletteCounts(a.paper, a.answers) : null), [a.paper, a.answers]);

  if (!active || !a.test || !a.paper) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <StateView
          kind={a.status === 'submitted' || a.status === 'auto_submitted' ? 'empty' : 'error'}
          title={a.status === 'idle' ? 'No attempt in progress' : 'Attempt already submitted'}
          message={a.status === 'idle' ? 'Start from the instructions screen so the timer begins correctly.' : 'Open your result from Progress.'}
          actionLabel="Back"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const { test, paper } = a;
  const question = paper.questions[a.currentIndex];
  if (!question) return null;
  const answer = a.answers[question.id];
  const section = test.sections.find((s) => s.id === question.sectionId);
  const total = paper.questions.length;
  const isLast = a.currentIndex === total - 1;
  const bilingual = test.languages.includes('hi');
  const t = (b: Bilingual) => (a.language === 'hi' && b.hi ? b.hi : b.en);
  const scale = a.zoom;
  const lowTime = remaining <= 300;
  const isLocked = (sectionId: string) => (a.sectionWindows ? !isSectionOpen(a.sectionWindows, sectionId, now) : false);
  const state = paletteState(answer);
  const stateMeta = PALETTE_META[state];

  const onSubmitPress = () => setSummaryOpen(true);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header: fixed height so the timer never shifts layout. */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text variant="bodySmallStrong" numberOfLines={1} style={{ flex: 1 }}>
            {test.title}
          </Text>
          <View style={styles.sync} accessibilityLiveRegion="polite" accessible accessibilityLabel={a.sync === 'saved' ? 'Saved on this device, waiting to sync' : 'Synced'}>
            <Icon name={a.sync === 'synced' ? 'cloud-done-outline' : 'phone-portrait-outline'} size={14} color={colors.textSecondary} />
            <Text variant="caption" tone="secondary">
              {a.sync === 'synced' ? 'Synced' : 'Saved on device'}
            </Text>
          </View>
        </View>
        <View style={[styles.timer, lowTime && styles.timerLow]} accessible accessibilityLabel={`Time remaining ${formatClock(remaining)}`}>
          <Icon name="time-outline" size={16} color={lowTime ? colors.error : colors.text} />
          <Text variant="bodyStrong" tabular tone={lowTime ? 'error' : 'default'} style={styles.timerText}>
            {formatClock(remaining)}
          </Text>
        </View>
        <Pressable onPress={onSubmitPress} accessibilityRole="button" accessibilityLabel="Submit test" style={styles.submitBtn}>
          <Text variant="bodySmallStrong" tone="primary">
            Submit
          </Text>
        </Pressable>
      </View>

      {/* Section tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} style={styles.tabsScroll}>
        {test.sections.map((s) => {
          const locked = isLocked(s.id);
          const current = s.id === question.sectionId;
          const first = paper.questions.findIndex((q) => q.sectionId === s.id);
          const w = a.sectionWindows?.find((x) => x.sectionId === s.id);
          const secLeft = w && current ? formatClock(Math.max(0, Math.floor((w.endsAt - now) / 1000))) : null;
          return (
            <Pressable
              key={s.id}
              disabled={locked}
              onPress={() => a.visit(first)}
              accessibilityRole="tab"
              accessibilityState={{ selected: current, disabled: locked }}
              accessibilityLabel={`${s.name.en}${locked ? ', locked' : ''}${secLeft ? `, ${secLeft} left` : ''}`}
              style={[styles.tab, current && styles.tabCurrent, locked && styles.tabLocked]}
            >
              {locked ? <Icon name="lock-closed-outline" size={14} color={colors.textDisabled} /> : null}
              <Text variant="bodySmallStrong" tone={current ? 'primary' : locked ? 'disabled' : 'secondary'} numberOfLines={1}>
                {t(s.name)}
              </Text>
              {secLeft ? (
                <Text variant="caption" tone="primary" tabular>
                  {secLeft}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Toolbar: question meta, language, zoom, palette */}
      <View style={styles.toolbar}>
        <View style={styles.qMeta}>
          <Text variant="bodySmallStrong" tabular>
            Q{a.currentIndex + 1}
            <Text variant="bodySmall" tone="secondary" tabular>
              {' '}
              / {total}
            </Text>
          </Text>
          <Chip label={stateMeta.label} tone={state === 'answered' ? 'success' : state === 'visited' ? 'error' : state.startsWith('marked') ? 'review' : 'neutral'} icon={stateMeta.icon ?? 'ellipse-outline'} />
        </View>
        <View style={styles.tools}>
          {bilingual ? (
            question.stem.hi ? (
              <Pressable onPress={() => a.setLanguage(a.language === 'en' ? 'hi' : 'en')} accessibilityRole="button" accessibilityLabel={`Language ${a.language === 'en' ? 'English' : 'Hindi'}, tap to switch to ${a.language === 'en' ? 'Hindi' : 'English'}`} style={styles.tool}>
                <Icon name="language-outline" size={18} color={colors.primary} />
                <Text variant="caption" tone="primary">
                  {a.language === 'en' ? 'EN' : 'हिं'}
                </Text>
              </Pressable>
            ) : (
              <View accessible accessibilityLabel="This question is in English only" style={styles.tool}>
                <Icon name="language-outline" size={18} color={colors.textDisabled} />
                <Text variant="caption" style={{ color: colors.textDisabled }}>
                  EN only
                </Text>
              </View>
            )
          ) : null}
          <Pressable onPress={() => a.setZoom(ZOOMS[(ZOOMS.indexOf(a.zoom) + 1) % ZOOMS.length] ?? 1)} accessibilityRole="button" accessibilityLabel={`Text size ${Math.round(a.zoom * 100)} percent, tap to change`} style={styles.tool}>
            <Icon name="text-outline" size={18} color={colors.primary} />
            <Text variant="caption" tone="primary" tabular>
              {Math.round(a.zoom * 100)}%
            </Text>
          </Pressable>
          <Pressable onPress={() => setPaletteOpen(true)} accessibilityRole="button" accessibilityLabel={`Open question palette. ${counts?.answered ?? 0} answered of ${total}`} style={styles.tool}>
            <Icon name="grid-outline" size={18} color={colors.primary} />
            <Text variant="caption" tone="primary" tabular>
              {counts?.answered ?? 0}/{total}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Question pane */}
      <ScrollView ref={scrollRef} style={styles.pane} contentContainerStyle={styles.paneContent} keyboardShouldPersistTaps="handled">
        <Text variant="caption" tone="secondary">
          {section?.name.en} · {question.topic} · +{section?.marksPerQuestion ?? 1} / −{Number((section?.negativeMarks ?? 0).toFixed(2))}
        </Text>
        {question.passage ? (
          <View style={styles.passage}>
            <Text style={{ fontSize: typography.body.fontSize * scale, lineHeight: typography.body.lineHeight * scale }}>{t(question.passage)}</Text>
          </View>
        ) : null}
        <Text accessibilityRole="header" style={{ ...typography.bodyStrong, fontSize: typography.heading.fontSize * scale, lineHeight: typography.heading.lineHeight * scale }}>
          {t(question.stem)}
        </Text>

        <View style={styles.options} accessibilityRole="radiogroup">
          {question.options.map((o) => {
            const selected = answer?.selectedOptionId === o.id;
            return (
              <Pressable
                key={o.id}
                onPress={() => a.select(o.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`Option ${o.id}. ${t(o.text)}`}
                android_ripple={{ color: colors.primarySoft }}
                style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.optionPressed]}
              >
                <View style={[styles.radio, selected && styles.radioOn]}>
                  {selected ? <Icon name="checkmark" size={14} color={colors.onPrimary} /> : (
                    <Text variant="bodySmallStrong" tone="secondary">
                      {o.id}
                    </Text>
                  )}
                </View>
                <Text style={{ flex: 1, fontSize: typography.body.fontSize * scale, lineHeight: typography.body.lineHeight * scale, color: colors.text }}>{t(o.text)}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={{ height: space.xl }} />
      </ScrollView>

      {/* Fixed action bar */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + space.sm }]}>
        <Pressable onPress={a.toggleMark} accessibilityRole="button" accessibilityState={{ selected: !!answer?.marked }} accessibilityLabel={answer?.marked ? 'Unmark review' : 'Mark for review'} style={styles.secondaryAction}>
          <Icon name={answer?.marked ? 'bookmark' : 'bookmark-outline'} size={20} color={answer?.marked ? colors.review : colors.textSecondary} />
          <Text variant="caption" tone={answer?.marked ? 'default' : 'secondary'} style={answer?.marked ? { color: colors.review } : undefined}>
            {answer?.marked ? 'Marked' : 'Mark'}
          </Text>
        </Pressable>
        <Pressable onPress={a.clear} disabled={!answer?.selectedOptionId} accessibilityRole="button" accessibilityLabel="Clear response" accessibilityState={{ disabled: !answer?.selectedOptionId }} style={[styles.secondaryAction, !answer?.selectedOptionId && styles.disabled]}>
          <Icon name="backspace-outline" size={20} color={colors.textSecondary} />
          <Text variant="caption" tone="secondary">
            Clear
          </Text>
        </Pressable>
        <View style={styles.primaryAction}>
          {isLast ? (
            <Button label="Review & submit" icon="checkmark-done-outline" fullWidth onPress={onSubmitPress} />
          ) : (
            <Button label="Save & Next" icon="arrow-forward" iconPosition="trailing" fullWidth onPress={a.saveAndNext} />
          )}
        </View>
      </View>

      <Palette visible={paletteOpen} paper={paper} sections={test.sections} answers={a.answers} currentIndex={a.currentIndex} isSectionLocked={isLocked} onJump={(i) => { a.visit(i); setPaletteOpen(false); }} onClose={() => setPaletteOpen(false)} />

      {/* Submit summary (PRD 6.4: summary screen before manual submit) */}
      <Modal visible={summaryOpen} transparent animationType="fade" onRequestClose={() => setSummaryOpen(false)} statusBarTranslucent>
        <View style={styles.center}>
          <Pressable style={styles.scrim} onPress={() => setSummaryOpen(false)} accessibilityRole="button" accessibilityLabel="Cancel submit" />
          <View style={styles.dialog} accessibilityViewIsModal>
            <Text variant="title">Submit test?</Text>
            <Text tone="secondary">You cannot change answers after submitting. Marked questions with an answer are evaluated.</Text>
            {counts ? (
              <View style={styles.summaryGrid}>
                <Summary label="Answered" value={counts.answered + counts.markedAnswered} tone="success" />
                <Summary label="Not answered" value={counts.visited} tone="error" />
                <Summary label="Marked" value={counts.marked + counts.markedAnswered} tone="review" />
                <Summary label="Not visited" value={counts.unvisited} tone="neutral" />
              </View>
            ) : null}
            <View style={styles.summaryTime}>
              <Icon name="time-outline" size={16} color={colors.textSecondary} />
              <Text variant="bodySmall" tone="secondary" tabular>
                {formatClock(remaining)} remaining
              </Text>
            </View>
            {a.sync === 'saved' ? (
              <View style={styles.warn}>
                <Icon name="cloud-upload-outline" size={16} color={colors.warning} />
                <Text variant="bodySmall" tone="warning">
                  Some answers are saved on this device but not synced yet. They are sent with your submission.
                </Text>
              </View>
            ) : null}
            <View style={styles.dialogActions}>
              <Button label="Keep attempting" variant="secondary" onPress={() => setSummaryOpen(false)} />
              <Button label="Submit" icon="checkmark" onPress={() => { setSummaryOpen(false); finish('manual'); }} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Summary({ label, value, tone }: { label: string; value: number; tone: 'success' | 'error' | 'review' | 'neutral' }) {
  const color = tone === 'success' ? colors.success : tone === 'error' ? colors.error : tone === 'review' ? colors.review : colors.textSecondary;
  return (
    <View style={styles.summaryItem} accessible accessibilityLabel={`${value} ${label.toLowerCase()}`}>
      <Text variant="title" tabular style={{ color }}>
        {value}
      </Text>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerLeft: { flex: 1, gap: 2 },
  sync: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  timer: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.md, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, minWidth: 92, justifyContent: 'center' },
  timerLow: { backgroundColor: colors.errorSoft },
  timerText: { minWidth: 48, textAlign: 'center' },
  submitBtn: { minHeight: touch.minSize, justifyContent: 'center', paddingLeft: space.sm },
  tabsScroll: { flexGrow: 0, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabs: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm },
  tab: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  tabCurrent: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  tabLocked: { opacity: 0.6 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm },
  qMeta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flex: 1 },
  tools: { flexDirection: 'row', gap: space.xs },
  tool: { minWidth: touch.minSize, minHeight: 40, alignItems: 'center', justifyContent: 'center', gap: 1, paddingHorizontal: space.xs, borderRadius: radius.md },
  pane: { flex: 1 },
  paneContent: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.md },
  passage: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  options: { gap: space.sm, marginTop: space.sm },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, padding: space.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionPressed: { backgroundColor: colors.surfaceMuted },
  radio: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  radioOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.sm, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  secondaryAction: { width: 64, minHeight: touch.minSize, alignItems: 'center', justifyContent: 'center', gap: 2 },
  disabled: { opacity: 0.4 },
  primaryAction: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', padding: space.lg, backgroundColor: colors.overlay },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.xl, gap: space.md },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  summaryItem: { flexBasis: '45%', flexGrow: 1, gap: 2, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  summaryTime: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  warn: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', padding: space.md, borderRadius: radius.md, backgroundColor: colors.warningSoft },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm, marginTop: space.sm },
});
