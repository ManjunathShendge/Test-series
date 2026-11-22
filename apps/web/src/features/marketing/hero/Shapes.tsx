/*
 * Satin pseudo-3D shapes for the hero cards (the reference's ribbon, pleat and bloom
 * renders), drawn as SVG gradients in the brand blues only. Decorative.
 */

/** A flowing ribbon: three offset bands with a light edge, like folded satin. */
export function Ribbon() {
  return (
    <svg viewBox="0 0 200 120" aria-hidden="true">
      <defs>
        <linearGradient id="rbA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#BDD8E9" />
          <stop offset="0.45" stopColor="#7BBDE8" />
          <stop offset="1" stopColor="#0569D6" />
        </linearGradient>
        <linearGradient id="rbB" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#0A4174" />
          <stop offset="0.5" stopColor="#0569D6" />
          <stop offset="1" stopColor="#7BBDE8" />
        </linearGradient>
        <linearGradient id="rbHi" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.85" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M-10 92 C 40 40, 90 130, 140 70 S 210 30, 220 46 L 220 78 C 190 62, 170 100, 140 104 S 50 92, -10 128 Z" fill="url(#rbB)" />
      <path d="M-10 70 C 40 20, 90 110, 140 52 S 210 12, 220 26 L 220 52 C 190 40, 160 86, 132 88 S 40 64, -10 104 Z" fill="url(#rbA)" />
      <path d="M-10 70 C 40 20, 90 110, 140 52 S 210 12, 220 26" fill="none" stroke="url(#rbHi)" strokeWidth="3" />
    </svg>
  );
}

/** A pleated fan: overlapping arcs from deep to pale, each with a highlight. */
export function Pleat() {
  const bands = ['#0A4174', '#0569D6', '#4E8EA2', '#7BBDE8', '#BDD8E9'];
  return (
    <svg viewBox="0 0 200 120" aria-hidden="true">
      <defs>
        {bands.map((c, i) => (
          <linearGradient key={c} id={`plt${i}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
            <stop offset="0.35" stopColor={c} />
            <stop offset="1" stopColor={c} />
          </linearGradient>
        ))}
      </defs>
      {bands.map((_, i) => (
        <path
          key={i}
          d={`M ${40 + i * 18} 130 C ${50 + i * 18} ${70 - i * 6}, ${120 + i * 10} ${50 - i * 4}, ${200} ${60 + i * 8} L 210 130 Z`}
          fill={`url(#plt${i})`}
          opacity={0.96}
        />
      ))}
    </svg>
  );
}

/** A folded bloom: five petals around a bright core. */
export function Bloom() {
  return (
    <svg viewBox="0 0 200 140" aria-hidden="true">
      <defs>
        <radialGradient id="blP" cx="30%" cy="25%" r="80%">
          <stop offset="0" stopColor="#BDD8E9" />
          <stop offset="0.5" stopColor="#7BBDE8" />
          <stop offset="1" stopColor="#0569D6" />
        </radialGradient>
        <radialGradient id="blC" cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#7BBDE8" />
        </radialGradient>
      </defs>
      <g transform="translate(118 86)">
        {[0, 72, 144, 216, 288].map((a) => (
          <ellipse key={a} cx="0" cy="-30" rx="24" ry="40" fill="url(#blP)" transform={`rotate(${a}) skewX(-12)`} opacity="0.95" />
        ))}
        <circle r="16" fill="url(#blC)" />
      </g>
    </svg>
  );
}
