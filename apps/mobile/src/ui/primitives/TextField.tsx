import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { colors, radius, space, touch, typography } from '@/ui/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  /** Hide the label visually (still read by screen readers) for compact search bars. */
  labelHidden?: boolean;
  helper?: string;
  error?: string;
  leadingIcon?: IconName;
  onClear?: () => void;
}

/**
 * Labelled input: visible label (never placeholder-only), 48dp height, focus
 * ring, inline error beneath the field announced to assistive tech, and an
 * optional clear control with its own accessible name.
 */
export function TextField({ label, labelHidden, helper, error, leadingIcon, onClear, value, accessibilityLabel, ...rest }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const showClear = !!onClear && !!value;

  return (
    <View style={styles.root}>
      {labelHidden ? null : (
        <Text variant="bodySmallStrong" tone={error ? 'error' : 'default'}>
          {label}
        </Text>
      )}
      <View
        style={[
          styles.field,
          focused && styles.focused,
          !!error && styles.errored,
        ]}
      >
        {leadingIcon ? <Icon name={leadingIcon} size={20} color={colors.textSecondary} /> : null}
        <TextInput
          {...rest}
          value={value}
          accessibilityLabel={accessibilityLabel ?? label}
          placeholderTextColor={colors.textDisabled}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={styles.input}
        />
        {showClear ? (
          <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel={`Clear ${label}`} hitSlop={8} style={styles.clear}>
            <Icon name="close-circle" size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <View style={styles.message} accessibilityLiveRegion="polite">
          <Icon name="alert-circle-outline" size={16} color={colors.error} />
          <Text variant="bodySmall" tone="error">
            {error}
          </Text>
        </View>
      ) : helper ? (
        <Text variant="bodySmall" tone="secondary">
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.sm },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: touch.minSize,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  focused: { borderColor: colors.focus, borderWidth: 2, paddingHorizontal: space.md - 1 },
  errored: { borderColor: colors.error },
  input: { flex: 1, ...typography.body, color: colors.text, paddingVertical: 0 },
  clear: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  message: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
