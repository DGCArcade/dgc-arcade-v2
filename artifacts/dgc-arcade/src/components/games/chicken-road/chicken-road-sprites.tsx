/** Top-down chicken — Stake-style cartoon */
export function ChickenSprite({ hopping, size = 52, facing = "right" }: { hopping?: boolean; size?: number; facing?: "left" | "right" }) {
  const flip = facing === "left" ? "scaleX(-1)" : undefined;
  return (
    <svg viewBox="0 0 56 64" width={size} height={size * 1.14} className={hopping ? "cr-chicken-hop" : ""} style={{ transform: flip }}>
      <ellipse cx="28" cy="58" rx="12" ry="3" fill="#000" opacity="0.25" />
      <path d="M20 48 L18 58 M36 48 L38 58" stroke="#E8A020" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="28" cy="40" rx="16" ry="14" fill="#F8F8F2" />
      <ellipse cx="34" cy="38" rx="8" ry="10" fill="#ECECE4" />
      <circle cx="28" cy="24" r="13" fill="#F8F8F2" />
      <path d="M18 12 L20 5 L23 13 L26 3 L29 13 L32 5 L35 13 L38 8" fill="#E53E3E" stroke="#C53030" strokeWidth="0.5" />
      <path d="M28 28 L22 34 L28 32 L34 34 Z" fill="#F6AD55" stroke="#DD6B20" strokeWidth="0.5" />
      <circle cx="22" cy="22" r="2.5" fill="#1A1A1A" />
      <circle cx="34" cy="22" r="2.5" fill="#1A1A1A" />
      <circle cx="23" cy="21" r="0.9" fill="#fff" />
      <circle cx="35" cy="21" r="0.9" fill="#fff" />
      <ellipse cx="40" cy="26" rx="5" ry="3" fill="#F04040" opacity="0.5" />
    </svg>
  );
}

const CAR_PALETTE = ["#E74C3C", "#3498DB", "#9B59B6", "#2ECC71", "#F39C12", "#1ABC9C"];

export function CarSprite({
  color,
  variant = "sedan",
  size = 44,
  direction = "down",
}: {
  color: string;
  variant?: "sedan" | "suv" | "truck";
  size?: number;
  direction?: "up" | "down";
}) {
  const flip = direction === "up" ? "scaleY(-1)" : undefined;
  const w = size * (variant === "truck" ? 0.7 : 0.62);
  const h = size;

  if (variant === "truck") {
    return (
      <svg viewBox="0 0 44 72" width={w} height={h} style={{ transform: flip }} className="drop-shadow-md">
        <rect x="6" y="4" width="32" height="36" rx="4" fill={color} />
        <rect x="8" y="8" width="28" height="14" rx="2" fill="#1a1a2e" opacity="0.45" />
        <rect x="4" y="38" width="36" height="18" rx="3" fill={color} filter="brightness(0.85)" />
        <rect x="2" y="52" width="40" height="8" rx="2" fill="#2d3748" />
        <circle cx="12" cy="62" r="5" fill="#1a1a1a" />
        <circle cx="32" cy="62" r="5" fill="#1a1a1a" />
        <circle cx="12" cy="62" r="2" fill="#718096" />
        <circle cx="32" cy="62" r="2" fill="#718096" />
        <rect x="38" y="44" width="4" height="6" rx="1" fill="#F6E05E" />
      </svg>
    );
  }

  if (variant === "suv") {
    return (
      <svg viewBox="0 0 40 68" width={w} height={h} style={{ transform: flip }} className="drop-shadow-md">
        <rect x="4" y="10" width="32" height="38" rx="8" fill={color} />
        <rect x="8" y="14" width="24" height="14" rx="3" fill="#1a1a2e" opacity="0.4" />
        <rect x="6" y="44" width="28" height="10" rx="2" fill="#2d3748" />
        <circle cx="11" cy="56" r="5" fill="#1a1a1a" />
        <circle cx="29" cy="56" r="5" fill="#1a1a1a" />
        <rect x="34" y="30" width="3" height="5" rx="1" fill="#F6E05E" opacity="0.9" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 36 64" width={w} height={h} style={{ transform: flip }} className="drop-shadow-md">
      <rect x="4" y="8" width="28" height="36" rx="7" fill={color} />
      <rect x="8" y="12" width="20" height="12" rx="2" fill="#1a1a2e" opacity="0.45" />
      <path d="M6 40 H30" stroke="#000" opacity="0.15" strokeWidth="1" />
      <rect x="6" y="42" width="24" height="8" rx="2" fill="#2d3748" />
      <circle cx="10" cy="54" r="5" fill="#1a1a1a" />
      <circle cx="26" cy="54" r="5" fill="#1a1a1a" />
      <circle cx="10" cy="54" r="2" fill="#A0AEC0" />
      <circle cx="26" cy="54" r="2" fill="#A0AEC0" />
      <rect x="30" y="22" width="3" height="4" rx="1" fill="#F6E05E" />
    </svg>
  );
}

export function TrafficLight({ active }: { active: "red" | "yellow" | "green" }) {
  return (
    <svg viewBox="0 0 28 72" width={22} height={58}>
      <rect x="8" y="4" width="12" height="56" rx="4" fill="#2D3748" stroke="#4A5568" />
      <circle cx="14" cy="16" r="5" fill={active === "red" ? "#FC8181" : "#3D1A1A"} />
      <circle cx="14" cy="34" r="5" fill={active === "yellow" ? "#F6E05E" : "#3D3D1A"} />
      <circle cx="14" cy="52" r="5" fill={active === "green" ? "#68D391" : "#1A3D2A"} />
      <rect x="12" y="60" width="4" height="8" fill="#4A5568" />
    </svg>
  );
}

export function getCarColor(lane: number) {
  return CAR_PALETTE[lane % CAR_PALETTE.length];
}
