import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AttemptSection, PaperQuestion } from '@exam-prep/contracts';
import { canOpen, counts, formatCountdown, paletteOf, type AttemptState } from '@exam-prep/engine';
import { Palette, PALETTE_META } from '@/features/attempt/Palette';
import { RichText } from '@/features/attempt/RichText';
import { useAttempt } from '@/features/attempt/useAttempt';
import { attemptsApi } from '@/lib/api/attempts';
import { ApiRequestError } from '@/lib/api/http';
import { useAppStore } from '@/lib/store/app';
import { Button, Chip, Icon, Screen, StateView, Text } from '@/ui/primitives';
import { colors, radius, space, touch, typography } from '@/ui/tokens';

const ZOOMS = [1, 1.15, 1.3] as const;

/**
 * CBT attempt (PRD 6.4, docs/TEST_ENGINE.md, design override pages/attempt.md): header with
 * timer and save state, section tabs with locks, question pane, fixed action bar, palette
 * sheet. Answers are committed on the device, then synced; the server decides time and score.
 */
export default function AttemptScreen() {
  const { id, lang } = useLocalSearchParams<{ id: string; lang?: string }>();
  const router = useRouter();
  const a = useAttempt(id);
  const [leaving, setLeaving] = useState(false);
  const active = a.phase.kind === 'running' || a.phase.kind === 'submitting';

  useEffect(() => {
    void a.boot();
    // Boot once per attempt id; the controller re-anchors itself afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Leaving keeps the attempt running on the server; the clock does not stop (decision E17/C3).
  usePreventRemove(active && !leaving, ({ repeat }) => {
    Alert.alert('Leave the test?', 'Your answers are saved and the timer keeps running. You can continue from Home or the test page.', [
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

  // Closed (submitted, timed out or finished elsewhere): show the server's score. Runs after the
  // leave guard above has switched off in the same render.
  const done = a.phase.kind === 'done';
  useEffect(() => {
    if (done) router.replace({ pathname: '/attempt/[id]/summary', params: { id } });
  }, [done, id, router]);

  if (a.phase.kind === 'takeover') {
    const { unsynced } = a.phase;
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <StateView
          kind="denied"
          title="This test is open on another device"
          message={`Move it to this phone to continue. The timer keeps running and the answers the server already has come with you.${
            unsynced > 0 ? ` ${unsynced} change${unsynced === 1 ? '' : 's'} on this phone never reached the server and will be discarded.` : ''
          }`}
          actionLabel="Continue on this phone"
          onAction={() => void a.takeover()}
        />
      </Screen>
    );
  }
  if (a.phase.kind === 'error') {
    const e = a.phase.error;
    const offline = e instanceof ApiRequestError && e.code === 'NETWORK';
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <StateView
          kind={offline ? 'offline' : 'error'}
          title={offline ? 'You’re offline' : e instanceof ApiRequestError && e.status === 404 ? 'Test not found' : 'Couldn’t open the test'}
          message={
            offline
              ? 'Connect to the internet to open the test. The timer is kept by the server.'
              : e instanceof ApiRequestError
                ? e.message
                : 'Something went wrong. Your saved answers are safe.'
          }
          actionLabel="Try again"
          onAction={() => void a.boot()}
        />
      </Screen>
    );
  }
  if (a.phase.kind === 'loading' || a.phase.kind === 'done' || !a.engine || !a.meta) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.wait} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.primary} />
          <Text tone="secondary">{a.phase.kind === 'done' ? 'Opening your score…' : 'Opening your test…'}</Text>
        </View>
      </Screen>
    );
  }
  return <Paper a={a} attemptId={id} engine={a.engine} startLang={lang === 'hi' || lang === 'en' ? lang : null} />;
}

type Controller = ReturnType<typeof useAttempt>;

function Paper({ a, attemptId, engine, startLang }: { a: Controller; attemptId: string; engine: AttemptState; startLang: 'en' | 'hi' | null }) {
  const insets = useSafeAreaInsets();
  const meta = a.meta!;
  const preferred = useAppStore((s) => s.profile.language);
  const [lang, setLang] = useState<'en' | 'hi'>(meta.hasHindi && (startLang ?? preferred) === 'hi' ? 'hi' : 'en');
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]>(1);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dialog, setDialog] = useState<'submit' | 'section' | null>(null);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [engine.current]);

  const item = engine.items[engine.current];
  const question = a.questions[engine.current];
  const answer = item ? engine.answers[item.id] : undefined;
  const section = a.sections.find((s) => s.id === item?.sectionId);
  const openSection = a.sections.find((s) => engine.openSections.includes(s.id));
  const lastSection = a.sections[a.sections.length - 1];
  const waiting = engine.openSections.length === 0;
  const submitting = a.phase.kind === 'submitting';
  const left = Math.max(0, a.deadline - a.clock);
  const sectionLeft = meta.sectional && openSection?.closesAt ? Math.max(0, Date.parse(openSection.closesAt) - a.clock) : null;
  const lowTime = left <= 5 * 60_000;
  const all = counts(engine);
  const state = paletteOf(answer);
  const stateMeta = PALETTE_META[state];
  const lastInSection =
    !!item && !engine.items.slice(engine.current + 1).some((x) => x.sectionId === item.sectionId && engine.openSections.includes(x.sectionId));
  const canFinishSection = meta.sectional && !!openSection && openSection.id !== lastSection?.id;
  const isLastQuestion = engine.current === engine.items.length - 1;
  const hi = lang === 'hi' && !!question?.stemHi;
  const fontSize = typography.body.fontSize * zoom;
  const lineHeight = typography.body.lineHeight * zoom;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text variant="bodySmallStrong" numberOfLines={1}>
            {meta.testTitle}
          </Text>
          <SyncLine a={a} />
        </View>
        <View style={[styles.timer, lowTime && styles.timerLow]} accessible accessibilityRole="timer" accessibilityLabel={`Time remaining ${formatCountdown(left)}`}>
          <Icon name="time-outline" size={16} color={lowTime ? colors.error : colors.text} />
          <Text variant="bodyStrong" tabular tone={lowTime ? 'error' : 'default'} style={styles.timerText}>
            {formatCountdown(left)}
          </Text>
        </View>
        <Pressable onPress={() => setDialog('submit')} disabled={submitting} accessibilityRole="button" accessibilityLabel="Submit test" style={styles.submitBtn}>
          <Text variant="bodySmallStrong" tone="primary">
            Submit
          </Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} style={styles.tabsScroll}>
        {a.sections.map((s) => {
          const open = engine.openSections.includes(s.id);
          const current = s.id === item?.sectionId;
          const first = engine.items.findIndex((q) => q.sectionId === s.id);
          const timeLeft = current && sectionLeft !== null ? formatCountdown(sectionLeft) : null;
          return (
            <Pressable
              key={s.id}
              disabled={!open || submitting}
              onPress={() => a.dispatch({ type: 'go', index: first })}
              accessibilityRole="tab"
              accessibilityState={{ selected: current, disabled: !open }}
              accessibilityLabel={`${s.name}${open ? '' : s.state === 'closed' ? ', closed' : ', locked'}${timeLeft ? `, ${timeLeft} left` : ''}`}
              style={[styles.tab, current && styles.tabCurrent, !open && styles.tabLocked]}
            >
              {!open ? <Icon name="lock-closed-outline" size={14} color={colors.textDisabled} /> : null}
              <Text variant="bodySmallStrong" tone={current ? 'primary' : open ? 'secondary' : 'disabled'} numberOfLines={1}>
                {s.name}
              </Text>
              {timeLeft ? (
                <Text variant="caption" tone="primary" tabular>
                  {timeLeft}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.toolbar}>
        <View style={styles.qMeta}>
          <Text variant="bodySmallStrong" tabular>
            Q{question?.number ?? engine.current + 1}
            <Text variant="bodySmall" tone="secondary" tabular>
              {' '}
              / {engine.items.length}
            </Text>
          </Text>
          <Chip
            label={stateMeta.label}
            tone={state === 'answered' ? 'success' : state === 'not_answered' ? 'error' : state === 'not_visited' ? 'neutral' : 'review'}
            icon={stateMeta.icon ?? 'ellipse-outline'}
          />
        </View>
        <View style={styles.tools}>
          {meta.hasHindi ? (
            <Pressable
              onPress={() => setLang(lang === 'en' ? 'hi' : 'en')}
              accessibilityRole="button"
              accessibilityLabel={`Language ${lang === 'en' ? 'English' : 'Hindi'}, tap to switch`}
              style={styles.tool}
            >
              <Icon name="language-outline" size={18} color={colors.primary} />
              <Text variant="caption" tone="primary">
                {lang === 'en' ? 'EN' : 'हिं'}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setZoom(ZOOMS[(ZOOMS.indexOf(zoom) + 1) % ZOOMS.length] ?? 1)}
            accessibilityRole="button"
            accessibilityLabel={`Text size ${Math.round(zoom * 100)} percent, tap to change`}
            style={styles.tool}
          >
            <Icon name="text-outline" size={18} color={colors.primary} />
            <Text variant="caption" tone="primary" tabular>
              {Math.round(zoom * 100)}%
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setPaletteOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Open question palette. ${all.answered + all.answeredAndMarked} answered of ${all.total}`}
            style={styles.tool}
          >
            <Icon name="grid-outline" size={18} color={colors.primary} />
            <Text variant="caption" tone="primary" tabular>
              {all.answered + all.answeredAndMarked}/{all.total}
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView ref={scrollRef} style={styles.pane} contentContainerStyle={styles.paneContent}>
        <View style={styles.watermark} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {Array.from({ length: 10 }, (_, i) => (
            <Text key={i} variant="caption" style={styles.watermarkText}>
              {meta.watermark}
            </Text>
          ))}
        </View>
        <Banners a={a} />
        {waiting ? (
          <View style={styles.wait}>
            <ActivityIndicator color={colors.primary} />
            <Text tone="secondary">{a.net === 'offline' ? 'Waiting for a connection to open the next section…' : 'Opening the next section…'}</Text>
          </View>
        ) : question ? (
          <QuestionBody
            attemptId={attemptId}
            question={question}
            section={section}
            hi={hi}
            wantsHindi={lang === 'hi'}
            fontSize={fontSize}
            lineHeight={lineHeight}
            selected={answer?.selected ?? null}
            disabled={submitting || !canOpen(engine, engine.current)}
            onSelect={(option) => a.dispatch({ type: 'select', option })}
          />
        ) : null}
        <View style={{ height: space.xl }} />
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom + space.sm }]}>
        <Pressable
          onPress={() => a.dispatch({ type: 'mark_next' })}
          disabled={submitting || waiting}
          accessibilityRole="button"
          accessibilityLabel="Mark for review and next"
          style={[styles.secondaryAction, (submitting || waiting) && styles.disabled]}
        >
          <Icon name={answer?.marked ? 'bookmark' : 'bookmark-outline'} size={20} color={answer?.marked ? colors.review : colors.textSecondary} />
          <Text variant="caption" tone="secondary">
            Mark & next
          </Text>
        </Pressable>
        <Pressable
          onPress={() => a.dispatch({ type: 'clear' })}
          disabled={!answer?.selected || submitting}
          accessibilityRole="button"
          accessibilityLabel="Clear response"
          accessibilityState={{ disabled: !answer?.selected }}
          style={[styles.secondaryAction, (!answer?.selected || submitting) && styles.disabled]}
        >
          <Icon name="backspace-outline" size={20} color={colors.textSecondary} />
          <Text variant="caption" tone="secondary">
            Clear
          </Text>
        </Pressable>
        <View style={styles.primaryAction}>
          {canFinishSection && lastInSection ? (
            <Button label={`Finish ${openSection?.name ?? 'section'}`} icon="arrow-forward" iconPosition="trailing" fullWidth onPress={() => setDialog('section')} disabled={submitting} />
          ) : isLastQuestion || (lastInSection && !canFinishSection) ? (
            <Button label="Review & submit" icon="checkmark-done-outline" fullWidth onPress={() => setDialog('submit')} disabled={submitting} />
          ) : (
            <Button
              label="Save & Next"
              icon="arrow-forward"
              iconPosition="trailing"
              fullWidth
              onPress={() => a.dispatch({ type: 'save_next' })}
              disabled={submitting || waiting}
            />
          )}
        </View>
      </View>

      <Palette
        visible={paletteOpen}
        engine={engine}
        numbers={a.questions.map((q) => q.number)}
        sections={a.sections}
        onJump={(i) => {
          a.dispatch({ type: 'go', index: i });
          setPaletteOpen(false);
        }}
        onClose={() => setPaletteOpen(false)}
      />

      <Dialog visible={dialog === 'submit'} onClose={() => setDialog(null)}>
        <Text variant="title">Submit test?</Text>
        <Text tone="secondary">You can’t change answers after submitting. Marked questions with an answer are evaluated.</Text>
        <View style={styles.summaryGrid}>
          <Summary label="Answered" value={all.answered + all.answeredAndMarked} tone="success" />
          <Summary label="Not answered" value={all.notAnswered} tone="error" />
          <Summary label="Marked" value={all.marked + all.answeredAndMarked} tone="review" />
          <Summary label="Not visited" value={all.notVisited} tone="neutral" />
        </View>
        <View style={styles.row}>
          <Icon name="time-outline" size={16} color={colors.textSecondary} />
          <Text variant="bodySmall" tone="secondary" tabular>
            {formatCountdown(left)} remaining
          </Text>
        </View>
        {a.pending > 0 && a.net === 'offline' ? (
          <View style={styles.warn}>
            <Icon name="cloud-upload-outline" size={16} color={colors.warning} />
            <Text variant="bodySmall" tone="warning" style={{ flex: 1 }}>
              You’re offline. {a.pending} change{a.pending === 1 ? ' is' : 's are'} saved on this phone and will be sent with your submission.
            </Text>
          </View>
        ) : null}
        {canFinishSection ? (
          <Text variant="bodySmall" tone="secondary">
            Sections you haven’t reached yet close with this submission.
          </Text>
        ) : null}
        <View style={styles.dialogActions}>
          <Button label="Keep attempting" variant="secondary" onPress={() => setDialog(null)} />
          <Button
            label="Submit"
            icon="checkmark"
            onPress={() => {
              setDialog(null);
              void a.submit();
            }}
          />
        </View>
      </Dialog>

      <Dialog visible={dialog === 'section' && !!openSection} onClose={() => setDialog(null)}>
        <Text variant="title">Finish {openSection?.name}?</Text>
        <Text tone="secondary">
          You can’t come back to this section, and its remaining {sectionLeft !== null ? formatCountdown(sectionLeft) : 'time'} won’t be added to the next one.
        </Text>
        {openSection ? <SectionCounts engine={engine} section={openSection} /> : null}
        <View style={styles.dialogActions}>
          <Button label="Stay" variant="secondary" onPress={() => setDialog(null)} />
          <Button
            label="Finish section"
            icon="arrow-forward"
            iconPosition="trailing"
            onPress={() => {
              setDialog(null);
              if (openSection) a.finishSection(openSection.id);
            }}
          />
        </View>
      </Dialog>

      <Dialog visible={submitting} onClose={() => undefined}>
        <Text variant="title">{a.phase.kind === 'submitting' && a.phase.waiting ? 'Submission pending' : 'Submitting your test…'}</Text>
        {a.phase.kind === 'submitting' && a.phase.waiting ? (
          <Text tone="secondary">You’re offline. Your answers are saved on this phone and we’ll submit as soon as you reconnect. Keep the app open.</Text>
        ) : (
          <View style={styles.row}>
            <ActivityIndicator color={colors.primary} />
            <Text tone="secondary">Sending your final answers</Text>
          </View>
        )}
      </Dialog>
    </View>
  );
}

function SyncLine({ a }: { a: Controller }) {
  const [icon, label, tone] = a.storageFailed
    ? (['alert-circle-outline', 'Not saved on this phone', colors.error] as const)
    : a.net === 'offline'
      ? (['cloud-offline-outline', `Offline · ${a.pending} saved on this phone`, colors.warning] as const)
      : a.net === 'saving' || a.pending > 0
        ? (['phone-portrait-outline', 'Saved on this phone · syncing', colors.textSecondary] as const)
        : (['cloud-done-outline', 'All answers saved', colors.success] as const);
  return (
    <View style={styles.row} accessible accessibilityLiveRegion="polite" accessibilityLabel={label}>
      <Icon name={icon} size={14} color={tone} />
      <Text variant="caption" style={{ color: tone }}>
        {label}
      </Text>
    </View>
  );
}

function Banners({ a }: { a: Controller }) {
  return (
    <>
      {a.storageFailed ? (
        <View style={[styles.banner, styles.bannerError]} accessibilityRole="alert">
          <Text variant="bodySmall" tone="error" style={{ flex: 1 }}>
            This phone didn’t save your last change. It will still be sent to the server while you’re online.
          </Text>
          <Button label="Try again" variant="secondary" size="md" onPress={a.retryStorage} />
        </View>
      ) : null}
      {a.net === 'offline' ? (
        <View style={styles.banner}>
          <Text variant="bodySmall" tone="warning" style={{ flex: 1 }}>
            You’re offline. Keep answering: answers are saved on this phone and sent when you reconnect. The timer keeps running.
          </Text>
        </View>
      ) : null}
      {a.notice ? (
        <View style={[styles.banner, styles.bannerInfo]}>
          <Text variant="bodySmall" tone="primary" style={{ flex: 1 }}>
            {a.notice}
          </Text>
          <Pressable onPress={a.dismissNotice} accessibilityRole="button" accessibilityLabel="Dismiss" style={styles.dismiss}>
            <Icon name="close" size={18} color={colors.primary} />
          </Pressable>
        </View>
      ) : null}
    </>
  );
}

function QuestionBody({
  attemptId,
  question,
  section,
  hi,
  wantsHindi,
  fontSize,
  lineHeight,
  selected,
  disabled,
  onSelect,
}: {
  attemptId: string;
  question: PaperQuestion;
  section: AttemptSection | undefined;
  hi: boolean;
  wantsHindi: boolean;
  fontSize: number;
  lineHeight: number;
  selected: string | null;
  disabled: boolean;
  onSelect: (option: 'A' | 'B' | 'C' | 'D') => void;
}) {
  const passage = hi ? (question.passageHi ?? question.passageEn) : question.passageEn;
  const text = { fontSize, lineHeight, fontFamily: typography.body.fontFamily };
  return (
    <View style={{ gap: space.md }}>
      <Text variant="caption" tone="secondary">
        {section?.name} · +{question.positiveMarks}
        {question.negativeMarks ? ` / −${question.negativeMarks}` : ''}
      </Text>
      {wantsHindi && !question.stemHi ? (
        <Text variant="caption" tone="secondary">
          Hindi isn’t available for this question; showing English.
        </Text>
      ) : null}
      {passage ? (
        <View style={styles.passage}>
          <RichText text={passage} style={text} />
        </View>
      ) : null}
      <View accessibilityRole="header">
        <RichText text={hi ? question.stemHi! : question.stemEn} style={{ ...text, fontFamily: typography.bodyStrong.fontFamily, fontSize: fontSize * 1.05 }} />
      </View>
      {question.imageAssetIds.map((assetId, i) => (
        <QuestionImage key={assetId} attemptId={attemptId} assetId={assetId} label={`Figure ${i + 1} for question ${question.number}`} />
      ))}
      <View style={styles.options} accessibilityRole="radiogroup">
        {question.options.map((o) => {
          const on = selected === o.id;
          const optionText = hi && o.textHi ? o.textHi : o.textEn;
          return (
            <Pressable
              key={o.id}
              onPress={() => onSelect(o.id)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled }}
              accessibilityLabel={`Option ${o.id}. ${optionText}`}
              android_ripple={{ color: colors.primarySoft }}
              style={({ pressed }) => [styles.option, on && styles.optionSelected, pressed && styles.optionPressed, disabled && styles.disabled]}
            >
              <View style={[styles.radio, on && styles.radioOn]}>
                {on ? (
                  <Icon name="checkmark" size={14} color={colors.onPrimary} />
                ) : (
                  <Text variant="bodySmallStrong" tone="secondary">
                    {o.id}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <RichText text={optionText} style={text} />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Figures come through short-lived links scoped to this attempt. */
function QuestionImage({ attemptId, assetId, label }: { attemptId: string; assetId: string; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [ratio, setRatio] = useState(4 / 3);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let live = true;
    setFailed(false);
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
  }, [attemptId, assetId, tries]);
  if (failed)
    return (
      <View style={styles.imageWait}>
        <Button label="Image didn’t load. Try again" variant="secondary" size="md" onPress={() => setTries((t) => t + 1)} />
      </View>
    );
  if (!url)
    return (
      <View style={styles.imageWait}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  return (
    <Image
      source={{ uri: url }}
      accessibilityLabel={label}
      style={[styles.image, { aspectRatio: ratio }]}
      resizeMode="contain"
      onError={() => {
        setUrl(null);
        setFailed(true);
      }}
    />
  );
}

function SectionCounts({ engine, section }: { engine: AttemptState; section: AttemptSection }) {
  const c = counts(engine, section.id);
  return (
    <View style={styles.summaryGrid}>
      <Summary label="Answered" value={c.answered + c.answeredAndMarked} tone="success" />
      <Summary label="Not answered" value={c.notAnswered} tone="error" />
      <Summary label="Marked" value={c.marked + c.answeredAndMarked} tone="review" />
      <Summary label="Not visited" value={c.notVisited} tone="neutral" />
    </View>
  );
}

function Dialog({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.center}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={styles.dialog} accessibilityViewIsModal>
          {children}
        </View>
      </View>
    </Modal>
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
  wait: { flex: 1, minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerLeft: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
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
  watermark: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', alignContent: 'space-around', opacity: 0.06 },
  watermarkText: { transform: [{ rotate: '-24deg' }], margin: space.xl, color: colors.text },
  passage: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  options: { gap: space.sm, marginTop: space.sm },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, padding: space.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionPressed: { backgroundColor: colors.surfaceMuted },
  radio: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  radioOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  image: { width: '100%', borderRadius: radius.md, backgroundColor: colors.surface },
  imageWait: { minHeight: 120, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.warningSoft },
  bannerError: { backgroundColor: colors.errorSoft },
  bannerInfo: { backgroundColor: colors.primarySoft },
  dismiss: { width: touch.minSize, height: touch.minSize, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.sm, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  secondaryAction: { width: 72, minHeight: touch.minSize, alignItems: 'center', justifyContent: 'center', gap: 2 },
  disabled: { opacity: 0.4 },
  primaryAction: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', padding: space.lg, backgroundColor: colors.overlay },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.xl, gap: space.md },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  summaryItem: { flexBasis: '45%', flexGrow: 1, gap: 2, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  warn: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', padding: space.md, borderRadius: radius.md, backgroundColor: colors.warningSoft },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm, marginTop: space.sm },
});
