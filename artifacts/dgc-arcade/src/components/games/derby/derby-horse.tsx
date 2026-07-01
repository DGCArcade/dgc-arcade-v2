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
          <path d="M78 22 Q84 28 90 22" stroke="#1a1a1a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M82 12 Q84 8 86 12" stroke="#1a1a1a" strokeWidth="1" fill="none" />
          <circle cx="92" cy="10" r="2.5" fill="none" stroke="#fbbf24" strokeWidth="0.8" className="derby-winner-star" />
        </>
      ) : (
        <>
          <path d="M78 24 Q84 18 90 24" stroke="#1a1a1a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M82 14 L84 11" stroke="#1a1a1a" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M88 14 L86 11" stroke="#1a1a1a" strokeWidth="1.2" strokeLinecap="round" />
          <ellipse cx="84" cy="28" rx="2" ry="1.2" fill="#6b8cce" opacity="0.7" className="derby-sad-tear" />
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
        <svg viewBox="0 0 64 84" width={48 * s} height={62 * s} className={`drop-shadow-xl ${cls}`}>
          <ellipse cx="32" cy="76" rx="16" ry="3.5" fill="#000" opacity="0.25" />
          <ellipse cx="32" cy="72" rx="18" ry="4" fill="#8B6914" opacity={gallop ? 0.55 : 0.2} className={gallop ? "horse-dust" : ""} />
          {/* Legs */}
          <path d="M20 54 L16 72 L22 72 L24 54 Z" fill={r.coat} stroke={r.mane} strokeWidth="0.5" className="horse-leg-back" />
          <path d="M44 54 L40 72 L46 72 L48 54 Z" fill={r.coat} stroke={r.mane} strokeWidth="0.5" className="horse-leg-front" />
          <path d="M26 54 L22 70 L28 70 L30 54 Z" fill={r.coat} className="horse-leg-front" />
          <path d="M38 54 L34 70 L40 70 L42 54 Z" fill={r.coat} className="horse-leg-back" />
          {/* Body */}
          <ellipse cx="32" cy="44" rx="18" ry="13" fill={r.coat} />
          <ellipse cx="32" cy="46" rx="13" ry="7" fill={r.body} opacity="0.35" />
          {/* Neck + head */}
          <path d="M32 34 Q28 22 32 14 Q36 22 32 34" fill={r.coat} />
          <ellipse cx="32" cy="14" rx="10" ry="9" fill={r.coat} />
          {mood === "neutral" && (
            <>
              <ellipse cx="26" cy="12" rx="2.2" ry="2.8" fill="#1a1a1a" />
              <ellipse cx="38" cy="12" rx="2.2" ry="2.8" fill="#1a1a1a" />
              <circle cx="27" cy="11" r="0.7" fill="#fff" opacity="0.8" />
              <circle cx="39" cy="11" r="0.7" fill="#fff" opacity="0.8" />
            </>
          )}
          <ellipse cx="32" cy="16" rx="4" ry="3" fill="#F5D0A0" />
          <path d="M24 8 Q22 2 28 4 Q30 10 26 12" fill={r.mane} />
          <path d="M40 8 Q42 2 36 4 Q34 10 38 12" fill={r.mane} />
          {/* Silk */}
          <rect x="22" y="30" width="20" height="12" rx="2" fill={r.silk} stroke="#fff" strokeWidth="0.8" />
          <text x="32" y="39" textAnchor="middle" fontSize="7" fontWeight="900" fill="#111">{r.num}</text>
          <path d="M28 18 Q24 8 20 6" stroke={r.mane} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M36 18 Q40 8 44 6" stroke={r.mane} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <HorseFaceOverlay mood={mood} view="front-chase" />
        </svg>
      </div>
    );
  }

  // Side profile — more anatomically detailed
  return (
    <div className="relative flex flex-col items-center" style={{ transform: flip }}>
      {showBadge && <HorseSilkBadge r={r} size="sm" />}
      <svg viewBox="0 0 100 60" width={92 * scale} height={54 * scale} className={`drop-shadow-lg ${cls}`}>
        <defs>
          <linearGradient id={`coat-${r.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={r.coat} />
            <stop offset="55%" stopColor={r.body} />
            <stop offset="100%" stopColor={r.mane} />
          </linearGradient>
          <linearGradient id={`silk-shine-${r.id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Ground shadow */}
        <ellipse cx="18" cy="54" rx="16" ry="3" fill="#000" opacity="0.22" />
        <ellipse cx="18" cy="52" rx="14" ry="2.5" fill="#8B6914" opacity={gallop ? 0.5 : 0.15} className={gallop ? "horse-dust" : ""} />
        {/* Back legs */}
        <path d="M28 40 L24 52 L28 52 L32 40 Z" fill={r.coat} className="horse-leg-back" />
        <path d="M34 40 L30 52 L34 52 L38 40 Z" fill={r.coat} className="horse-leg-back" />
        {/* Tail */}
        <path d="M18 30 Q8 26 10 38 Q14 34 20 32" fill={r.mane} />
        {/* Body */}
        <ellipse cx="44" cy="32" rx="24" ry="11" fill={`url(#coat-${r.id})`} />
        <ellipse cx="44" cy="34" rx="18" ry="6" fill={r.body} opacity="0.35" />
        <ellipse cx="50" cy="30" rx="10" ry="4" fill="#fff" opacity="0.08" />
        {/* Front legs */}
        <path d="M54 40 L50 52 L54 52 L58 40 Z" fill={r.coat} className="horse-leg-front" />
        <path d="M62 40 L58 52 L62 52 L66 40 Z" fill={r.coat} className="horse-leg-front" />
        <rect x="49" y="50" width="5" height="2" rx="0.5" fill="#e2e8f0" opacity="0.7" />
        <rect x="57" y="50" width="5" height="2" rx="0.5" fill="#e2e8f0" opacity="0.7" />
        {/* Neck */}
        <path d="M58 26 Q68 16 74 14 Q78 22 72 30 Q64 34 58 30 Z" fill={r.coat} />
        {/* Head */}
        <ellipse cx="80" cy="18" rx="12" ry="9" fill={r.coat} />
        {mood === "neutral" && (
          <>
            <ellipse cx="86" cy="16" rx="2.5" ry="2" fill="#111" />
            <circle cx="87" cy="15.5" r="0.8" fill="#fff" opacity="0.7" />
          </>
        )}
        <path d="M88 18 L92 16 L90 20 Z" fill={r.coat} />
        {/* Ears */}
        <path d="M74 8 L76 2 L78 10 Z" fill={r.coat} />
        {/* Mane */}
        <path d="M62 10 Q58 2 64 0 Q70 8 68 16 Q72 12 76 20" fill={r.mane} />
        <path d="M56 22 Q48 18 50 28 Q54 26 58 24" fill={r.mane} opacity="0.85" />
        {/* Silk / saddle cloth */}
        <rect x="36" y="20" width="16" height="12" rx="2" fill={r.silk} stroke="#fff" strokeWidth="0.7" />
        <rect x="36" y="20" width="16" height="5" rx="2" fill={`url(#silk-shine-${r.id})`} />
        <text x="44" y="28.5" textAnchor="middle" fontSize="7" fontWeight="900" fill="#111">{r.num}</text>
        {/* Bridle hint */}
        <path d="M80 20 Q84 24 82 28" stroke="#333" strokeWidth="0.8" fill="none" opacity="0.5" />
        {/* Nostril */}
        <ellipse cx="90" cy="20" rx="1.5" ry="1" fill={r.body} opacity="0.6" />
        <HorseFaceOverlay mood={mood} view="side" />
      </svg>
    </div>
  );
}
