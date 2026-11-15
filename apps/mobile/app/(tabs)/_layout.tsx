import { Redirect, Tabs } from 'expo-router';
import { useAppStore } from '@/lib/store/app';
import { Icon, type IconName } from '@/ui/primitives';
import { colors, typography } from '@/ui/tokens';

interface TabDef {
  name: string;
  title: string;
  icon: IconName;
  iconActive: IconName;
}

/** Four destinations, each with icon and label (MASTER: bottom navigation <=5). */
const TABS: TabDef[] = [
  { name: 'index', title: 'Home', icon: 'home-outline', iconActive: 'home' },
  { name: 'discover', title: 'Discover', icon: 'compass-outline', iconActive: 'compass' },
  { name: 'progress', title: 'Progress', icon: 'stats-chart-outline', iconActive: 'stats-chart' },
  { name: 'profile', title: 'Profile', icon: 'person-outline', iconActive: 'person' },
];

export default function TabsLayout() {
  const session = useAppStore((s) => s.session);
  if (!session.signedIn) return <Redirect href="/(auth)/sign-in" />;
  if (!session.onboarded) return <Redirect href="/(auth)/onboarding" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontSize: typography.caption.fontSize, fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingTop: 6,
        },
        tabBarItemStyle: { paddingVertical: 4 },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarAccessibilityLabel: `${tab.title} tab`,
            tabBarIcon: ({ color, focused }) => (
              <Icon name={focused ? tab.iconActive : tab.icon} size={24} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
