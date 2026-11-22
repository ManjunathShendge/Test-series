import Image from 'next/image';
import Link from 'next/link';

interface LogoProps {
  /** inverse: reversed artwork for navy surfaces (DECISIONS V8). */
  tone?: 'default' | 'inverse';
  /** horizontal: mark beside the wordmark, for headers where the stacked logo is too small. */
  variant?: 'full' | 'mark' | 'horizontal';
  height?: number;
  href?: string | null;
  priority?: boolean;
  /** Hide the wordmark on very narrow screens (header use). */
  compact?: boolean;
}

// Intrinsic sizes of the derived assets in public/brand.
const RATIO = { logo: 502 / 240, mark: 885 / 480, wordmark: 1881 / 240 } as const;

/** The owner's MakeMePrepare logo, never redrawn. Links home by default. */
export function Logo({ tone = 'default', variant = 'horizontal', height = 36, href = '/', priority = false, compact = false }: LogoProps) {
  const suffix = tone === 'inverse' ? '-inverse' : '';
  const asset = (name: keyof typeof RATIO, h: number, alt: string) => (
    <Image src={`/brand/${name}${suffix}.png`} alt={alt} width={Math.round(h * RATIO[name])} height={h} priority={priority} />
  );

  const art =
    variant === 'horizontal' ? (
      <span className={compact ? 'logo-compact' : undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(height * 0.28) }}>
        {asset('mark', height, compact ? 'MakeMePrepare' : '')}
        <span className="logo-wordmark" aria-hidden={compact || undefined}>
          {asset('wordmark', Math.round(height * 0.5), compact ? '' : 'MakeMePrepare')}
        </span>
      </span>
    ) : (
      asset(variant === 'full' ? 'logo' : 'mark', height, 'MakeMePrepare')
    );

  if (!href) return art;
  return (
    <Link href={href} aria-label="MakeMePrepare home" style={{ display: 'inline-flex' }}>
      {art}
    </Link>
  );
}
