import styles from './hero.module.css';

/*
 * Web port of the mobile launch illustration (apps/mobile/src/features/welcome,
 * PracticeIllustration): stacked platforms with a floating answer sheet, admit pass and
 * clock, pseudo-3D in the brand palette (DECISIONS V5). Stands in for the reference's
 * portrait photo; decorative. The floating layer drifts in CSS, still under reduced motion.
 */

const P = {
  navy900: '#001D39',
  navy700: '#0A4174',
  steel500: '#49769F',
  teal500: '#4E8EA2',
  cyan400: '#6EA2B3',
  sky300: '#7BBDE8',
  ice100: '#BDD8E9',
  brand500: '#0569D6',
  white: '#FFFFFF',
} as const;

const W = 280;
const H = 260;

function SideGradient({ id, shade }: { id: string; shade: [string, string, string] }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor={shade[0]} />
      <stop offset="0.45" stopColor={shade[1]} />
      <stop offset="1" stopColor={shade[2]} />
    </linearGradient>
  );
}

function Cylinder({ cx, y, rx, ry, h, side, top, rim }: { cx: number; y: number; rx: number; ry: number; h: number; side: string; top: string; rim?: string }) {
  const d = `M ${cx - rx} ${y} L ${cx - rx} ${y + h} A ${rx} ${ry} 0 0 0 ${cx + rx} ${y + h} L ${cx + rx} ${y} Z`;
  return (
    <g>
      <path d={d} fill={`url(#${side})`} />
      <ellipse cx={cx} cy={y} rx={rx} ry={ry} fill={top} />
      {rim ? <ellipse cx={cx} cy={y} rx={rx - 1} ry={ry - 1} fill="none" stroke={rim} strokeWidth={1.5} opacity={0.6} /> : null}
    </g>
  );
}

function Block({ cx, y, a, h, faces }: { cx: number; y: number; a: number; h: number; faces: [string, string, string] }) {
  const b = a / 2;
  return (
    <g>
      <path d={`M ${cx - a} ${y} L ${cx} ${y + b} L ${cx} ${y + b + h} L ${cx - a} ${y + h} Z`} fill={faces[1]} />
      <path d={`M ${cx} ${y + b} L ${cx + a} ${y} L ${cx + a} ${y + h} L ${cx} ${y + b + h} Z`} fill={faces[2]} />
      <path d={`M ${cx} ${y - b} L ${cx + a} ${y} L ${cx} ${y + b} L ${cx - a} ${y} Z`} fill={faces[0]} />
    </g>
  );
}

function Paper({ x, y, w, h, rotate }: { x: number; y: number; w: number; h: number; rotate: number }) {
  return (
    <g transform={`rotate(${rotate} ${x + w / 2} ${y + h / 2})`}>
      <rect x={x + 4} y={y + 6} width={w} height={h} rx={10} fill={P.navy900} opacity={0.18} />
      <rect x={x} y={y} width={w} height={h} rx={10} fill={P.white} />
      <rect x={x + 12} y={y + 14} width={w * 0.55} height={7} rx={3.5} fill={P.navy700} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <circle cx={x + 18} cy={y + 40 + i * 22} r={6} fill={i === 1 ? P.sky300 : 'none'} stroke={i === 1 ? P.navy700 : P.ice100} strokeWidth={2} />
          <rect x={x + 30} y={y + 37 + i * 22} width={w * (i === 1 ? 0.5 : 0.42)} height={6} rx={3} fill={P.ice100} />
        </g>
      ))}
    </g>
  );
}

function Pass({ x, y, w, rotate }: { x: number; y: number; w: number; rotate: number }) {
  const h = w * 0.63;
  return (
    <g transform={`rotate(${rotate} ${x + w / 2} ${y + h / 2})`}>
      <rect x={x + 5} y={y + 8} width={w} height={h} rx={12} fill={P.navy900} opacity={0.22} />
      <rect x={x} y={y} width={w} height={h} rx={12} fill="url(#hiPass)" />
      <rect x={x + 14} y={y + 16} width={22} height={16} rx={4} fill={P.ice100} opacity={0.9} />
      <rect x={x + 14} y={y + h - 26} width={w * 0.45} height={6} rx={3} fill={P.white} opacity={0.9} />
      <rect x={x + 14} y={y + h - 15} width={w * 0.3} height={5} rx={2.5} fill={P.white} opacity={0.6} />
      <circle cx={x + w - 22} cy={y + 24} r={11} fill={P.white} />
      <path d={`M ${x + w - 27} ${y + 24} l 4 4 l 7 -8`} stroke={P.navy700} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

function Clock({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      <circle cx={cx + 3} cy={cy + 5} r={r} fill={P.navy900} opacity={0.18} />
      <circle cx={cx} cy={cy} r={r} fill={P.white} />
      <circle cx={cx} cy={cy} r={r - 4} fill="none" stroke={P.ice100} strokeWidth={2} />
      <path d={`M ${cx} ${cy} L ${cx} ${cy - r * 0.55} M ${cx} ${cy} L ${cx + r * 0.4} ${cy + r * 0.15}`} stroke={P.navy700} strokeWidth={3} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={2.5} fill={P.brand500} />
    </g>
  );
}

export function HeroIllustration() {
  return (
    <div className={styles.illustration} aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.illustrationLayer}>
        <defs>
          <SideGradient id="hiS1" shade={[P.cyan400, P.ice100, P.cyan400]} />
          <SideGradient id="hiS2" shade={[P.steel500, P.cyan400, P.steel500]} />
          <SideGradient id="hiS3" shade={[P.navy900, P.steel500, P.navy700]} />
          <radialGradient id="hiGround" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor={P.navy700} stopOpacity="0.35" />
            <stop offset="1" stopColor={P.navy700} stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx={140} cy={240} rx={120} ry={20} fill="url(#hiGround)" />
        <Block cx={50} y={128} a={22} h={46} faces={[P.white, P.sky300, P.cyan400]} />
        <Block cx={232} y={136} a={18} h={34} faces={[P.white, P.ice100, P.sky300]} />
        <Cylinder cx={140} y={206} rx={90} ry={28} h={18} side="hiS1" top={P.ice100} />
        <Cylinder cx={140} y={184} rx={82} ry={26} h={14} side="hiS2" top={P.cyan400} />
        <Cylinder cx={140} y={156} rx={90} ry={28} h={20} side="hiS3" top={P.steel500} rim={P.sky300} />
      </svg>
      <svg viewBox={`0 0 ${W} ${H}`} className={`${styles.illustrationLayer} ${styles.illustrationFloat}`}>
        <defs>
          <linearGradient id="hiPass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={P.brand500} />
            <stop offset="1" stopColor={P.navy700} />
          </linearGradient>
        </defs>
        <Paper x={70} y={40} w={92} h={112} rotate={-10} />
        <Pass x={128} y={90} w={104} rotate={12} />
        <Clock cx={218} cy={52} r={22} />
      </svg>
    </div>
  );
}
