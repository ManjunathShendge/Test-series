import { useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';
import { DEVICE_LIMIT, REFUND_WINDOW_DAYS } from '@/lib/demo';
import { useReducedMotion } from '@/lib/a11y';
import { useAppStore } from '@/lib/store/app';
import { Button, Card, Chip, Icon, Screen, Text, TextField } from '@/ui/primitives';
import { colors, space } from '@/ui/tokens';

const FAQ: { q: string; a: string }[] = [
  {
    q: 'What happens if the app closes during a test?',
    a: 'Every answer is saved on your phone as you go. Open the app again and Continue takes you back to the same question. The timer keeps running while you are away, just as in the real exam.',
  },
  {
    q: 'Why can’t I see answers before I submit?',
    a: 'Answer keys and solutions never reach your phone until the test is submitted. That keeps ranks fair for everyone.',
  },
  {
    q: 'How do refunds work?',
    a: `Website purchases get a full refund within ${REFUND_WINDOW_DAYS} days if no test from the purchase has been started. Purchases made in the app are refunded by Google Play or the App Store; open the purchase in Profile for the right link.`,
  },
  {
    q: 'How many devices can I use?',
    a: `${DEVICE_LIMIT} at a time. Remove one from Profile, Devices, before signing in on a new one.`,
  },
  {
    q: 'How are rank and percentile calculated?',
    a: 'Rank compares your first completed attempt with every other student’s first attempt at the same test. Percentile is the share who scored strictly lower. Reattempts are practice and do not change your rank.',
  },
  {
    q: 'I think an answer key is wrong. What now?',
    a: 'Open the question in your result and tap Report. The examiner must respond within 72 hours. If the key changes, every affected score is recalculated and you are notified.',
  },
];

const TOPICS = ['Payment or refund', 'Wrong question or key', 'Account or sign-in', 'Something else'] as const;
const MIN_MESSAGE = 20;

/** Help and support (PRD 4.4 reports, 6.3 refunds; R30 grievance): FAQs, a contact form and grievance route. */
export default function HelpScreen() {
  const email = useAppStore((s) => s.profile.email);
  const reduced = useReducedMotion();
  const [open, setOpen] = useState<number | null>(0);
  const [topic, setTopic] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<{ topic?: string | undefined; message?: string | undefined }>({});
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState<string | null>(null);

  const toggle = (i: number) => {
    if (!reduced) LayoutAnimation.configureNext(LayoutAnimation.create(180, 'easeInEaseOut', 'opacity'));
    setOpen((cur) => (cur === i ? null : i));
  };

  const submit = async () => {
    const next: typeof errors = {};
    if (!topic) next.topic = 'Choose a topic.';
    if (message.trim().length < MIN_MESSAGE) next.message = `Describe the problem in at least ${MIN_MESSAGE} characters.`;
    setErrors(next);
    if (next.topic || next.message) return;
    setBusy(true);
    await new Promise<void>((r) => setTimeout(r, 900));
    setBusy(false);
    setTicket(`SR-${Date.now().toString(36).slice(-6).toUpperCase()}`);
  };

  return (
    <Screen edges={['left', 'right']} contentStyle={{ paddingBottom: space['2xl'] }}>
      <Text variant="heading">Common questions</Text>
      <Card padded={false}>
        {FAQ.map((f, i) => {
          const expanded = open === i;
          return (
            <View key={f.q} style={i > 0 ? styles.divider : undefined}>
              <Pressable onPress={() => toggle(i)} accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={f.q} android_ripple={{ color: colors.surfaceMuted }} style={styles.faqHead}>
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {f.q}
                </Text>
                <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
              </Pressable>
              {expanded ? (
                <Text tone="secondary" style={styles.faqBody}>
                  {f.a}
                </Text>
              ) : null}
            </View>
          );
        })}
      </Card>

      <Text variant="heading">Contact support</Text>
      <Card>
        {ticket ? (
          <View style={styles.success} accessibilityLiveRegion="polite">
            <View style={styles.successIcon}>
              <Icon name="checkmark-circle-outline" size={28} color={colors.success} />
            </View>
            <Text variant="heading" align="center">
              Request {ticket} received
            </Text>
            <Text tone="secondary" align="center">
              We reply to {email} within 72 hours.
            </Text>
            <Button label="Send another" variant="ghost" onPress={() => { setTicket(null); setTopic(null); setMessage(''); }} />
          </View>
        ) : (
          <View style={styles.form}>
            <Text variant="bodySmallStrong" tone={errors.topic ? 'error' : 'default'}>
              Topic
            </Text>
            <View style={styles.chips} accessibilityRole="radiogroup">
              {TOPICS.map((t) => (
                <Chip key={t} label={t} selected={topic === t} onPress={() => { setTopic(t); setErrors((e) => ({ ...e, topic: undefined })); }} />
              ))}
            </View>
            {errors.topic ? (
              <Text variant="bodySmall" tone="error">
                {errors.topic}
              </Text>
            ) : null}
            <TextField
              label="What happened?"
              placeholder="Include the test name and what you expected"
              value={message}
              onChangeText={(v) => { setMessage(v); if (errors.message) setErrors((e) => ({ ...e, message: undefined })); }}
              multiline
              maxLength={1000}
              helper={`${message.trim().length}/${MIN_MESSAGE} characters minimum`}
              {...(errors.message ? { error: errors.message } : {})}
            />
            <Button label="Send to support" icon="send-outline" fullWidth loading={busy} onPress={() => void submit()} />
          </View>
        )}
      </Card>

      <Card>
        <Text variant="bodyStrong">Grievance officer</Text>
        <Text variant="bodySmall" tone="secondary" style={{ marginTop: space.xs }}>
          Unresolved after 72 hours? Escalate to our grievance officer. Name and contact details are published here before launch, as Indian IT rules require.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  divider: { borderTopWidth: 1, borderTopColor: colors.surfaceMuted },
  faqHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, minHeight: 48 },
  faqBody: { paddingHorizontal: space.lg, paddingBottom: space.lg },
  form: { gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  success: { alignItems: 'center', gap: space.sm },
  successIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' },
});
