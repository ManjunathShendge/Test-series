import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Share, StyleSheet, View } from 'react-native';
import { refundEligibility, REFUND_WINDOW_DAYS, splitGst, GST_RATE_PERCENT, getSeries, getTest } from '@/lib/demo';
import { formatDate, formatPaise } from '@/lib/format';
import { useAppStore } from '@/lib/store/app';
import { useAttemptStore } from '@/lib/store/attempt';
import { Button, Card, Chip, Icon, Screen, StateView, Text, TextField } from '@/ui/primitives';
import { colors, space } from '@/ui/tokens';

const REASONS = ['Bought by mistake', 'Wrong exam or test', 'Content not as described', 'Other'] as const;
const PLAY_ORDER_HISTORY = 'https://play.google.com/store/account/orderhistory';
const APPLE_REPORT_PROBLEM = 'https://reportaproblem.apple.com';

/**
 * Purchase detail (PRD 6.3 steps 4 and 6, 6.7 invoices): itemised receipt or
 * tax invoice with GST, coupon saving and channel, plus the refund path that
 * matches where the purchase was made. Web purchases use the 7-day policy;
 * store purchases go to Apple or Google, whose verified refund revokes access.
 */
export default function PurchaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const purchase = useAppStore((s) => s.purchases.find((p) => p.id === id));
  const profile = useAppStore((s) => s.profile);
  const attempted = useAppStore((s) => s.attemptedTestIds);
  const liveTestId = useAttemptStore((s) => (s.status === 'in_progress' ? s.test?.id ?? null : null));
  const requestRefund = useAppStore((s) => s.requestRefund);

  const [refundOpen, setRefundOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!purchase) {
    return (
      <Screen edges={['left', 'right']}>
        <StateView kind="error" title="Purchase not found" message="It may belong to another account." actionLabel="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }

  const isWeb = purchase.channel === 'Web';
  const docTitle = isWeb ? 'Tax invoice' : 'Receipt';
  const gstPaise = purchase.gstPaise ?? splitGst(purchase.amountPaise).gstPaise;
  const basePaise = purchase.amountPaise - gstPaise;
  const listPaise = purchase.amountPaise + (purchase.discountPaise ?? 0);
  const started = liveTestId ? [...attempted, liveTestId] : attempted;
  const eligibility = refundEligibility(purchase, started, Date.now());
  const item = purchase.kind === 'test' ? getTest(purchase.itemId) : getSeries(purchase.itemId);

  const share = () =>
    void Share.share({
      title: `${docTitle} ${purchase.invoiceNumber}`,
      message: [
        `${docTitle} ${purchase.invoiceNumber}`,
        `${purchase.title}`,
        `Date: ${formatDate(purchase.purchasedAt)}`,
        `Paid via ${purchase.channel}: ${formatPaise(purchase.amountPaise)} (includes ${formatPaise(gstPaise)} GST)`,
        `Billed to ${profile.name}, ${profile.email}`,
      ].join('\n'),
    });

  const submitRefund = async () => {
    const rErr = reason ? null : 'Choose a reason so we can process this faster.';
    const nErr = reason === 'Other' && note.trim().length < 10 ? 'Tell us a little more, at least 10 characters.' : null;
    setReasonError(rErr);
    setNoteError(nErr);
    if (rErr || nErr || !reason) return;
    setBusy(true);
    await requestRefund(purchase.id, reason, note.trim() || undefined);
    setBusy(false);
    setRefundOpen(false);
  };

  return (
    <>
      <Stack.Screen options={{ title: docTitle }} />
      <Screen edges={['left', 'right']} contentStyle={styles.content}>
        <Card>
          <View style={styles.head}>
            <View style={[styles.icon, { backgroundColor: colors.successSoft }]}>
              <Icon name={purchase.kind === 'series' ? 'albums-outline' : 'document-text-outline'} size={22} color={colors.success} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="heading">{purchase.title}</Text>
              <Text variant="bodySmall" tone="secondary">
                {purchase.kind === 'series' ? 'Test series' : 'Single test'} · {formatDate(purchase.purchasedAt)}
              </Text>
            </View>
          </View>
          <View style={styles.chips}>
            <Chip label={purchase.channel === 'Web' ? 'Bought on website' : `Billed by ${purchase.channel}`} icon={purchase.channel === 'Web' ? 'globe-outline' : 'logo-google-playstore'} />
            {purchase.refund ? <Chip label="Refund requested" tone="warning" icon="hourglass-outline" /> : <Chip label="Paid" tone="success" icon="checkmark-circle-outline" />}
          </View>
        </Card>

        <View style={styles.block}>
          <Text variant="heading">{docTitle}</Text>
          <Card>
            <Line label={`${docTitle} number`} value={purchase.invoiceNumber} />
            <Line label="Billed to" value={`${profile.name}\n${profile.email}`} />
            <View style={styles.rule} />
            {purchase.discountPaise ? (
              <>
                <Line label="List price" value={formatPaise(listPaise)} />
                <Line label={`Code ${purchase.couponCode ?? ''}`} value={`−${formatPaise(purchase.discountPaise)}`} tone="success" />
              </>
            ) : null}
            <Line label="Taxable value" value={formatPaise(basePaise)} />
            <Line label={`GST ${GST_RATE_PERCENT}%`} value={formatPaise(gstPaise)} />
            <View style={styles.rule} />
            <Line label="Total paid" value={formatPaise(purchase.amountPaise)} strong />
            <Text variant="caption" tone="secondary" style={{ marginTop: space.sm }}>
              {isWeb
                ? 'GST details are provisional until the tax setup is confirmed. The PDF is generated on our server and emailed to you.'
                : `${purchase.channel} charged this amount. This receipt records the purchase on your account; the store's own receipt is in your ${purchase.channel} account.`}
            </Text>
          </Card>
          <Button label="Share or save" variant="secondary" icon="share-outline" fullWidth onPress={share} />
        </View>

        {item ? (
          <Card onPress={() => (purchase.kind === 'test' ? router.push({ pathname: '/test/[id]', params: { id: purchase.itemId } }) : router.push({ pathname: '/series/[id]', params: { id: purchase.itemId } }))} accessibilityLabel={`Open ${purchase.title}`}>
            <View style={styles.head}>
              <Icon name="play-circle-outline" size={22} color={colors.primary} />
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                Open {purchase.kind === 'series' ? 'series' : 'test'}
              </Text>
              <Icon name="chevron-forward" size={18} color={colors.textSecondary} />
            </View>
          </Card>
        ) : null}

        <View style={styles.block}>
          <Text variant="heading">Refund</Text>
          <Card>
            {eligibility.kind === 'store' ? (
              <View style={styles.refundBody}>
                <Text>
                  {eligibility.store} handles refunds for purchases made in the app. Request one from your {eligibility.store} order history. If {eligibility.store} approves it, access is removed automatically.
                </Text>
                <Button
                  label={`Open ${eligibility.store} orders`}
                  variant="secondary"
                  icon="open-outline"
                  fullWidth
                  onPress={() => void Linking.openURL(eligibility.store === 'Google Play' ? PLAY_ORDER_HISTORY : APPLE_REPORT_PROBLEM)}
                />
              </View>
            ) : eligibility.kind === 'requested' && purchase.refund ? (
              <View style={styles.refundBody} accessibilityLiveRegion="polite">
                <Chip label="Refund requested" tone="warning" icon="hourglass-outline" />
                <Text>
                  Requested on {formatDate(purchase.refund.requestedAt)} · {purchase.refund.reason}. Refunds go back to the original payment method, usually within 5 to 7 working days.
                </Text>
                <Text variant="bodySmall" tone="secondary">
                  You keep access until the refund is confirmed.
                </Text>
              </View>
            ) : eligibility.kind === 'ineligible' ? (
              <View style={styles.refundBody}>
                <Chip label="Not eligible" icon="close-circle-outline" />
                <Text>{eligibility.reason}</Text>
                <Text variant="bodySmall" tone="secondary">
                  Full refunds are available within {REFUND_WINDOW_DAYS} days when no test from the purchase has been started. For anything else, contact support.
                </Text>
                <Button label="Contact support" variant="ghost" icon="help-circle-outline" onPress={() => router.push('/profile/help')} />
              </View>
            ) : eligibility.kind === 'eligible' && !refundOpen ? (
              <View style={styles.refundBody}>
                <Chip label={`Eligible · ${eligibility.daysLeft} ${eligibility.daysLeft === 1 ? 'day' : 'days'} left`} tone="success" icon="checkmark-circle-outline" />
                <Text>No test from this purchase has been started, so you can get a full refund of {formatPaise(purchase.amountPaise)}.</Text>
                <Button label="Request a refund" variant="secondary" icon="return-down-back-outline" fullWidth onPress={() => setRefundOpen(true)} />
              </View>
            ) : (
              <View style={styles.refundBody}>
                <Text variant="bodySmallStrong" tone={reasonError ? 'error' : 'default'}>
                  Why are you asking for a refund?
                </Text>
                <View style={styles.chips} accessibilityRole="radiogroup">
                  {REASONS.map((r) => (
                    <Chip key={r} label={r} selected={reason === r} onPress={() => { setReason(r); setReasonError(null); }} />
                  ))}
                </View>
                {reasonError ? (
                  <View style={styles.errorRow} accessibilityLiveRegion="assertive">
                    <Icon name="alert-circle-outline" size={16} color={colors.error} />
                    <Text variant="bodySmall" tone="error">
                      {reasonError}
                    </Text>
                  </View>
                ) : null}
                <TextField
                  label={reason === 'Other' ? 'Tell us more' : 'Anything else? (optional)'}
                  value={note}
                  onChangeText={(v) => { setNote(v); if (noteError) setNoteError(null); }}
                  multiline
                  maxLength={300}
                  helper={`${note.length}/300`}
                  {...(noteError ? { error: noteError } : {})}
                />
                <Button label={`Request ${formatPaise(purchase.amountPaise)} refund`} icon="return-down-back-outline" fullWidth loading={busy} onPress={() => void submitRefund()} />
                <Button label="Cancel" variant="ghost" onPress={() => { setRefundOpen(false); setReasonError(null); setNoteError(null); }} />
              </View>
            )}
          </Card>
        </View>
      </Screen>
    </>
  );
}

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'success' }) {
  return (
    <View style={styles.line} accessible accessibilityLabel={`${label}: ${value.replace('\n', ', ')}`}>
      <Text variant={strong ? 'bodyStrong' : 'bodySmall'} tone={strong ? 'default' : 'secondary'}>
        {label}
      </Text>
      <Text variant={strong ? 'heading' : 'bodySmallStrong'} tone={tone ?? 'default'} tabular align="right" style={{ flexShrink: 1 }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space['2xl'] },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  block: { gap: space.md },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.lg, paddingVertical: space.xs },
  rule: { height: 1, backgroundColor: colors.surfaceMuted, marginVertical: space.sm },
  refundBody: { gap: space.md },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
