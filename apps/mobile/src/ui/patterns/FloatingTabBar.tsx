import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text, type IconName } from '@/ui/primitives';
import { colors, elevation, layout, radius, space, touch } from '@/ui/tokens';

export interface TabMeta {
  title: string;
  icon: IconName;
  iconActive: IconName;
}

/**
 * Floating navy pill tab bar (owner design reference 2). The active tab expands into a sky
 * pill with its label; inactive tabs show the icon and keep their name for screen readers.
 * It sits in the layout below the screen, not over it, so content is never hidden behind it.
 */
export function FloatingTabBar({ state, descriptors, emitter, navigateToTab, insets, tabs }: BottomTabBarProps & { tabs: Record<string, TabMeta> }) {
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
      <View style={styles.bar} accessibilityRole="tablist">
        {state.routes.map((route, index) => {
          const meta = tabs[route.name];
          if (!meta) return null;
          const focused = index === state.index;
          const options = descriptors[route.key]?.options;
          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={options?.tabBarAccessibilityLabel ?? meta.title}
              style={({ pressed }) => [styles.item, focused && styles.itemActive, pressed && !focused && styles.pressed]}
            >
              <Icon name={focused ? meta.iconActive : meta.icon} size={22} color={focused ? colors.onAccent : colors.onInverseSecondary} />
              {focused ? (
                <Text variant="bodySmallStrong" style={{ color: colors.onAccent }} numberOfLines={1}>
                  {meta.title}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.background, paddingHorizontal: layout.gutter, paddingTop: space.sm },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.inverse,
    borderRadius: radius.full,
    padding: 6,
    ...elevation.raised,
  },
  item: {
    height: touch.minSize + 4,
    minWidth: touch.minSize + 4,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space.xs + 2,
    paddingHorizontal: space.md,
  },
  itemActive: { backgroundColor: colors.accent, paddingHorizontal: space.lg },
  pressed: { backgroundColor: 'rgba(255,255,255,0.08)' },
});
