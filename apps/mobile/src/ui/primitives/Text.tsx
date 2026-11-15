import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { colors, typography, type TypographyVariant } from '@/ui/tokens';

type TextTone = 'default' | 'secondary' | 'disabled' | 'onPrimary' | 'primary' | 'success' | 'warning' | 'error';

const toneColor: Record<TextTone, string> = {
  default: colors.text,
  secondary: colors.textSecondary,
  disabled: colors.textDisabled,
  onPrimary: colors.onPrimary,
  primary: colors.primary,
  success: colors.success,
  warning: colors.warning,
  error: colors.error,
};

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  tone?: TextTone;
  /** Tabular digits so timers and scores do not shift width as they change. */
  tabular?: boolean;
  align?: TextStyle['textAlign'];
}

/**
 * Typography primitive. Respects system font scaling (never disables it), which
 * MASTER requires; layouts must therefore tolerate growth rather than truncate.
 */
export function Text({ variant = 'body', tone = 'default', tabular, align, style, ...rest }: TextProps) {
  return (
    <RNText
      {...rest}
      style={[
        typography[variant],
        { color: toneColor[tone] },
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}
