import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, space, tiles, type TileTone } from '@/ui/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface FeatureTileProps {
  title: string;
  description: string;
  icon: IconName;
  tone: TileTone;
  /** Visible call to action at the foot of the tile, e.g. "Open". */
  action: string;
  /** Optional large figure above the description (counts, scores). */
  value?: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Tinted dashboard tile (reference: pastel bento grid, recoloured to the brand palette).
 * Title, description and action read as one button; text colours come from the tone so
 * each passes 4.5:1 on its fill.
 */
export function FeatureTile({ title, description, icon, tone, action, value, onPress, style }: FeatureTileProps) {
  const t = tiles[tone];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}${value ? `, ${value}` : ''}. ${description}`}
      accessibilityHint={action}
      style={({ pressed }) => [styles.tile, { backgroundColor: t.bg }, pressed && styles.pressed, style]}
    >
      <View style={styles.top}>
        <Text variant="bodyStrong" style={{ color: t.fg, flex: 1 }} numberOfLines={2}>
          {title}
        </Text>
        <View style={[styles.icon, { backgroundColor: t.iconBg }]}>
          <Icon name={icon} size={18} color={t.fg} />
        </View>
      </View>
      {value ? (
        <Text variant="display" tabular style={{ color: t.fg }}>
          {value}
        </Text>
      ) : null}
      <Text variant="bodySmall" style={{ color: t.fgSecondary, flex: 1 }} numberOfLines={3}>
        {description}
      </Text>
      <View style={styles.foot}>
        <Text variant="bodySmallStrong" style={{ color: t.fg }}>
          {action}
        </Text>
        <Icon name="arrow-forward" size={18} color={t.fg} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: radius.lg, padding: space.lg, gap: space.sm, minHeight: 168 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xs },
});
