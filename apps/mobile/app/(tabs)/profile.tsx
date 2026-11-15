import { useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { getExam, type Language } from '@/lib/demo';
import { formatDate, formatPaise } from '@/lib/format';
import { useAppStore } from '@/lib/store/app';
import { Avatar, Button, Card, Chip, Icon, Screen, Text, type IconName } from '@/ui/primitives';
import { colors, radius, space, touch } from '@/ui/tokens';

const stageLabel = { starting: 'Just starting', revising: 'Revising', 'final-lap': 'Final lap' } as const;

/**
 * Profile (PRD 6.7): target exams, language, purchase history with invoices,
 * devices, and in-app account deletion behind an explicit confirmation.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const purchases = useAppStore((s) => s.purchases);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const signOut = useAppStore((s) => s.signOut);

  const confirmDelete = () =>
    Alert.alert(
      'Delete account?',
      'This starts a deletion request. Purchases, attempts and results are removed after a 7-day grace period, and you will receive a confirmation email. Active attempts are lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Request deletion', style: 'destructive', onPress: () => Alert.alert('Deletion requested', 'We have emailed a confirmation. You can cancel from that email within 7 days.') },
      ],
    );

  return (
    <Screen>
      <Text variant="display">Profile</Text>

      <Card>
        <View style={styles.identity}>
          <Avatar name={profile.name} size={56} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading">{profile.name}</Text>
            <Text variant="bodySmall" tone="secondary">
              {profile.email}
            </Text>
            <Chip label={stageLabel[profile.preparationStage]} icon="flag-outline" />
          </View>
        </View>
      </Card>

      <View style={styles.block}>
        <Text variant="heading">Target exams</Text>
        <View style={styles.chips}>
          {profile.targetExamIds.map((id) => {
            const exam = getExam(id);
            return exam ? <Chip key={id} label={exam.name} tone="primary" icon="school-outline" onPress={() => router.push({ pathname: '/exam/[id]', params: { id } })} /> : null;
          })}
          <Chip label="Edit" icon="create-outline" onPress={() => router.push('/profile/edit-exams')} />
        </View>
      </View>

      <View style={styles.block}>
        <Text variant="heading">Language</Text>
        <Card padded={false}>
          <View style={styles.segment} accessibilityRole="radiogroup">
            {(['en', 'hi'] as Language[]).map((lang) => {
              const selected = profile.language === lang;
              return (
                <Pressable
                  key={lang}
                  onPress={() => setLanguage(lang)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={lang === 'en' ? 'English' : 'Hindi'}
                  style={[styles.segmentItem, selected && styles.segmentSelected]}
                >
                  {selected ? <Icon name="checkmark" size={18} color={colors.primary} /> : null}
                  <Text variant="bodyStrong" tone={selected ? 'primary' : 'secondary'}>
                    {lang === 'en' ? 'English' : 'हिन्दी'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
        <Text variant="bodySmall" tone="secondary">
          Applies to questions, options and solutions where a Hindi version exists. The English section stays in English.
        </Text>
      </View>

      <View style={styles.block}>
        <Text variant="heading">Purchases and invoices</Text>
        <Card padded={false}>
          {purchases.map((p, i) => (
            <View key={p.id} style={[styles.row, i > 0 && styles.divider]}>
              <View style={[styles.rowIcon, { backgroundColor: colors.successSoft }]}>
                <Icon name={p.kind === 'series' ? 'albums-outline' : 'document-text-outline'} size={20} color={colors.success} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {p.title}
                </Text>
                <Text variant="bodySmall" tone="secondary">
                  {formatDate(p.purchasedAt)} · {p.channel} · {p.invoiceNumber}
                </Text>
                {p.gstPaise !== undefined || p.couponCode ? (
                  <Text variant="caption" tone="secondary">
                    {[p.gstPaise !== undefined ? `Includes ${formatPaise(p.gstPaise)} GST` : null, p.couponCode ? `${p.couponCode} saved ${formatPaise(p.discountPaise ?? 0)}` : null].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: space.xs }}>
                <Text variant="bodyStrong" tabular>
                  {formatPaise(p.amountPaise)}
                </Text>
                <Pressable onPress={() => Alert.alert('Invoice', `${p.invoiceNumber} has been emailed to ${profile.email}.`)} accessibilityRole="button" accessibilityLabel={`Download invoice ${p.invoiceNumber}`} hitSlop={8} style={styles.invoice}>
                  <Icon name="download-outline" size={16} color={colors.primary} />
                  <Text variant="caption" tone="primary">
                    Invoice
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </Card>
      </View>

      <View style={styles.block}>
        <Text variant="heading">Account</Text>
        <Card padded={false}>
          <Row icon="phone-portrait-outline" title="Devices" subtitle={`${profile.deviceCount} of 2 devices registered`} onPress={() => Alert.alert('Devices', 'This phone is your only registered device. You can register one more; a third is blocked until you remove one.')} />
          <Row icon="notifications-outline" title="Notifications" subtitle="Results, new tests from followed examiners" onPress={() => Alert.alert('Notifications', 'Notification preferences arrive with the notifications milestone.')} divider />
          <Row icon="help-circle-outline" title="Help and support" subtitle="Report a question, refunds, grievances" onPress={() => Alert.alert('Support', 'support@example.com · Replies within 72 hours.')} divider />
          <Row icon="document-outline" title="Terms and privacy" subtitle="Consent, data retention, refund policy" onPress={() => Alert.alert('Terms and privacy', 'Policy documents are published before launch.')} divider />
        </Card>
      </View>

      <View style={styles.danger}>
        <Button label="Sign out" variant="secondary" icon="log-out-outline" fullWidth onPress={signOut} />
        <Button label="Delete account" variant="danger" icon="trash-outline" fullWidth onPress={confirmDelete} />
        <Text variant="caption" tone="secondary" align="center">
          Deletion starts a request with a 7-day grace period, as required by the stores.
        </Text>
      </View>
    </Screen>
  );
}

function Row({ icon, title, subtitle, onPress, divider }: { icon: IconName; title: string; subtitle: string; onPress: () => void; divider?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${subtitle}`} android_ripple={{ color: colors.surfaceMuted }} style={[styles.row, divider && styles.divider]}>
      <View style={[styles.rowIcon, { backgroundColor: colors.surfaceMuted }]}>
        <Icon name={icon} size={20} color={colors.textSecondary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="bodySmall" tone="secondary">
          {subtitle}
        </Text>
      </View>
      <Icon name="chevron-forward" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  block: { gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  segment: { flexDirection: 'row', padding: space.xs, gap: space.xs },
  segmentItem: { flex: 1, minHeight: touch.minSize, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, borderRadius: radius.md },
  segmentSelected: { backgroundColor: colors.primarySoft },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  divider: { borderTopWidth: 1, borderTopColor: colors.surfaceMuted },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  invoice: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 32 },
  danger: { gap: space.md, marginTop: space.md },
});
