import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from 'react-native';
import { colors, radius, space, touch } from '@/ui/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconPosition?: 'leading' | 'trailing';
  loading?: boolean;
  fullWidth?: boolean;
}

const palette: Record<Variant, { bg: string; bgPressed: string; fg: string; border?: string }> = {
  primary: { bg: colors.primary, bgPressed: colors.primaryPressed, fg: colors.onPrimary },
  secondary: { bg: colors.surface, bgPressed: colors.surfaceMuted, fg: colors.primary, border: colors.border },
  ghost: { bg: 'transparent', bgPressed: colors.surfaceMuted, fg: colors.primary },
  danger: { bg: colors.surface, bgPressed: colors.errorSoft, fg: colors.error, border: colors.error },
};

/**
 * Pressable with ripple feedback, a 48dp minimum hit area, a busy state that
 * blocks double submission, and an accessible name that defaults to the label.
 */
export function Button({
  label,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'leading',
  loading = false,
  fullWidth = false,
  disabled,
  accessibilityLabel,
  ...rest
}: ButtonProps) {
  const theme = palette[variant];
  const inactive = disabled || loading;
  const height = size === 'lg' ? 56 : touch.minSize;

  return (
    <Pressable
      {...rest}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled, busy: loading }}
      android_ripple={{ color: theme.bgPressed, borderless: false }}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          backgroundColor: pressed ? theme.bgPressed : theme.bg,
          borderColor: theme.border ?? 'transparent',
          borderWidth: theme.border ? 1 : 0,
          opacity: inactive ? 0.5 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={theme.fg} />
      ) : (
        <View style={[styles.content, iconPosition === 'trailing' && styles.reverse]}>
          {icon ? <Icon name={icon} size={20} color={theme.fg} /> : null}
          <Text variant="bodyStrong" style={{ color: theme.fg }}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: touch.minSize,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  reverse: { flexDirection: 'row-reverse' },
});
