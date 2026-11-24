/**
 * One illustration per kind of error, drawn in the brand palette (DECISIONS V1). Decorative:
 * the heading and text carry the meaning, so every drawing is hidden from screen readers.
 */
export type ErrorKind =
  | 'not-found'
  | 'server'
  | 'offline'
  | 'forbidden'
  | 'signed-out'
  | 'blocked'
  | 'unavailable'
  | 'rate-limit';

const NAVY = '#001D39';
const BLUE = '#0A4174';
const STEEL = '#49769F';
const TEAL = '#4E8EA2';
const SKY = '#7BBDE8';
const ICE = '#BDD8E9';
const PALE = '#EAF3F8';

/** Soft backdrop shared by every drawing: a pale disc and a ground shadow. */
function Ground() {
  return (
    <>
      <circle cx="120" cy="92" r="78" fill={PALE} />
      <ellipse cx="120" cy="166" rx="70" ry="7" fill={ICE} opacity="0.7" />
    </>
  );
}

const ART: Record<ErrorKind, () => React.JSX.Element> = {
  // A paper with a magnifier finding nothing: the page is not here.
  'not-found': () => (
    <>
      <Ground />
      <rect x="64" y="38" width="82" height="104" rx="10" fill="#fff" stroke={STEEL} strokeWidth="3" />
      <rect x="78" y="58" width="54" height="7" rx="3.5" fill={ICE} />
      <rect x="78" y="74" width="40" height="7" rx="3.5" fill={ICE} />
      <rect x="78" y="90" width="48" height="7" rx="3.5" fill={ICE} />
      <circle cx="150" cy="110" r="26" fill="#fff" stroke={BLUE} strokeWidth="6" />
      <path d="M169 129 l20 20" stroke={NAVY} strokeWidth="9" strokeLinecap="round" />
      <text x="150" y="119" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="26" fill={BLUE}>
        ?
      </text>
    </>
  ),
  // A server with a warning sign: something broke on our side.
  server: () => (
    <>
      <Ground />
      <rect x="70" y="40" width="100" height="36" rx="8" fill={BLUE} />
      <rect x="70" y="84" width="100" height="36" rx="8" fill={STEEL} />
      <circle cx="88" cy="58" r="5" fill={SKY} />
      <circle cx="88" cy="102" r="5" fill={ICE} />
      <rect x="102" y="54" width="52" height="8" rx="4" fill={TEAL} />
      <rect x="102" y="98" width="52" height="8" rx="4" fill={SKY} opacity="0.7" />
      <path d="M158 112 l24 42 h-48 z" fill="#fff" stroke={NAVY} strokeWidth="4" strokeLinejoin="round" />
      <path d="M158 128 v12" stroke={NAVY} strokeWidth="5" strokeLinecap="round" />
      <circle cx="158" cy="147" r="3" fill={NAVY} />
    </>
  ),
  // A cloud with a broken link: no connection.
  offline: () => (
    <>
      <Ground />
      <path
        d="M76 112 a26 26 0 0 1 6-51 a34 34 0 0 1 64-6 a24 24 0 0 1 18 57 z"
        fill="#fff"
        stroke={STEEL}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M92 132 a10 10 0 0 1 0-20 h16" stroke={BLUE} strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M148 112 a10 10 0 0 1 0 20 h-16" stroke={BLUE} strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M116 108 l-4 -10 M124 108 l4 -10 M120 140 v10" stroke={TEAL} strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  // A shield with a lock: you are not allowed here.
  forbidden: () => (
    <>
      <Ground />
      <path d="M120 30 l52 18 v38 c0 34-22 56-52 68 c-30-12-52-34-52-68 v-38 z" fill={BLUE} />
      <path d="M120 44 l38 13 v29 c0 26-16 43-38 53 c-22-10-38-27-38-53 v-29 z" fill={STEEL} opacity="0.55" />
      <rect x="100" y="88" width="40" height="32" rx="6" fill="#fff" />
      <path d="M108 88 v-10 a12 12 0 0 1 24 0 v10" stroke="#fff" strokeWidth="6" fill="none" />
      <circle cx="120" cy="101" r="4.5" fill={NAVY} />
      <path d="M120 104 v8" stroke={NAVY} strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  // A door with a key: sign in again.
  'signed-out': () => (
    <>
      <Ground />
      <rect x="82" y="34" width="64" height="122" rx="6" fill={BLUE} />
      <rect x="90" y="42" width="48" height="114" rx="4" fill={STEEL} />
      <circle cx="128" cy="100" r="4" fill={ICE} />
      <circle cx="166" cy="118" r="14" fill="none" stroke={TEAL} strokeWidth="7" />
      <path d="M156 128 l-26 26 M138 146 l7 7 M146 138 l7 7" stroke={TEAL} strokeWidth="7" strokeLinecap="round" />
    </>
  ),
  // A person with a "no entry" badge: the account cannot be used.
  blocked: () => (
    <>
      <Ground />
      <circle cx="108" cy="70" r="24" fill={STEEL} />
      <path d="M62 150 c4-32 24-48 46-48 s42 16 46 48 z" fill={BLUE} />
      <circle cx="158" cy="122" r="24" fill="#fff" stroke={NAVY} strokeWidth="5" />
      <path d="M141 139 l34 -34" stroke={NAVY} strokeWidth="5" strokeLinecap="round" />
    </>
  ),
  // A safety cone and a wrench: the service is down for a moment.
  unavailable: () => (
    <>
      <Ground />
      <path d="M100 150 l20 -104 l20 104 z" fill={TEAL} />
      <path d="M110 100 h20 l3 16 h-26 z M104 130 h32 l3 14 h-38 z" fill="#fff" />
      <rect x="86" y="148" width="68" height="10" rx="3" fill={BLUE} />
      <path
        d="M170 66 a14 14 0 0 0-18 18 l-28 28 a6 6 0 0 0 9 9 l28-28 a14 14 0 0 0 18-18 l-9 9 l-8-2 l-2-8 z"
        fill={STEEL}
      />
    </>
  ),
  // An hourglass: too many requests, wait a moment.
  'rate-limit': () => (
    <>
      <Ground />
      <rect x="84" y="34" width="72" height="10" rx="5" fill={BLUE} />
      <rect x="84" y="140" width="72" height="10" rx="5" fill={BLUE} />
      <path d="M92 44 h56 c0 30-22 36-22 48 s22 18 22 48 h-56 c0-30 22-36 22-48 s-22-18-22-48 z" fill="#fff" stroke={STEEL} strokeWidth="3" />
      <path d="M102 56 h36 c-4 14-18 20-18 30 c0-10-14-16-18-30 z" fill={SKY} />
      <path d="M100 136 c4-16 20-20 20-30 c0 10 16 14 20 30 z" fill={TEAL} />
    </>
  ),
};

export function ErrorArt({ kind, className }: { kind: ErrorKind; className?: string | undefined }) {
  const Art = ART[kind];
  return (
    <svg className={className} viewBox="0 0 240 180" role="presentation" aria-hidden="true" focusable="false">
      <Art />
    </svg>
  );
}
