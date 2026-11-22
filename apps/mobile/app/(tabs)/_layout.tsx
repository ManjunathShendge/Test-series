import { Redirect, Tabs } from 'expo-router';
import { useAppStore } from '@/lib/store/app';
import { FloatingTabBar, type TabMeta } from '@/ui/patterns/FloatingTabBar';

/** Four destinations (MASTER: bottom navigation <=5), shown in the floating pill bar. */
const TABS: Record<string, TabMeta> = {
  index: { title: 'Home', icon: 'home-outline', iconActive: 'home' },
  discover: { title: 'Discover', icon: 'compass-outline', iconActive: 'compass' },
  progress: { title: 'Progress', icon: 'stats-chart-outline', iconActive: 'stats-chart' },
  profile: { title: 'Profile', icon: 'person-outline', iconActive: 'person' },
};

export default function TabsLayout() {
  const session = useAppStore((s) => s.session);
  const introSeen = useAppStore((s) => s.introSeen);
  if (!session.signedIn) return <Redirect href={introSeen ? '/(auth)/sign-in' : '/(auth)/welcome'} />;
  if (!session.onboarded) return <Redirect href="/(auth)/onboarding" />;
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <FloatingTabBar {...props} tabs={TABS} />}>
      {Object.entries(TABS).map(([name, tab]) => (
        <Tabs.Screen key={name} name={name} options={{ title: tab.title, tabBarAccessibilityLabel: `${tab.title} tab` }} />
      ))}
    </Tabs>
  );
}
