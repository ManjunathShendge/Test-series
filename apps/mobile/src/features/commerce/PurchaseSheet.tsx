import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatPaise } from '@/lib/format';
import { useAppStore, type PurchaseStatus } from '@/lib/store/app';
import { Button, Chip, Icon, Text, type ChipTone, type IconName } from '@/ui/primitives';
import { colors, radius, space } from '@/ui/tokens';

export interface PurchaseSheetProps {
  visible: boolean;
  item: { kind: 'test' | 'series'; id: string; title: string; pricePaise: number; detail: string } | null;
  onClose: () => void;
  onUnlocked: () => void;
}

const statusMeta: Record<Exclude<PurchaseStatus, 'idle'>, { label: string; tone: ChipTone; icon: IconName }> = {
  pending: { label: 'Payment pending', tone: 'warning', icon: 'hourglass-outline' },
  verifying: { label: 'Verifying with Google Play', tone: 'warning', icon: 'shield-checkmark-outline' },
  confirmed: { label: 'Purchase confirmed', tone: 'success', icon: 'checkmark-circle-outline' },
  failed: { label: 'Payment failed', tone: 'error', icon: 'alert-circle-outline' },
};

/**
 * Store-billing purchase sheet. The three states are kept visibly distinct:
 * pending, verifying and confirmed (MASTER: never show "purchased" for an
 * unverified transaction). Price is the store's localised price; the server
 * decides entitlement, so unlocking happens only after "confirmed".
 */
export function PurchaseSheet({ visible, item, onClose, onUnlocked }: PurchaseSheetProps) {
  const insets = useSafeAreaInsets();
  const status = useAppStore((s) => s.purchaseStatus);
  const purchase = useAppStore((s) => s.purchase);
  const reset = useAppStore((s) => s.resetPurchaseStatus);
  const busy = status === 'pending' || status === 'verifying';

  useEffect(() => {
    if (!visible) reset();
  }, [visible, reset]);

  if (!item) return null;
  const meta = status === 'idle' ? null : statusMeta[status];

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

          <View style={styles.priceRow}>
            <View>
              <Text variant="bodySmall" tone="secondary">
                Google Play price
              </Text>
              <Text variant="display">{formatPaise(item.pricePaise)}</Text>
            </View>
            <View style={styles.channel}>
              <Icon name="logo-google-playstore" size={18} color={colors.textSecondary} />
              <Text variant="bodySmall" tone="secondary">
                Billed by Google Play
              </Text>
            </View>
          </View>

          {meta ? (
            <View style={styles.status} accessibilityLiveRegion="polite">
              <Chip label={meta.label} tone={meta.tone} icon={meta.icon} />
              {status === 'verifying' ? (
                <Text variant="bodySmall" tone="secondary">
                  Confirming the receipt with our server. Access unlocks only after this completes.
                </Text>
              ) : null}
              {status === 'failed' ? (
                <Text variant="bodySmall" tone="secondary">
                  Nothing was charged. Check your payment method and try again.
                </Text>
              ) : null}
            </View>
          ) : (
            <Text variant="bodySmall" tone="secondary">
              Instant access after confirmation. Invoice is saved to your profile. Full refund within 7 days if the test has not been started.
            </Text>
          )}

          <View style={styles.actions}>
            {status === 'confirmed' ? (
              <Button label="Start now" icon="play" fullWidth size="lg" onPress={onUnlocked} />
            ) : (
              <Button
                label={status === 'failed' ? 'Try again' : `Pay ${formatPaise(item.pricePaise)}`}
                fullWidth
                size="lg"
                loading={busy}
                onPress={() => void purchase({ kind: item.kind, id: item.id })}
              />
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
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  channel: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  status: { gap: space.sm },
  actions: { marginTop: space.xs },
});
