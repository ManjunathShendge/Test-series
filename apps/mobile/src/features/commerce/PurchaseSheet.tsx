import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { applyPercentOff, GST_RATE_PERCENT, resolveCoupon, splitGst, type CouponResolution } from '@/lib/demo';
import { formatPaise } from '@/lib/format';
import { useAppStore, type PurchaseStatus } from '@/lib/store/app';
import { Button, Chip, Icon, Text, TextField, type ChipTone, type IconName } from '@/ui/primitives';
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
 * Store-billing purchase sheet (PRD 6.3). The three states are kept visibly
 * distinct: pending, verifying and confirmed (MASTER: never show "purchased"
 * for an unverified transaction). Coupons and examiner codes are previewed on
 * the client and re-validated by the server; the price shows GST included.
 * The server decides entitlement, so unlocking happens only after "confirmed".
 */
export function PurchaseSheet({ visible, item, onClose, onUnlocked }: PurchaseSheetProps) {
  const insets = useSafeAreaInsets();
  const status = useAppStore((s) => s.purchaseStatus);
  const purchase = useAppStore((s) => s.purchase);
  const reset = useAppStore((s) => s.resetPurchaseStatus);
  const busy = status === 'pending' || status === 'verifying';

  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [coupon, setCoupon] = useState<CouponResolution | null>(null);

  useEffect(() => {
    if (!visible) {
      reset();
      setCodeOpen(false);
      setCode('');
      setCodeError(null);
      setCoupon(null);
    }
  }, [visible, reset]);

  if (!item) return null;
  const meta = status === 'idle' ? null : statusMeta[status];
  const payable = coupon ? applyPercentOff(item.pricePaise, coupon.percentOff) : item.pricePaise;
  const { gstPaise } = splitGst(payable);

  const applyCode = () => {
    const outcome = resolveCoupon(code, { kind: item.kind, id: item.id });
    if (!outcome.ok) {
      setCoupon(null);
      setCodeError(outcome.reason);
      return;
    }
    setCodeError(null);
    setCoupon(outcome.coupon);
    setCodeOpen(false);
  };

  const removeCode = () => {
    setCoupon(null);
    setCode('');
    setCodeError(null);
  };

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
            <View style={styles.priceRow}>
              <View>
                <Text variant="bodySmall" tone="secondary">
                  {coupon ? 'You pay' : 'Google Play price'}
                </Text>
                <View style={styles.priceLine}>
                  <Text variant="display" tabular>
                    {formatPaise(payable)}
                  </Text>
                  {coupon ? (
                    <Text variant="bodySmall" tone="secondary" style={styles.struck} accessibilityLabel={`Was ${formatPaise(item.pricePaise)}`}>
                      {formatPaise(item.pricePaise)}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.channel}>
                <Icon name="logo-google-playstore" size={18} color={colors.textSecondary} />
                <Text variant="bodySmall" tone="secondary">
                  Billed by Google Play
                </Text>
              </View>
            </View>
            <Text variant="caption" tone="secondary">
              Includes {formatPaise(gstPaise)} GST ({GST_RATE_PERCENT}%). Invoice shows the full breakdown.
            </Text>
          </View>

          {status === 'idle' || status === 'failed' ? (
            <View style={styles.couponBlock}>
              {coupon ? (
                <View style={styles.appliedRow}>
                  <Chip label={`${coupon.code} applied`} tone="success" icon="pricetag-outline" />
                  <Text variant="bodySmall" tone="secondary" style={{ flex: 1 }}>
                    {coupon.label}
                  </Text>
                  <Pressable onPress={removeCode} accessibilityRole="button" accessibilityLabel={`Remove code ${coupon.code}`} hitSlop={8} style={styles.remove}>
                    <Text variant="bodySmall" tone="primary">
                      Remove
                    </Text>
                  </Pressable>
                </View>
              ) : codeOpen ? (
                <View style={styles.couponForm}>
                  <View style={{ flex: 1 }}>
                    <TextField
                      label="Coupon or examiner code"
                      placeholder="e.g. WELCOME20"
                      value={code}
                      onChangeText={(v) => {
                        setCode(v.toUpperCase());
                        if (codeError) setCodeError(null);
                      }}
                      onClear={() => setCode('')}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={applyCode}
                      {...(codeError ? { error: codeError } : {})}
                    />
                  </View>
                  <Button label="Apply" variant="secondary" onPress={applyCode} />
                </View>
              ) : (
                <Pressable onPress={() => setCodeOpen(true)} accessibilityRole="button" accessibilityLabel="Add a coupon or examiner code" style={styles.couponToggle}>
                  <Icon name="pricetag-outline" size={18} color={colors.primary} />
                  <Text variant="bodyStrong" tone="primary">
                    Have a coupon or examiner code?
                  </Text>
                </Pressable>
              )}
            </View>
          ) : null}

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
              Instant access after confirmation. The receipt is saved to your profile. Refunds for in-app purchases are handled by Google Play.
            </Text>
          )}

          <View style={styles.actions}>
            {status === 'confirmed' ? (
              <Button label="Start now" icon="play" fullWidth size="lg" onPress={onUnlocked} />
            ) : (
              <Button
                label={status === 'failed' ? 'Try again' : `Pay ${formatPaise(payable)}`}
                fullWidth
                size="lg"
                loading={busy}
                onPress={() => void purchase({ kind: item.kind, id: item.id, ...(coupon ? { couponCode: coupon.code } : {}) })}
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
  priceBox: { padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surfaceMuted, gap: space.sm },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  priceLine: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  struck: { textDecorationLine: 'line-through' },
  channel: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  couponBlock: { gap: space.sm },
  couponToggle: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  couponForm: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  appliedRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  remove: { minHeight: 44, justifyContent: 'center' },
  status: { gap: space.sm },
  actions: { marginTop: space.xs },
});
