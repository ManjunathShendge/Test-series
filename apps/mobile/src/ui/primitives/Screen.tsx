import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, layout, space } from '@/ui/tokens';

export interface ScreenProps {
  children: ReactNode;
  /** Scrollable content; pass false for screens that own their own list. */
  scroll?: boolean;
  /** Safe-area edges to inset. Tab screens omit 'bottom' because the tab bar handles it. */
  edges?: Edge[];
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * Page container: background token, safe-area insets (edge-to-edge is enabled
 * on Android), consistent gutters and a bounded reading width on wide screens.
 */
export function Screen({
  children,
  scroll = true,
  edges = ['top', 'left', 'right'],
  padded = true,
  style,
  contentStyle,
}: ScreenProps) {
  const content = [styles.content, padded && styles.padded, contentStyle];

  return (
    <SafeAreaView edges={edges} style={[styles.root, style]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={content}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, content]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    gap: space.lg,
  },
  padded: { paddingHorizontal: layout.gutter, paddingVertical: space.lg },
});
