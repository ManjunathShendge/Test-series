import { StyleSheet, View } from 'react-native';
import { DELETION_GRACE_DAYS, DEVICE_LIMIT, REFUND_WINDOW_DAYS } from '@/lib/demo';
import { useAppStore } from '@/lib/store/app';
import { Card, Chip, Screen, Text, ToggleRow } from '@/ui/primitives';
import { space } from '@/ui/tokens';

const SECTIONS: { title: string; points: string[] }[] = [
  {
    title: 'Terms of use',
    points: [
      'You must be 18 or older to create an account.',
      `Paid tests are for your personal use on up to ${DEVICE_LIMIT} devices.`,
      'Copying, recording or sharing questions or solutions is not allowed.',
      'Ranks use each student’s first completed attempt. Corrections to answer keys can change scores.',
    ],
  },
  {
    title: 'Privacy',
    points: [
      'We store your name, email, target exams, attempts, results and purchases to run the service.',
      'Question content and your answers are never sent to analytics tools.',
      'Payment card and UPI details stay with Google Play, the App Store or Razorpay. We never see them.',
      `You can delete your account from Profile. Deletion runs after a ${DELETION_GRACE_DAYS}-day grace period; tax records are kept as the law requires.`,
    ],
  },
  {
    title: 'Refunds',
    points: [
      `Website purchases: full refund within ${REFUND_WINDOW_DAYS} days if no test from the purchase has been started.`,
      'In-app purchases: refunds are decided by Google Play or the App Store under their policies.',
    ],
  },
];

/** Terms, privacy and consent (R30). Summaries only; the full documents are a legal gate before launch. */
export default function LegalScreen() {
  const consent = useAppStore((s) => s.analyticsConsent);
  const setConsent = useAppStore((s) => s.setAnalyticsConsent);

  return (
    <Screen edges={['left', 'right']} contentStyle={{ paddingBottom: space['2xl'] }}>
      <Chip label="Draft summary · final text pending legal review" tone="warning" icon="document-text-outline" />

      {SECTIONS.map((s) => (
        <View key={s.title} style={styles.block}>
          <Text variant="heading">{s.title}</Text>
          <Card>
            <View style={styles.points}>
              {s.points.map((p) => (
                <View key={p} style={styles.point}>
                  <Text tone="secondary">•</Text>
                  <Text style={{ flex: 1 }}>{p}</Text>
                </View>
              ))}
            </View>
          </Card>
        </View>
      ))}

      <View style={styles.block}>
        <Text variant="heading">Your choices</Text>
        <Card padded={false}>
          <ToggleRow
            title="Share anonymous usage data"
            subtitle="Helps us see which screens confuse people. Never includes questions, answers or payment details."
            value={consent}
            onValueChange={setConsent}
          />
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.md },
  points: { gap: space.sm },
  point: { flexDirection: 'row', gap: space.sm },
});
