/**
 * Design tokens. Source of truth: design-system/exam-prep-marketplace/MASTER.md.
 *
 * Components consume these semantic names; raw hex never appears in a screen.
 * Every status is paired with an icon or label somewhere in the UI, so colour is
 * never the only carrier of meaning.
 */

export const colors = {
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F5F9',

  text: '#0F172A',
  textSecondary: '#475569',
  textDisabled: '#94A3B8',
  onPrimary: '#FFFFFF',

  primary: '#1D4ED8',
  primaryPressed: '#1E40AF',
  primarySoft: '#DBEAFE',

  success: '#166534',
  successSoft: '#DCFCE7',
  warning: '#92400E',
  warningSoft: '#FEF3C7',
  error: '#B91C1C',
  errorSoft: '#FEE2E2',

  /** Mark-for-review in the attempt palette; deliberately distinct from status hues. */
  review: '#6D28D9',
  reviewSoft: '#EDE9FE',

  border: '#CBD5E1',
  borderStrong: '#94A3B8',
  focus: '#1D4ED8',
  overlay: 'rgba(15, 23, 42, 0.55)',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  full: 999,
} as const;

/** 48dp is the Material minimum; MASTER requires at least 44. */
export const touch = {
  minSize: 48,
  minGap: space.sm,
} as const;

export const typography = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  bodySmall: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  bodySmallStrong: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  /** Captions only; never used for body copy (MASTER: body never below 12px). */
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
} as const;

export type TypographyVariant = keyof typeof typography;

/** Interaction feedback stays inside MASTER's 120-200ms band. */
export const motion = {
  fast: 120,
  base: 160,
  slow: 200,
} as const;

export const elevation = {
  card: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  raised: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
} as const;

export const layout = {
  /** Horizontal page gutter on phones. */
  gutter: space.lg,
  /** Bounded reading width for long content on wide screens. */
  maxContentWidth: 640,
} as const;
