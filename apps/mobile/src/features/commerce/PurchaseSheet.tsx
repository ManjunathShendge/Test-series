import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Entitlements } from '@exam-prep/contracts';
import { accountKeys } from '@/lib/api/account';
import { apiRequest } from '@/lib/api/http';
import { formatPaise } from '@/lib/format';
import { Button, Chip, Icon, Text, type ChipTone, type IconName } from '@/ui/primitives';
import { colors, radius, space } from '@/ui/tokens';
import { getBillingAdapter } from './billing';

export interface PurchaseSheetProps {
  visible: boolean;
  item: { kind: 'test' | 'series'; id: string; title: string; pricePaise: number; detail: string } | null;
  onClose: () => void;
  onUnlocked: () => void;
}

type Status = 'idle' | 'pending' | 'verifying' | 'confirmed' | 'deferred' | 'failed';

const statusMeta: Record<Exclude<Status, 'idle'>, { label: string; tone: ChipTone; icon: IconName }> = {
  pending: { label: 'Payment in progress', tone: 'warning', icon: 'hourglass-outline' },
  verifying: { label: 'Confirming your purchase', tone: 'warning', icon: 'shield-checkmark-outline' },
  confirmed: { label: 'Purchase confirmed', tone: 'success', icon: 'checkmark-circle-outline' },
  deferred: { label: 'Waiting for the store', tone: 'warning', icon: 'time-outline' },
  failed: { label: 'Payment not completed', tone: 'error', icon: 'alert-circle-outline' },
};

const STORE = Platform.OS === 'ios' ? 'the App Store' : 'Google Play';
/** How long to wait for the server to list the item after the store reports success. */
const VERIFY_TRIES = 10;

/**
 * In-app purchase sheet (PRD 6.3). Payment runs through the store billing adapter the client
 * registers (see ./billing). Pending, verifying and confirmed stay visibly distinct, and access
 * unlocks only when the server's entitlements list the item. Without an adapter the item is
 * shown as available soon: no purchase button and no link to pay outside the app.
 */
export function PurchaseSheet({ visible, item, onClose, onUnlocked }: PurchaseSheetProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const adapter = getBillingAdapter();
  const [status, setStatus] = useState<Status>('idle');
  const busy = status === 'pending' || status === 'verifying';

  useEffect(() => {
    if (!visible) setStatus('idle');
  }, [visible]);

  if (!item) return null;
  const meta = status === 'idle' ? null : statusMeta[status];

  async function owned(): Promise<boolean> {
    const e = await apiRequest('GET', '/me/entitlements', { schema: Entitlements });
    queryClient.setQueryData(accountKeys.entitlements, e);
    return item!.kind === 'test' ? e.testIds.includes(item!.id) : e.seriesIds.includes(item!.id);
  }

  async function buy() {
    if (!adapter || !item || busy) return;
    setStatus('pending');
    try {
      const outcome = await adapter.purchase({ kind: item.kind, id: item.id, title: item.title, pricePaise: item.pricePaise });
      if (outcome === 'cancelled') return setStatus('idle');
      if (outcome === 'pending') return setStatus('deferred');
      setStatus('verifying');
      for (let i = 0; i < VERIFY_TRIES; i++) {
        if (await owned()) {
          void queryClient.invalidateQueries({ queryKey: accountKeys.purchases });
          return setStatus('confirmed');
        }
        await new Promise<void>((r) => setTimeout(r, 1500));
      }
      // Paid but not yet listed: the server keeps verifying; access appears once it does.
      setStatus('deferred');
    } catch {
      setStatus('failed');
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={busy ? undefined : onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={styles.scrim} onPress={busy ? undefined : onClose} accessibilityLabel="Close purchase sheet" accessibilityRole="button" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text variant="title">Unlock {item.kind === 'series' ? 'series' : 'test'}</Text>
            <Pressable onPress={busy ? undefined : onClose} disabled={busy} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={styles.close}>
              <Icon name="close" size={22} color={busy ? colors.textDisabled : colors.text} />
            </Pressable>
          </View>

          <View style={styles.product}>
            <Text variant="heading">{item.title}</Text>
            <Text variant="bodySmall" tone="secondary">
              {item.detail}
            </Text>
          </View>

          <View style={styles.priceBox}>
            <Text variant="bodySmall" tone="secondary">
              Price
            </Text>
            <Text variant="display" tabular>
              {formatPaise(item.pricePaise)}
            </Text>
            <Text variant="caption" tone="secondary">
              Includes GST. {adapter ? `Billed by ${STORE}; the final price is shown by the store.` : ''}
            </Text>
          </View>

          {!adapter ? (
            <View style={styles.soon} accessibilityLiveRegion="polite">
              <Chip label="Available soon" tone="primary" icon="time-outline" />
              <Text variant="bodySmall" tone="secondary">
                Buying in the app is coming soon. Free tests are open to everyone in the meantime.
              </Text>
            </View>
          ) : meta ? (
            <View style={styles.status} accessibilityLiveRegion="polite">
              <Chip label={meta.label} tone={meta.tone} icon={meta.icon} />
              <Text variant="bodySmall" tone="secondary">
                {status === 'verifying'
                  ? 'Checking the receipt with our server. Access unlocks only after this completes.'
                  : status === 'deferred'
                    ? 'Your payment is still being processed. Access unlocks automatically once it is confirmed.'
                    : status === 'failed'
                      ? 'Nothing was charged. Check your payment method and try again.'
                      : status === 'confirmed'
                        ? 'You now have access. The receipt is in Profile > Purchases.'
                        : `Complete the payment in ${STORE}.`}
              </Text>
            </View>
          ) : (
            <Text variant="bodySmall" tone="secondary">
              Access unlocks after the purchase is confirmed. Refunds for in-app purchases are handled by {STORE}.
            </Text>
          )}

          <View style={styles.actions}>
            {!adapter || status === 'deferred' ? (
              <Button label="Close" variant="secondary" fullWidth size="lg" onPress={onClose} />
            ) : status === 'confirmed' ? (
              <Button label="Start now" icon="play" fullWidth size="lg" onPress={onUnlocked} />
            ) : (
              <Button label={status === 'failed' ? 'Try again' : `Buy for ${formatPaise(item.pricePaise)}`} fullWidth size="lg" loading={busy} onPress={() => void buy()} />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg + 4,
    borderTopRightRadius: radius.lg + 4,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    gap: space.lg,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: radius.full, backgroundColor: colors.border },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -space.md },
  product: { gap: space.xs },
  priceBox: { padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surfaceMuted, gap: space.xs },
  soon: { gap: space.sm },
  status: { gap: space.sm },
  actions: { marginTop: space.xs },
});
