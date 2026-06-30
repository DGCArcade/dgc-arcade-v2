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

export function DerbyHorse({
  r,
  gallop,
  scale = 1,
  view = "side",
  facing = "right",
}: {
  r: RacerDef;
  gallop: boolean;
  scale?: number;
  view?: HorseView;
  facing?: "left" | "right";
}) {
  const flip = facing === "left" ? "scaleX(-1)" : undefined;
  const cls = gallop ? "horse-gallop" : "";

  if (view === "top") {
    return (
      <svg viewBox="0 0 56 36" width={52 * scale} height={34 * scale} className={`drop-shadow-md ${cls}`} style={{ transform: flip }}>
        <ellipse cx="28" cy="20" rx="20" ry="9" fill={r.coat} />
        <ellipse cx="42" cy="17" rx="8" ry="6" fill={r.coat} />
        <ellipse cx="46" cy="16" rx="2" ry="1.5" fill="#111" />
        <rect x="24" y="12" width="10" height="7" rx="1.5" fill={r.silk} stroke="#fff" strokeWidth="0.6" />
        <text x="29" y="17" textAnchor="middle" fontSize="5" fontWeight="900" fill="#111">{r.num}</text>
        <path d="M14 18 Q8 14 10 24" stroke={r.mane} strokeWidth="3" fill="none" strokeLinecap="round" />
        {gallop && (
          <>
            <ellipse cx="20" cy="28" rx="4" ry="2" fill={r.mane} opacity="0.8" className="horse-leg-front" />
            <ellipse cx="34" cy="28" rx="4" ry="2" fill={r.mane} opacity="0.8" className="horse-leg-back" />
          </>
        )}
      </svg>
    );
  }

  if (view === "front-chase") {
    const s = scale;
    return (
      <svg viewBox="0 0 64 80" width={48 * s} height={60 * s} className={`drop-shadow-xl ${cls}`}>
        <ellipse cx="32" cy="68" rx="18" ry="4" fill="#8B6914" opacity={gallop ? 0.5 : 0.25} className={gallop ? "horse-dust" : ""} />
        <path d="M18 52 L14 68 L20 68 L22 52 Z" fill={r.mane} className="horse-leg-back" />
        <path d="M46 52 L42 68 L48 68 L50 52 Z" fill={r.mane} className="horse-leg-front" />
        <ellipse cx="32" cy="42" rx="20" ry="14" fill={r.coat} />
        <ellipse cx="32" cy="44" rx="14" ry="8" fill={r.body} opacity="0.4" />
        <ellipse cx="32" cy="22" rx="14" ry="12" fill={r.coat} />
        <ellipse cx="32" cy="18" rx="5" ry="4" fill={r.coat} />
        <ellipse cx="26" cy="16" rx="2" ry="2.5" fill="#1a1a1a" />
        <ellipse cx="38" cy="16" rx="2" ry="2.5" fill="#1a1a1a" />
        <path d="M24 10 Q22 4 28 6 Q30 12 26 14" fill={r.mane} />
        <path d="M40 10 Q42 4 36 6 Q34 12 38 14" fill={r.mane} />
        <rect x="24" y="28" width="16" height="11" rx="2" fill={r.silk} stroke="#fff" strokeWidth="0.8" />
        <text x="32" y="36" textAnchor="middle" fontSize="7" fontWeight="900" fill="#111">{r.num}</text>
        <circle cx="32" cy="24" r="4" fill="#F5D0A0" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 96 56" width={88 * scale} height={52 * scale} className={`drop-shadow-lg ${cls}`} style={{ transform: flip }}>
      <ellipse cx="16" cy="48" rx="14" ry="3" fill="#8B6914" opacity={gallop ? 0.55 : 0.2} className={gallop ? "horse-dust" : ""} />
      <path d="M26 38 L22 50 L26 50 L30 38 Z" fill={r.mane} className="horse-leg-back" />
      <path d="M34 38 L30 50 L34 50 L38 38 Z" fill={r.mane} className="horse-leg-front" />
      <ellipse cx="46" cy="30" rx="26" ry="12" fill={r.coat} />
      <ellipse cx="46" cy="32" rx="20" ry="7" fill={r.body} opacity="0.35" />
      <path d="M58 24 Q66 14 74 12 Q78 20 72 28 Q62 32 54 30 Z" fill={r.coat} />
      <ellipse cx="78" cy="16" rx="11" ry="8" fill={r.coat} />
      <ellipse cx="84" cy="14" rx="2.5" ry="2" fill="#111" />
      <path d="M72 8 L74 3 L78 10 Z" fill={r.coat} />
      <path d="M64 8 Q58 2 62 0 Q68 6 66 14 Q70 10 72 18" fill={r.mane} />
      <path d="M22 26 Q10 20 12 34 Q18 32 24 30 Z" fill={r.mane} />
      <path d="M52 38 L48 50 L52 50 L56 38 Z" fill={r.mane} className="horse-leg-front" />
      <path d="M60 38 L56 50 L60 50 L64 38 Z" fill={r.mane} className="horse-leg-back" />
      <rect x="38" y="18" width="14" height="11" rx="2" fill={r.silk} stroke="#fff" strokeWidth="0.7" />
      <text x="45" y="26" textAnchor="middle" fontSize="7" fontWeight="900" fill="#111">{r.num}</text>
      <circle cx="45" cy="14" r="4" fill="#F5D0A0" />
      <ellipse cx="45" cy="12" rx="4" ry="3.5" fill="#333" opacity="0.85" />
    </svg>
  );
}
