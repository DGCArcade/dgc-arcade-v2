export type RacerDef = {
  id: number;
  name: string;
  body: string;
  coat: string;
  mane: string;
  silk: string;
  num: string;
};

type HorseView = "side" | "top" | "front-chase";
export type HorseMood = "neutral" | "happy" | "sad";

function HorseFaceOverlay({
  mood,
  view,
}: {
  mood: HorseMood;
  view: HorseView;
}) {
  if (mood === "neutral") return null;

  if (view === "front-chase") {
    return (
      <g className="derby-horse-face">
        {mood === "happy" ? (
          <>
            <path d="M24 18 Q32 24 40 18" stroke="#1a1a1a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            <path d="M22 10 Q24 6 26 10" stroke="#1a1a1a" strokeWidth="1.2" fill="none" />
            <path d="M38 10 Q40 6 42 10" stroke="#1a1a1a" strokeWidth="1.2" fill="none" />
          </>
        ) : (
          <>
            <path d="M24 22 Q32 16 40 22" stroke="#1a1a1a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            <line x1="24" y1="9" x2="28" y2="12" stroke="#1a1a1a" strokeWidth="1.3" strokeLinecap="round" />
            <line x1="40" y1="9" x2="36" y2="12" stroke="#1a1a1a" strokeWidth="1.3" strokeLinecap="round" />
          </>
        )}
      </g>
    );
  }

  if (view === "top") {
    return (
      <text x="28" y="12" textAnchor="middle" fontSize="10" className="derby-horse-face-emoji">
        {mood === "happy" ? "😄" : "😢"}
      </text>
    );
  }

  // side profile
  return (
    <g className="derby-horse-face">
      {mood === "happy" ? (
        <>
          <path d="M94 24 Q100 30 106 24" stroke="#1a1a1a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M98 14 Q100 10 102 14" stroke="#1a1a1a" strokeWidth="1" fill="none" />
          <circle cx="108" cy="12" r="2.5" fill="none" stroke="#fbbf24" strokeWidth="0.8" className="derby-winner-star" />
        </>
      ) : (
        <>
          <path d="M94 26 Q100 20 106 26" stroke="#1a1a1a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M98 16 L100 13" stroke="#1a1a1a" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M104 16 L102 13" stroke="#1a1a1a" strokeWidth="1.2" strokeLinecap="round" />
          <ellipse cx="100" cy="30" rx="2" ry="1.2" fill="#6b8cce" opacity="0.7" className="derby-sad-tear" />
        </>
      )}
    </g>
  );
}

/** Silk number badge — always visible so players know which horse is which */
export function HorseSilkBadge({
  r,
  size = "sm",
  highlight = false,
}: {
  r: RacerDef;
  size?: "xs" | "sm" | "md";
  highlight?: boolean;
}) {
  const dim = size === "xs" ? "text-[7px] min-w-[14px] h-[14px]" : size === "sm" ? "text-[8px] min-w-[18px] h-[18px]" : "text-[10px] min-w-[22px] h-[22px]";
  return (
    <span
      className={`inline-flex items-center justify-center rounded font-black font-mono border shadow-sm ${dim} ${
        highlight ? "ring-2 ring-yellow-400 ring-offset-1 ring-offset-black/50" : ""
      }`}
      style={{ backgroundColor: r.silk, borderColor: "rgba(255,255,255,0.5)", color: "#111" }}
    >
      {r.num}
    </span>
  );
}

export function DerbyHorse({
  r,
  gallop,
  scale = 1,
  view = "side",
  facing = "right",
  showBadge = false,
  mood = "neutral",
}: {
  r: RacerDef;
  gallop: boolean;
  scale?: number;
  view?: HorseView;
  facing?: "left" | "right";
  showBadge?: boolean;
  mood?: HorseMood;
}) {
  const flip = facing === "left" ? "scaleX(-1)" : undefined;
  const cls = gallop ? "horse-gallop" : "";

  if (view === "top") {
    return (
      <div className="relative flex flex-col items-center" style={{ transform: flip }}>
        {showBadge && <HorseSilkBadge r={r} size="xs" />}
        <svg viewBox="0 0 56 40" width={52 * scale} height={36 * scale} className={`drop-shadow-md ${cls}`}>
          <ellipse cx="28" cy="34" rx="16" ry="3" fill="#000" opacity="0.2" />
          <ellipse cx="28" cy="22" rx="18" ry="8" fill={r.coat} />
          <ellipse cx="40" cy="20" rx="9" ry="6" fill={r.coat} />
          <ellipse cx="44" cy="19" rx="2.5" ry="2" fill="#111" />
          <path d="M16 22 Q10 18 12 28 Q16 26 18 24" fill={r.mane} />
          <path d="M34 30 L32 38 M38 30 L40 38" stroke={r.mane} strokeWidth="2.5" strokeLinecap="round" />
          <rect x="24" y="16" width="12" height="8" rx="1.5" fill={r.silk} stroke="#fff" strokeWidth="0.5" />
          <text x="30" y="22" textAnchor="middle" fontSize="5" fontWeight="900" fill="#111">{r.num}</text>
          <HorseFaceOverlay mood={mood} view="top" />
          {gallop && (
            <>
              <ellipse cx="22" cy="32" rx="3.5" ry="2" fill={r.mane} opacity="0.85" className="horse-leg-front" />
              <ellipse cx="36" cy="32" rx="3.5" ry="2" fill={r.mane} opacity="0.85" className="horse-leg-back" />
            </>
          )}
        </svg>
      </div>
    );
  }

  if (view === "front-chase") {
    const s = scale;
    return (
      <div className="relative flex flex-col items-center">
        {showBadge && <HorseSilkBadge r={r} size="xs" />}
        <svg viewBox="0 0 72 96" width={52 * s} height={68 * s} className={`drop-shadow-xl ${cls}`}>
          <defs>
            <linearGradient id={`chase-coat-${r.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={r.coat} />
              <stop offset="50%" stopColor={r.body} />
              <stop offset="100%" stopColor={r.mane} />
            </linearGradient>
          </defs>
          <ellipse cx="36" cy="88" rx="18" ry="3.5" fill="#000" opacity="0.28" />
          <ellipse cx="36" cy="84" rx="20" ry="4" fill="#8B6914" opacity={gallop ? 0.55 : 0.2} className={gallop ? "horse-dust" : ""} />
          {/* Hind legs */}
          <path d="M18 58 L14 78 L20 80 L24 58 Z" fill={`url(#chase-coat-${r.id})`} className="horse-leg-back" />
          <path d="M22 58 L18 76 L24 78 L28 58 Z" fill={r.coat} className="horse-leg-back" />
          {/* Front legs */}
          <path d="M46 58 L42 78 L48 80 L52 58 Z" fill={`url(#chase-coat-${r.id})`} className="horse-leg-front" />
          <path d="M50 58 L46 76 L52 78 L56 58 Z" fill={r.coat} className="horse-leg-front" />
          {/* Hooves */}
          <rect x="13" y="78" width="8" height="3" rx="1" fill="#2a2a2a" />
          <rect x="17" y="76" width="8" height="3" rx="1" fill="#2a2a2a" />
          <rect x="41" y="78" width="8" height="3" rx="1" fill="#2a2a2a" />
          <rect x="45" y="76" width="8" height="3" rx="1" fill="#2a2a2a" />
          {/* Barrel + chest */}
          <ellipse cx="36" cy="50" rx="20" ry="14" fill={`url(#chase-coat-${r.id})`} />
          <ellipse cx="36" cy="52" rx="14" ry="8" fill={r.body} opacity="0.3" />
          <ellipse cx="30" cy="48" rx="6" ry="4" fill="#fff" opacity="0.06" />
          {/* Neck */}
          <path d="M32 40 Q26 28 30 16 Q34 24 36 40 Z" fill={r.coat} />
          <path d="M40 40 Q46 28 42 16 Q38 24 36 40 Z" fill={r.coat} />
          {/* Head */}
          <ellipse cx="36" cy="14" rx="11" ry="10" fill={r.coat} />
          <ellipse cx="36" cy="17" rx="5" ry="3.5" fill="#F5D0A0" />
          {mood === "neutral" && (
            <>
              <ellipse cx="29" cy="12" rx="2.4" ry="3" fill="#1a1a1a" />
              <ellipse cx="43" cy="12" rx="2.4" ry="3" fill="#1a1a1a" />
              <circle cx="30" cy="11" r="0.8" fill="#fff" opacity="0.85" />
              <circle cx="44" cy="11" r="0.8" fill="#fff" opacity="0.85" />
              <ellipse cx="36" cy="19" rx="3" ry="2" fill={r.body} opacity="0.5" />
            </>
          )}
          {/* Ears + mane */}
          <path d="M28 6 L30 0 L34 8 Z" fill={r.coat} />
          <path d="M44 6 L42 0 L38 8 Z" fill={r.coat} />
          <path d="M26 10 Q22 2 30 4 Q32 12 28 14" fill={r.mane} />
          <path d="M46 10 Q50 2 42 4 Q40 12 44 14" fill={r.mane} />
          {/* Silk */}
          <rect x="24" y="34" width="24" height="14" rx="2.5" fill={r.silk} stroke="#fff" strokeWidth="0.8" />
          <text x="36" y="44" textAnchor="middle" fontSize="8" fontWeight="900" fill="#111">{r.num}</text>
          <HorseFaceOverlay mood={mood} view="front-chase" />
        </svg>
      </div>
    );
  }

  // Side profile — thoroughbred-style racing silhouette
  return (
    <div className="relative flex flex-col items-center" style={{ transform: flip }}>
      {showBadge && <HorseSilkBadge r={r} size="sm" />}
      <svg viewBox="0 0 120 64" width={100 * scale} height={56 * scale} className={`drop-shadow-lg ${cls}`}>
        <defs>
          <linearGradient id={`coat-${r.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={r.coat} />
            <stop offset="45%" stopColor={r.body} />
            <stop offset="100%" stopColor={r.mane} />
          </linearGradient>
          <linearGradient id={`silk-shine-${r.id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <ellipse cx="22" cy="58" rx="18" ry="3" fill="#000" opacity="0.24" />
        <ellipse cx="22" cy="56" rx="16" ry="2.5" fill="#8B6914" opacity={gallop ? 0.5 : 0.12} className={gallop ? "horse-dust" : ""} />
        {/* Tail — long flowing */}
        <path d="M14 28 Q4 24 6 36 Q10 32 16 30 Q12 38 18 34" fill={r.mane} />
        {/* Hindquarters */}
        <path d="M18 34 Q14 30 20 26 Q32 24 38 28 L36 38 Q28 42 20 40 Z" fill={`url(#coat-${r.id})`} />
        {/* Back legs — long racing limbs */}
        <path d="M24 38 L20 50 L24 52 L28 50 L30 38 Z" fill={r.coat} className="horse-leg-back" />
        <path d="M32 38 L28 50 L32 52 L36 50 L38 38 Z" fill={r.body} className="horse-leg-back" />
        <rect x="19" y="50" width="6" height="2.5" rx="0.6" fill="#e8e8e8" opacity="0.75" />
        <rect x="27" y="50" width="6" height="2.5" rx="0.6" fill="#e8e8e8" opacity="0.75" />
        {/* Barrel */}
        <ellipse cx="52" cy="32" rx="26" ry="12" fill={`url(#coat-${r.id})`} />
        <ellipse cx="52" cy="34" rx="20" ry="7" fill={r.body} opacity="0.28" />
        <ellipse cx="58" cy="29" rx="12" ry="4" fill="#fff" opacity="0.07" />
        {/* Front legs */}
        <path d="M62 38 L58 50 L62 52 L66 50 L68 38 Z" fill={r.coat} className="horse-leg-front" />
        <path d="M72 38 L68 50 L72 52 L76 50 L78 38 Z" fill={r.body} className="horse-leg-front" />
        <rect x="57" y="50" width="6" height="2.5" rx="0.6" fill="#e8e8e8" opacity="0.75" />
        <rect x="67" y="50" width="6" height="2.5" rx="0.6" fill="#e8e8e8" opacity="0.75" />
        {/* Neck — arched racer pose */}
        <path d="M68 28 Q82 14 88 10 Q94 16 90 26 Q78 32 68 30 Z" fill={r.coat} />
        <path d="M72 18 Q78 12 84 14" stroke={r.mane} strokeWidth="1.5" fill="none" opacity="0.4" />
        {/* Head */}
        <ellipse cx="96" cy="16" rx="13" ry="10" fill={r.coat} />
        <ellipse cx="102" cy="18" rx="5" ry="3.5" fill="#F5D0A0" opacity="0.85" />
        {mood === "neutral" && (
          <>
            <ellipse cx="104" cy="14" rx="2.8" ry="2.2" fill="#111" />
            <circle cx="105" cy="13.5" r="0.9" fill="#fff" opacity="0.75" />
          </>
        )}
        <path d="M106 18 L112 16 L108 21 Z" fill={r.coat} />
        <ellipse cx="110" cy="19" rx="2" ry="1.2" fill={r.body} opacity="0.55" />
        {/* Ears */}
        <path d="M88 6 L90 0 L94 8 Z" fill={r.coat} />
        <path d="M92 5 L94 1 L96 7 Z" fill={r.coat} />
        {/* Mane */}
        <path d="M76 6 Q70 -2 78 0 Q86 10 82 18 Q88 14 94 24" fill={r.mane} />
        <path d="M64 22 Q54 18 56 30 Q62 26 66 24" fill={r.mane} opacity="0.9" />
        {/* Silk */}
        <rect x="42" y="22" width="18" height="13" rx="2" fill={r.silk} stroke="#fff" strokeWidth="0.7" />
        <rect x="42" y="22" width="18" height="5" rx="2" fill={`url(#silk-shine-${r.id})`} />
        <text x="51" y="31" textAnchor="middle" fontSize="7.5" fontWeight="900" fill="#111">{r.num}</text>
        <path d="M98 22 Q104 28 100 34" stroke="#333" strokeWidth="0.9" fill="none" opacity="0.45" />
        <HorseFaceOverlay mood={mood} view="side" />
      </svg>
    </div>
  );
}
