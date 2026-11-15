import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AnswerState, PaletteState, Paper, Section } from '@/lib/demo';
import { paletteCounts, paletteState } from '@/lib/store/attempt';
import { Icon, Text, type IconName } from '@/ui/primitives';
import { colors, radius, space, touch } from '@/ui/tokens';

/**
 * Five palette states, each with a distinct border, fill and icon so they are
 * distinguishable without colour (attempt override: shape/icon cues, labels
 * announced). Tapping a number navigates; locked sections are disabled.
 */
export const PALETTE_META: Record<PaletteState, { label: string; border: string; fill: string; icon?: IconName; iconColor?: string; dashed?: boolean }> = {
  unvisited: { label: 'Not visited', border: colors.border, fill: colors.surface, dashed: true },
  visited: { label: 'Not answered', border: colors.error, fill: colors.errorSoft, icon: 'ellipse-outline', iconColor: colors.error },
  answered: { label: 'Answered', border: colors.success, fill: colors.successSoft, icon: 'checkmark', iconColor: colors.success },
  marked: { label: 'Marked for review', border: colors.review, fill: colors.reviewSoft, icon: 'bookmark', iconColor: colors.review },
  markedAnswered: { label: 'Answered and marked', border: colors.review, fill: colors.successSoft, icon: 'checkmark', iconColor: colors.review },
};

export interface PaletteProps {
  visible: boolean;
  paper: Paper;
  sections: Section[];
  answers: Record<string, AnswerState>;
  currentIndex: number;
  isSectionLocked: (sectionId: string) => boolean;
  onJump: (index: number) => void;
  onClose: () => void;
}

export function Palette({ visible, paper, sections, answers, currentIndex, isSectionLocked, onJump, onClose }: PaletteProps) {
  const insets = useSafeAreaInsets();
  const counts = paletteCounts(paper, answers);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close question palette" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text variant="title">Questions</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={styles.close}>
              <Icon name="close" size={22} />
            </Pressable>
          </View>

          <View style={styles.legend}>
            {(Object.keys(PALETTE_META) as PaletteState[]).map((state) => {
              const m = PALETTE_META[state];
              return (
                <View key={state} style={styles.legendItem} accessible accessibilityLabel={`${counts[state]} ${m.label.toLowerCase()}`}>
                  <View style={[styles.legendSwatch, { borderColor: m.border, backgroundColor: m.fill, borderStyle: m.dashed ? 'dashed' : 'solid' }]}>
                    {m.icon ? <Icon name={m.icon} size={12} color={m.iconColor} /> : null}
                  </View>
                  <Text variant="caption" tone="secondary" tabular>
                    {counts[state]} {m.label}
                  </Text>
                </View>
              );
            })}
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.sections}>
            {sections.map((section) => {
              const locked = isSectionLocked(section.id);
              const items = paper.questions.map((q, i) => ({ q, i })).filter(({ q }) => q.sectionId === section.id);
              return (
                <View key={section.id} style={styles.section}>
                  <View style={styles.sectionHead}>
                    <Text variant="bodySmallStrong" tone={locked ? 'disabled' : 'secondary'}>
                      {section.name.en}
                    </Text>
                    {locked ? <Icon name="lock-closed-outline" size={14} color={colors.textDisabled} label="Locked" /> : null}
                  </View>
                  <View style={styles.grid}>
                    {items.map(({ q, i }) => {
                      const state = paletteState(answers[q.id]);
                      const m = PALETTE_META[state];
                      const current = i === currentIndex;
                      return (
                        <Pressable
                          key={q.id}
                          disabled={locked}
                          onPress={() => onJump(i)}
                          accessibilityRole="button"
                          accessibilityLabel={`Question ${i + 1}, ${m.label}${current ? ', current' : ''}${locked ? ', section locked' : ''}`}
                          accessibilityState={{ disabled: locked, selected: current }}
                          style={[
                            styles.cell,
                            { borderColor: m.border, backgroundColor: m.fill, borderStyle: m.dashed ? 'dashed' : 'solid' },
                            current && styles.cellCurrent,
                            locked && styles.cellLocked,
                          ]}
                        >
                          <Text variant="bodySmallStrong" tabular tone={locked ? 'disabled' : 'default'}>
                            {i + 1}
                          </Text>
                          {m.icon ? (
                            <View style={styles.cellIcon}>
                              <Icon name={m.icon} size={10} color={m.iconColor} />
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: { maxHeight: '80%', backgroundColor: colors.surface, borderTopLeftRadius: radius.lg + 4, borderTopRightRadius: radius.lg + 4, paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.md },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: radius.full, backgroundColor: colors.border },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -space.md },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minWidth: '45%' },
  legendSwatch: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 0 },
  sections: { gap: space.lg, paddingBottom: space.sm },
  section: { gap: space.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cell: { width: touch.minSize, height: touch.minSize, borderRadius: radius.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  cellCurrent: { borderWidth: 2.5, borderColor: colors.focus },
  cellLocked: { opacity: 0.45 },
  cellIcon: { position: 'absolute', right: 3, bottom: 3 },
});
