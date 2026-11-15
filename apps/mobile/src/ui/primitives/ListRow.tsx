import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { colors, space, touch } from '@/ui/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconTone?: 'neutral' | 'primary' | 'success' | 'warning' | 'error';
  /** Right-hand content; defaults to a chevron when the row is pressable. */
  trailing?: ReactNode;
  onPress?: () => void;
  divider?: boolean;
  accessibilityLabel?: string;
}

const iconTones = {
  neutral: { bg: colors.surfaceMuted, fg: colors.textSecondary },
  primary: { bg: colors.primarySoft, fg: colors.primary },
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  error: { bg: colors.errorSoft, fg: colors.error },
} as const;

/** Settings-style row: optional icon, title, subtitle, trailing control. 48dp minimum, ripple when pressable. */
export function ListRow({ title, subtitle, icon, iconTone = 'neutral', trailing, onPress, divider, accessibilityLabel }: ListRowProps) {
  const tone = iconTones[iconTone];
  const body = (
    <>
      {icon ? (
        <View style={[styles.icon, { backgroundColor: tone.bg }]}>
          <Icon name={icon} size={20} color={tone.fg} />
        </View>
      ) : null}
      <View style={styles.text}>
        <Text variant="bodyStrong">{title}</Text>
        {subtitle ? (
          <Text variant="bodySmall" tone="secondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? (onPress ? <Icon name="chevron-forward" size={18} color={colors.textSecondary} /> : null)}
    </>
  );

  if (!onPress) {
    return (
      <View style={[styles.row, divider && styles.divider]} accessible accessibilityLabel={accessibilityLabel ?? [title, subtitle].filter(Boolean).join('. ')}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, subtitle].filter(Boolean).join('. ')}
      android_ripple={{ color: colors.surfaceMuted }}
      style={[styles.row, divider && styles.divider]}
    >
      {body}
    </Pressable>
  );
}

export interface ToggleRowProps {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange?: (value: boolean) => void;
  /** Locked rows are transactional notices that cannot be switched off. */
  locked?: boolean;
  divider?: boolean;
}

/** Labelled switch. The whole row is the touch target; state is announced, not shown by colour alone. */
export function ToggleRow({ title, subtitle, value, onValueChange, locked, divider }: ToggleRowProps) {
  const toggle = () => {
    if (!locked) onValueChange?.(!value);
  };
  return (
    <Pressable
      onPress={toggle}
      disabled={locked}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!locked }}
      accessibilityLabel={[title, subtitle, locked ? 'Always on' : null].filter(Boolean).join('. ')}
      android_ripple={locked ? undefined : { color: colors.surfaceMuted }}
      style={[styles.row, divider && styles.divider]}
    >
      <View style={styles.text}>
        <Text variant="bodyStrong">{title}</Text>
        {subtitle ? (
          <Text variant="bodySmall" tone="secondary">
            {subtitle}
          </Text>
        ) : null}
        {locked ? (
          <Text variant="caption" tone="secondary">
            Always on
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={toggle}
        disabled={locked}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={colors.surface}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, minHeight: touch.minSize },
  divider: { borderTopWidth: 1, borderTopColor: colors.surfaceMuted },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
});
