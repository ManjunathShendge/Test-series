import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Linking, Share, StyleSheet, View } from 'react-native';
import { useMyPurchases } from '@/lib/api/account';
import { formatDate, formatPaise } from '@/lib/format';
import { REFUND_WINDOW_DAYS } from '@/lib/policy';
import { Button, Card, Chip, Icon, Screen, StateView, Text } from '@/ui/primitives';
import { colors, space } from '@/ui/tokens';

const PLAY_ORDER_HISTORY = 'https://play.google.com/store/account/orderhistory';
const APPLE_REPORT_PROBLEM = 'https://reportaproblem.apple.com';

const CHANNEL: Record<string, string> = { razorpay: 'Website', google_play: 'Google Play', apple_iap: 'App Store', admin_grant: 'Granted by support' };

/**
 * Purchase detail (PRD 6.3, 6.7): the server's receipt for one purchase and the refund path
 * that matches where it was made. Store purchases are refunded by Apple or Google, whose
 * verified refund then revokes access; website purchases go through support under the
 * proposed 7-day policy. The tax invoice PDF is issued by the server.
 */
export default function PurchaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const purchases = useMyPurchases();
  const purchase = purchases.data?.find((p) => p.id === id);

  if (!purchase) {
    return (
      <Screen edges={['left', 'right']}>
        {purchases.isError || purchases.data ? (
          <StateView kind="error" title="Purchase not found" message="It may belong to another account." actionLabel="Go back" onAction={() => router.back()} />
        ) : (
          <StateView kind="empty" title="Loading receipt" message="Fetching your purchase from the server." />
        )}
      </Screen>
    );
  }

  const channel = CHANNEL[purchase.channel] ?? purchase.channel;
  const store = purchase.channel === 'google_play' || purchase.channel === 'apple_iap';
  const refunded = purchase.status === 'refunded';
  const listPaise = purchase.totalPaise + purchase.discountPaise;
  const reference = purchase.invoiceNumber ?? purchase.id.slice(0, 8).toUpperCase();

  const share = () =>
    void Share.share({
      title: `Receipt ${reference}`,
      message: [
        `Receipt ${reference}`,
        purchase.itemTitle,
        purchase.capturedAt ? `Paid ${formatDate(purchase.capturedAt)} via ${channel}` : `Via ${channel}`,
        purchase.discountPaise > 0 ? `Discount ${formatPaise(purchase.discountPaise)}${purchase.couponCode ? ` (${purchase.couponCode})` : ''}` : null,
        `Total ${formatPaise(purchase.totalPaise)} (GST included)`,
        refunded && purchase.refundedAt ? `Refunded ${formatDate(purchase.refundedAt)}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    });

  return (
    <>
      <Stack.Screen options={{ title: 'Receipt' }} />
      <Screen edges={['left', 'right']} contentStyle={styles.content}>
        <Card>
          <View style={styles.head}>
            <View style={[styles.icon, { backgroundColor: refunded ? colors.warningSoft : colors.successSoft }]}>
              <Icon name={refunded ? 'return-down-back-outline' : 'checkmark-circle-outline'} size={24} color={refunded ? colors.warning : colors.success} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="heading">{purchase.itemTitle}</Text>
              <Text variant="bodySmall" tone="secondary">
                {purchase.itemType === 'test_series' ? 'Test series' : 'Test'} · {channel}
              </Text>
            </View>
          </View>
          <View style={styles.chips}>
            <Chip label={refunded ? 'Refunded' : 'Paid'} tone={refunded ? 'review' : 'success'} />
            {purchase.validUntil ? <Chip label={`Access until ${formatDate(purchase.validUntil)}`} icon="time-outline" /> : null}
          </View>
        </Card>

        <View style={styles.block}>
          <Text variant="heading">Receipt</Text>
          <Card>
            <Line label="Reference" value={reference} />
            {purchase.capturedAt ? <Line label="Paid on" value={formatDate(purchase.capturedAt)} /> : null}
            {purchase.discountPaise > 0 ? <Line label="Price" value={formatPaise(listPaise)} /> : null}
            {purchase.discountPaise > 0 ? (
              <Line label={purchase.couponCode ? `Code ${purchase.couponCode}` : 'Discount'} value={`− ${formatPaise(purchase.discountPaise)}`} tone="success" />
            ) : null}
            <View style={styles.rule} />
            <Line label="Total (GST included)" value={formatPaise(purchase.totalPaise)} strong />
            {refunded && purchase.refundedAt ? <Line label="Refunded on" value={formatDate(purchase.refundedAt)} /> : null}
          </Card>
          <Button label="Share receipt" icon="share-outline" variant="secondary" onPress={share} />
        </View>

        {!refunded && purchase.channel !== 'admin_grant' ? (
          <View style={styles.block}>
            <Text variant="heading">Refunds</Text>
            <Card>
              {store ? (
                <View style={{ gap: space.md }}>
                  <Text tone="secondary">
                    Purchases made in the app are refunded by {channel} under its own rules. If a refund is approved, access ends once we receive the
                    confirmation.
                  </Text>
                  <Button
                    label={`Open ${channel}`}
                    icon="open-outline"
                    variant="secondary"
                    onPress={() => void Linking.openURL(purchase.channel === 'google_play' ? PLAY_ORDER_HISTORY : APPLE_REPORT_PROBLEM)}
                  />
                </View>
              ) : (
                <View style={{ gap: space.md }}>
                  <Text tone="secondary">
                    Website purchases can be refunded within {REFUND_WINDOW_DAYS} days if no test from them has been started. Contact support with the
                    reference above.
                  </Text>
                  <Button label="Contact support" icon="chatbubble-ellipses-outline" variant="secondary" onPress={() => router.push('/profile/help')} />
                </View>
              )}
            </Card>
          </View>
        ) : null}
      </Screen>
    </>
  );
}

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'success' }) {
  return (
    <View style={styles.line} accessible accessibilityLabel={`${label}: ${value}`}>
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
});
