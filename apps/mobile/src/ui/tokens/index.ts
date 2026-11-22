/**
 * Design tokens. Source of truth: design-system/exam-prep-marketplace/MASTER.md.
 *
 * Components consume these semantic names; raw hex never appears in a screen.
 * Every status is paired with an icon or label somewhere in the UI, so colour is
 * never the only carrier of meaning.
 */

/**
 * The owner's seven-colour brand palette (19 November 2026), exact values, plus the
 * MakeMePrepare logo blue (22 November 2026, DECISIONS V7). Screens use the semantic
 * `colors` below; this scale is for illustrations, charts and tinted tiles.
 */
export const palette = {
  navy900: '#001D39',
  navy700: '#0A4174',
  steel500: '#49769F',
  teal500: '#4E8EA2',
  cyan400: '#6EA2B3',
  sky300: '#7BBDE8',
  ice100: '#BDD8E9',
  /** Logo blue, sampled from MMP-logo.png. 5.25:1 with white either way; 3.2:1 on navy (shapes only there). */
  brand500: '#0569D6',
  white: '#FFFFFF',
} as const;

export const colors = {
  /** Light canvas behind cards: a pale tint of ice100 so white cards still lift off it. */
  background: '#F2F7FB',
  surface: palette.white,
  surfaceMuted: '#E4EEF6',

  text: palette.navy900,
  /** 4.8:1 on white, 4.5:1 on the canvas. Not for text on ice100 tiles; use primary there. */
  textSecondary: palette.steel500,
  textDisabled: palette.cyan400,
  onPrimary: palette.white,

  primary: palette.navy700,
  primaryPressed: palette.navy900,
  primarySoft: palette.ice100,

  /**
   * Logo blue for highlights on light surfaces: links, emphasis words, progress and active
   * indicators, motion highlights. Text use on white/canvas only; never as text on navy.
   */
  brand: palette.brand500,
  onBrand: palette.white,

  /** Accent for emphasis on dark surfaces: progress, selected states, CTA on navy. */
  accent: palette.sky300,
  onAccent: palette.navy900,

  /** Dark brand surfaces: launch screens, hero cards, the floating tab bar. */
  inverse: palette.navy900,
  inverseRaised: palette.navy700,
  onInverse: palette.white,
  onInverseSecondary: palette.ice100,

  /*
   * Status hues sit outside the brand palette on purpose: answered/not answered/marked
   * mirror the official CBT exam interface students already know, and correct/wrong must
   * read instantly. They are used for state only, never decoration, always with an icon.
   */
  success: '#166534',
  successSoft: '#DCFCE7',
  warning: '#92400E',
  warningSoft: '#FEF3C7',
  error: '#B91C1C',
  errorSoft: '#FEE2E2',

  /** Mark-for-review in the attempt palette (CBT convention); deliberately distinct from status hues. */
  review: '#6D28D9',
  reviewSoft: '#EDE9FE',

  border: '#D3E3EF',
  borderStrong: palette.cyan400,
  focus: palette.navy700,
  overlay: 'rgba(0, 29, 57, 0.6)',
} as const;

/**
 * Tinted tiles for the dashboard grid (reference: pastel bento cards, recoloured to the
 * brand palette). Each pairs a fill with text that passes 4.5:1 on it.
 */
export const tiles = {
  ice: { bg: palette.ice100, fg: palette.navy900, fgSecondary: palette.navy700, iconBg: palette.white },
  sky: { bg: palette.sky300, fg: palette.navy900, fgSecondary: palette.navy900, iconBg: palette.ice100 },
  cyan: { bg: palette.cyan400, fg: palette.navy900, fgSecondary: palette.navy900, iconBg: palette.ice100 },
  navy: { bg: palette.navy700, fg: palette.white, fgSecondary: palette.ice100, iconBg: palette.steel500 },
  steel: { bg: palette.steel500, fg: palette.white, fgSecondary: palette.white, iconBg: palette.navy700 },
  deep: { bg: palette.navy900, fg: palette.white, fgSecondary: palette.ice100, iconBg: palette.navy700 },
} as const;

export type TileTone = keyof typeof tiles;

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
  sm: 8,
  md: 12,
  lg: 20,
  /** Hero and dashboard cards. */
  xl: 28,
  full: 999,
} as const;

/** 48dp is the Material minimum; MASTER requires at least 44. */
export const touch = {
  minSize: 48,
  minGap: space.sm,
} as const;

/**
 * Font families, loaded in the root layout. Outfit (geometric) carries headings and big
 * numbers; Inter carries body, labels and tabular figures (ui-ux-pro-max typography
 * search, 19 November 2026). Neither has Devanagari, so Hindi falls back to the system
 * Devanagari face per glyph on iOS and Android.
 */
export const fonts = {
  display: 'Outfit_600SemiBold',
  displayBold: 'Outfit_700Bold',
  displayMedium: 'Outfit_500Medium',
  body: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/**
 * Custom fonts select weight by family, so no fontWeight here (it breaks Android).
 * One step smaller than the first scale at the owner's request (19 November 2026);
 * captions stay at the 12px floor.
 */
export const typography = {
  /** Launch and onboarding headlines. */
  hero: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, letterSpacing: -0.4 },
  display: { fontFamily: fonts.display, fontSize: 26, lineHeight: 32, letterSpacing: -0.3 },
  title: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  heading: { fontFamily: fonts.display, fontSize: 17, lineHeight: 22 },
  /** Large dashboard figures (scores, percentages). */
  metric: { fontFamily: fonts.display, fontSize: 36, lineHeight: 42, letterSpacing: -0.8 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22 },
  bodySmall: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  bodySmallStrong: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  /** Captions only; never used for body copy (MASTER: body never below 12px). */
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
} as const;

export type TypographyVariant = keyof typeof typography;

/** Interaction feedback stays inside MASTER's 120-200ms band; slides use `page`. */
export const motion = {
  fast: 120,
  base: 160,
  slow: 200,
  page: 320,
} as const;

export const elevation = {
  card: {
    shadowColor: palette.navy900,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  raised: {
    shadowColor: palette.navy900,
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;

export const layout = {
  /** Horizontal page gutter on phones. */
  gutter: 20,
  /** Bounded reading width for long content on wide screens. */
  maxContentWidth: 640,
} as const;
