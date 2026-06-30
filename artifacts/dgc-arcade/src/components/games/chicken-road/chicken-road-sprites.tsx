/** Top-down chicken sprite (Stake-style) */
export function ChickenSprite({ hopping, size = 48 }: { hopping?: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 48 56" width={size} height={size * 1.15} className={hopping ? "cr-chicken-hop" : ""}>
      <ellipse cx="24" cy="50" rx="10" ry="3" fill="#000" opacity="0.2" />
      {/* Legs */}
      <path d="M18 44 L16 52 M30 44 L32 52" stroke="#E8A020" strokeWidth="2.5" strokeLinecap="round" />
      {/* Body */}
      <ellipse cx="24" cy="36" rx="14" ry="12" fill="#F5F5F0" />
      <ellipse cx="24" cy="38" rx="10" ry="8" fill="#E8E8E0" opacity="0.5" />
      {/* Wing */}
      <ellipse cx="30" cy="36" rx="6" ry="8" fill="#E0E0D8" />
      {/* Head */}
      <circle cx="24" cy="22" r="11" fill="#F5F5F0" />
      {/* Comb */}
      <path d="M18 14 L20 8 L22 14 L24 6 L26 14 L28 8 L30 14" fill="#E53E3E" stroke="#C53030" strokeWidth="0.5" />
      {/* Beak */}
      <path d="M24 24 L20 28 L24 27 L28 28 Z" fill="#F6AD55" />
      <circle cx="20" cy="21" r="2" fill="#1A1A1A" />
      <circle cx="28" cy="21" r="2" fill="#1A1A1A" />
      <circle cx="20.5" cy="20.5" r="0.8" fill="#fff" />
      <circle cx="28.5" cy="20.5" r="0.8" fill="#fff" />
    </svg>
  );
}

const CAR_COLORS = ["#9B59B6", "#3498DB", "#2ECC71", "#E74C3C", "#F39C12", "#1ABC9C"];

export function CarSprite({ color, variant = "sedan", size = 36 }: { color: string; variant?: "sedan" | "truck"; size?: number }) {
  if (variant === "truck") {
    return (
      <svg viewBox="0 0 40 64" width={size * 0.65} height={size} className="cr-car-drive">
        <rect x="4" y="8" width="32" height="44" rx="4" fill={color} />
        <rect x="6" y="12" width="28" height="16" rx="2" fill="#000" opacity="0.25" />
        <rect x="2" y="48" width="36" height="10" rx="2" fill="#333" />
        <circle cx="10" cy="58" r="4" fill="#222" />
        <circle cx="30" cy="58" r="4" fill="#222" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 36 56" width={size * 0.6} height={size} className="cr-car-drive">
      <rect x="4" y="12" width="28" height="32" rx="6" fill={color} />
      <rect x="8" y="16" width="20" height="12" rx="2" fill="#000" opacity="0.3" />
      <rect x="6" y="40" width="24" height="8" rx="2" fill="#222" />
      <circle cx="10" cy="50" r="4" fill="#111" />
      <circle cx="26" cy="50" r="4" fill="#111" />
    </svg>
  );
}

export function TrafficLight({ active }: { active: "red" | "yellow" | "green" }) {
  return (
    <svg viewBox="0 0 24 64" width={20} height={52}>
      <rect x="6" y="4" width="12" height="52" rx="3" fill="#2D3748" stroke="#4A5568" strokeWidth="1" />
      <circle cx="12" cy="14" r="4" fill={active === "red" ? "#FC8181" : "#4A1A1A"} />
      <circle cx="12" cy="30" r="4" fill={active === "yellow" ? "#F6E05E" : "#4A4A1A"} />
      <circle cx="12" cy="46" r="4" fill={active === "green" ? "#68D391" : "#1A4A2A"} />
    </svg>
  );
}
