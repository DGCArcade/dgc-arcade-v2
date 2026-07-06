/** Top-down chicken — Stake-style cartoon */
export function ChickenSprite({
  hopping,
  running,
  size = 52,
  facing = "right",
}: {
  hopping?: boolean;
  running?: boolean;
  size?: number;
  facing?: "left" | "right";
}) {
  const flip = facing === "left" ? "scaleX(-1)" : undefined;
  const animClass = running ? "cr-chicken-run" : ""; // Removed cr-chicken-hop as it conflicts with useChickenMotor.ts JS animation
  return (
    <svg viewBox="0 0 56 64" width={size} height={size * 1.14} className={animClass} style={{ transform: flip }}>
      <ellipse cx="28" cy="58" rx="12" ry="3" fill="#000" opacity="0.25" />
      {running ? (
        <>
          <g className="cr-chicken-leg-left">
            <path d="M20 48 L18 58" stroke="#E8A020" strokeWidth="3" strokeLinecap="round" />
          </g>
          <g className="cr-chicken-leg-right">
            <path d="M36 48 L38 58" stroke="#E8A020" strokeWidth="3" strokeLinecap="round" />
          </g>
        </>
      ) : (
        <path d="M20 48 L18 58 M36 48 L38 58" stroke="#E8A020" strokeWidth="3" strokeLinecap="round" />
      )}
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

const CAR_PALETTE = ["#C0392B", "#2980B9", "#8E44AD", "#27AE60", "#D35400", "#16A085"];

function darken(hex: string, amt = 0.15) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) * (1 - amt)) | 0;
  const g = Math.max(0, ((n >> 8) & 0xff) * (1 - amt)) | 0;
  const b = Math.max(0, (n & 0xff) * (1 - amt)) | 0;
  return `rgb(${r},${g},${b})`;
}

function CarShadow({ w, h }: { w: number; h: number }) {
  return (
    <ellipse cx={w / 2} cy={h - 2} rx={w * 0.4} ry={3.5} fill="#000" opacity="0.32" />
  );
}

function CarLights({ direction, variant, filterId }: { direction: "up" | "down"; variant: string; filterId?: string }) {
  const fl = filterId ? `url(#${filterId})` : undefined;
  if (direction === "down") {
    return (
      <>
        <ellipse cx="14" cy="6" rx="4" ry="2.5" fill="#FFFDE7" opacity="0.95" />
        <ellipse cx="22" cy="6" rx="4" ry="2.5" fill="#FFFDE7" opacity="0.95" />
        <ellipse cx="14" cy="8" rx="7" ry="4" fill="#F6E05E" opacity="0.35" filter={fl} className="cr-car-headlight-glow" />
        <ellipse cx="22" cy="8" rx="7" ry="4" fill="#F6E05E" opacity="0.35" filter={fl} className="cr-car-headlight-glow" />
        <ellipse cx="14" cy="9" rx="10" ry="5" fill="#FFF9C4" opacity="0.12" filter={fl} />
        <ellipse cx="22" cy="9" rx="10" ry="5" fill="#FFF9C4" opacity="0.12" filter={fl} />
      </>
    );
  }
  return (
    <>
      <rect x="12" y={variant === "truck" ? 62 : 56} width="5" height="3" rx="1" fill="#FF4444" opacity="0.95" />
      <rect x="19" y={variant === "truck" ? 62 : 56} width="5" height="3" rx="1" fill="#FF4444" opacity="0.95" />
      <ellipse cx="14.5" cy={variant === "truck" ? 64 : 58} rx="5" ry="2.5" fill="#FF0000" opacity="0.35" filter={fl} />
      <ellipse cx="21.5" cy={variant === "truck" ? 64 : 58} rx="5" ry="2.5" fill="#FF0000" opacity="0.35" filter={fl} />
    </>
  );
}

function CarWheels({ cy, wheelCls }: { cy: number; wheelCls: string }) {
  return (
    <g className={wheelCls}>
      <circle cx="10" cy={cy} r="5.5" fill="#1a1a1a" />
      <circle cx="26" cy={cy} r="5.5" fill="#1a1a1a" />
      <circle cx="10" cy={cy} r="2.2" fill="#718096" />
      <circle cx="26" cy={cy} r="2.2" fill="#718096" />
      <circle cx="10" cy={cy} r="0.8" fill="#A0AEC0" />
      <circle cx="26" cy={cy} r="0.8" fill="#A0AEC0" />
    </g>
  );
}

export function CarSprite({
  color,
  variant = "sedan",
  size = 44,
  direction = "down",
  ambient = false,
}: {
  color: string;
  variant?: "sedan" | "suv" | "truck";
  size?: number;
  direction?: "up" | "down";
  /** Continuous traffic loop — enables wheel spin + motion blur */
  ambient?: boolean;
}) {
  const flip = direction === "up" ? "scaleY(-1)" : undefined;
  const w = size * (variant === "truck" ? 0.7 : 0.62);
  const h = size;
  const motionCls = ambient ? "cr-car-ambient-motion" : "";
  const wheelCls = ambient ? "cr-car-wheel-spin" : "";
  const hlFilter = `cr-hl-bloom-${direction}`;

  if (variant === "truck") {
    return (
      <svg viewBox="0 0 36 68" width={w} height={h} style={{ transform: flip }} className={`drop-shadow-lg ${motionCls}`}>
        <defs>
          <filter id={hlFilter} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id={`truck-body-${color}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={darken(color)} />
            <stop offset="40%" stopColor={color} />
            <stop offset="100%" stopColor={darken(color, 0.2)} />
          </linearGradient>
        </defs>
        <CarShadow w={36} h={68} />
        <path d="M8 6 H28 Q32 6 32 10 V34 Q32 38 28 38 H8 Q4 38 4 34 V10 Q4 6 8 6 Z" fill={`url(#truck-body-${color})`} />
        <rect x="8" y="10" width="20" height="12" rx="2" fill="#1a2030" opacity="0.55" />
        <rect x="10" y="12" width="8" height="7" rx="1" fill="#fff" opacity="0.1" />
        <path d="M4 38 H32 Q34 38 34 42 V50 Q34 54 30 54 H6 Q2 54 2 50 V42 Q2 38 4 38 Z" fill={darken(color, 0.1)} />
        <rect x="2" y="52" width="32" height="7" rx="2" fill="#2d3748" />
        <rect x="30" y="42" width="3" height="5" rx="1" fill="#CBD5E0" opacity="0.7" />
        <rect x="3" y="42" width="3" height="5" rx="1" fill="#CBD5E0" opacity="0.7" />
        <CarWheels cy={60} wheelCls={wheelCls} />
        <CarLights direction={direction} variant="truck" filterId={hlFilter} />
      </svg>
    );
  }

  if (variant === "suv") {
    return (
      <svg viewBox="0 0 36 64" width={w} height={h} style={{ transform: flip }} className={`drop-shadow-lg ${motionCls}`}>
        <defs>
          <filter id={hlFilter} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id={`suv-body-${color}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={darken(color)} />
            <stop offset="45%" stopColor={color} />
            <stop offset="100%" stopColor={darken(color, 0.18)} />
          </linearGradient>
          <linearGradient id={`suv-glass-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3d4f6a" />
            <stop offset="100%" stopColor="#1a2438" />
          </linearGradient>
        </defs>
        <CarShadow w={36} h={64} />
        <path d="M6 14 Q6 8 12 8 H24 Q30 8 30 14 V42 Q30 48 24 48 H12 Q6 48 6 42 Z" fill={`url(#suv-body-${color})`} />
        <path d="M10 14 H26 Q28 14 28 18 V26 H8 V18 Q8 14 10 14 Z" fill={`url(#suv-glass-${color})`} opacity="0.85" />
        <rect x="11" y="16" width="6" height="5" rx="1" fill="#fff" opacity="0.12" />
        <rect x="5" y="46" width="26" height="6" rx="2" fill="#2d3748" />
        <rect x="29" y="28" width="2.5" height="4" rx="0.5" fill="#CBD5E0" />
        <rect x="4.5" y="28" width="2.5" height="4" rx="0.5" fill="#CBD5E0" />
        <ellipse cx="18" cy="12" rx="8" ry="2" fill="#fff" opacity="0.08" />
        <CarWheels cy={54} wheelCls={wheelCls} />
        <CarLights direction={direction} variant="suv" filterId={hlFilter} />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 36 64" width={w} height={h} style={{ transform: flip }} className={`drop-shadow-lg ${motionCls}`}>
      <defs>
        <filter id={hlFilter} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id={`sedan-body-${color}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={darken(color, 0.12)} />
          <stop offset="35%" stopColor={color} />
          <stop offset="100%" stopColor={darken(color, 0.22)} />
        </linearGradient>
        <linearGradient id={`sedan-glass-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#445570" />
          <stop offset="100%" stopColor="#1a2438" />
        </linearGradient>
      </defs>
      <CarShadow w={36} h={64} />
      <path d="M8 12 Q8 6 14 6 H22 Q28 6 28 12 V40 Q28 46 22 46 H14 Q8 46 8 40 Z" fill={`url(#sedan-body-${color})`} />
      <path d="M11 12 H25 Q27 12 27 16 V24 H9 V16 Q9 12 11 12 Z" fill={`url(#sedan-glass-${color})`} opacity="0.88" />
      <rect x="12" y="14" width="5" height="5" rx="1" fill="#fff" opacity="0.14" />
      <path d="M9 40 H27" stroke="#000" opacity="0.1" strokeWidth="0.8" />
      <rect x="7" y="42" width="22" height="6" rx="2" fill="#2d3748" />
      <rect x="27.5" y="24" width="2" height="3.5" rx="0.5" fill="#CBD5E0" opacity="0.8" />
      <rect x="6.5" y="24" width="2" height="3.5" rx="0.5" fill="#CBD5E0" opacity="0.8" />
      <ellipse cx="18" cy="10" rx="7" ry="1.8" fill="#fff" opacity="0.1" />
      <rect x="12" y="44" width="12" height="2" rx="0.5" fill="#1a202c" opacity="0.5" />
      <CarWheels cy={52} wheelCls={wheelCls} />
      <CarLights direction={direction} variant="sedan" filterId={hlFilter} />
    </svg>
  );
}

/** Stake-style construction barrier — pops on near-miss */
export function BarrierSprite({ size = 48 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 40" width={size} height={size * 0.83} className="cr-barrier-pop drop-shadow-lg">
      <rect x="4" y="8" width="40" height="24" rx="2" fill="#2563EB" stroke="#1D4ED8" strokeWidth="1" />
      {[0, 1, 2, 3].map(i => (
        <rect key={i} x={6 + i * 10} y="10" width="8" height="20" fill={i % 2 === 0 ? "#fff" : "#2563EB"} />
      ))}
      <rect x="2" y="30" width="6" height="8" fill="#4A5568" />
      <rect x="40" y="30" width="6" height="8" fill="#4A5568" />
    </svg>
  );
}

/** City sewer grate with multiplier — fire glow underneath when active */
export function ManholeCover({
  multiplier,
  state,
  showAmbientFire = true,
  tappable = false,
  onTap,
}: {
  multiplier: number;
  state: "idle" | "past" | "current" | "future" | "bust";
  /** Stake-style: manholes always glow with ember even before you cross */
  showAmbientFire?: boolean;
  tappable?: boolean;
  onTap?: () => void;
}) {
  const lit = state === "past" || state === "current";
  const isCurrent = state === "current";
  const showEmber = showAmbientFire && (state === "idle" || state === "future" || lit);

  return (
    <button
      type="button"
      disabled={!tappable}
      onClick={tappable ? onTap : undefined}
      className={`relative flex flex-col items-center bg-transparent border-0 p-0 ${
        tappable ? "cr-manhole-tap-target cursor-pointer" : "pointer-events-none"
      }`}
      aria-label={tappable ? `Cross lane for ${multiplier.toFixed(2)}×` : undefined}
    >
      {tappable && (
        <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[7px] font-black uppercase tracking-wider text-blue-300 cr-manhole-tap-hint whitespace-nowrap pointer-events-none">
          Tap
        </span>
      )}
      {showEmber && (
        <div className={`absolute -top-3 left-1/2 -translate-x-1/2 rounded-full blur-md ${
          isCurrent
            ? "cr-manhole-fire cr-fire-intense w-16 h-10"
            : lit
              ? "cr-manhole-fire w-14 h-8 opacity-80"
              : "cr-manhole-ember w-12 h-6"
        }`} />
      )}
      {isCurrent && (
        <div className="cr-manhole-sparks absolute -top-1 left-1/2 -translate-x-1/2 w-10 h-6 pointer-events-none" />
      )}
      <div className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center z-10 ${
        state === "bust" ? "bg-red-900/80 border-2 border-red-400" :
        isCurrent ? "bg-[#1e3a5f] border-2 border-blue-400 shadow-lg shadow-blue-500/40 scale-110" :
        lit ? "bg-[#2d3748] border-2 border-blue-500/60" :
        "bg-[#252a35] border-2 border-white/15"
      }`}>
        <svg viewBox="0 0 48 48" className="absolute inset-0 w-full h-full rounded-full opacity-95">
          <circle cx="24" cy="24" r="22" fill="#3d4858" stroke="#2a3140" strokeWidth="1.5" />
          <circle cx="24" cy="24" r="17" fill="none" stroke="#1a1f28" strokeWidth="2" />
          {/* Stake-style III grate bars */}
          <rect x="14" y="10" width="4" height="28" rx="1" fill="#1a1f28" />
          <rect x="22" y="10" width="4" height="28" rx="1" fill="#1a1f28" />
          <rect x="30" y="10" width="4" height="28" rx="1" fill="#1a1f28" />
          <circle cx="24" cy="24" r="3" fill="#151920" />
        </svg>
        <span className={`relative z-10 font-mono font-black text-[9px] sm:text-[10px] ${
          lit ? "text-white" : "text-white/50"
        }`}>
          {multiplier.toFixed(2)}×
        </span>
      </div>
    </button>
  );
}

export function TrafficLight({ active }: { active: "red" | "yellow" | "green" }) {
  return (
    <svg viewBox="0 0 28 72" width={22} height={58}>
      <rect x="8" y="4" width="12" height="56" rx="4" fill="#2D3748" stroke="#4A5568" />
      <circle cx="14" cy="16" r="5" fill={active === "red" ? "#FC8181" : "#3D1A1A"} className={active === "red" ? "cr-light-glow-red" : ""} />
      <circle cx="14" cy="34" r="5" fill={active === "yellow" ? "#F6E05E" : "#3D3D1A"} className={active === "yellow" ? "cr-light-glow-yellow" : ""} />
      <circle cx="14" cy="52" r="5" fill={active === "green" ? "#68D391" : "#1A3D2A"} className={active === "green" ? "cr-light-glow-green" : ""} />
      <rect x="12" y="60" width="4" height="8" fill="#4A5568" />
    </svg>
  );
}

export function getCarColor(lane: number) {
  return CAR_PALETTE[lane % CAR_PALETTE.length];
}
