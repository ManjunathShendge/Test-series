import { useRouter } from 'expo-router';
import { Image, Linking, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { PublicBanner } from '@exam-prep/contracts';
import { useBanners } from '@/lib/api/queries';
import { bannerTarget, type BannerTarget } from '@/lib/banners';
import { colors, layout, radius, space } from '@/ui/tokens';

/**
 * Admin banners (CMS) as a horizontal rail on Home. Shows nothing while loading, on error or
 * when there are none: banners are announcements, never something a student waits for.
 */
export function BannerRail() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const banners = useBanners().data ?? [];
  if (!banners.length) return null;

  // One banner fills the row; several peek so the rail reads as scrollable.
  const full = width - layout.gutter * 2;
  const cardWidth = banners.length === 1 ? full : Math.min(full * 0.86, 520);

  function open(target: BannerTarget) {
    switch (target.kind) {
      case 'exam':
        return router.push({ pathname: '/exam/[id]', params: { id: target.id } });
      case 'test':
        return router.push({ pathname: '/test/[id]', params: { id: target.id } });
      case 'series':
        return router.push({ pathname: '/series/[id]', params: { id: target.id } });
      case 'examiner':
        return router.push({ pathname: '/examiner/[id]', params: { id: target.id } });
      case 'discover':
        return router.push('/discover');
      case 'web':
        // Checked again right before leaving the app: https only.
        if (target.url.startsWith('https://')) void Linking.openURL(target.url).catch(() => undefined);
    }
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={cardWidth + space.md}
      snapToAlignment="start"
      contentContainerStyle={styles.rail}
      accessibilityLabel="Announcements"
    >
      {banners.map((banner) => (
        <BannerCard key={banner.id} banner={banner} width={cardWidth} onOpen={open} />
      ))}
    </ScrollView>
  );
}

function BannerCard({ banner, width, onOpen }: { banner: PublicBanner; width: number; onOpen: (t: BannerTarget) => void }) {
  const target = bannerTarget(banner.link);
  const image = (
    <Image
      source={{ uri: banner.imageUrl }}
      style={styles.image}
      resizeMode="cover"
      accessible={!target}
      accessibilityRole={target ? undefined : 'image'}
      accessibilityLabel={banner.title}
    />
  );
  if (!target) return <View style={[styles.card, { width }]}>{image}</View>;
  return (
    <Pressable
      onPress={() => onOpen(target)}
      accessibilityRole={target.kind === 'web' ? 'link' : 'button'}
      accessibilityLabel={banner.title}
      accessibilityHint={target.kind === 'web' ? 'Opens in your browser' : undefined}
      style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}
    >
      {image}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rail: { flexDirection: 'row', gap: space.md, paddingHorizontal: layout.gutter },
  // Fixed 3:1 box: the rail never jumps while images load.
  card: { aspectRatio: 3, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  image: { width: '100%', height: '100%' },
  pressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
});
