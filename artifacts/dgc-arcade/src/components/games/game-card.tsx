import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { Play } from "lucide-react";

interface Game {
  id: number;
  slug: string;
  name: string;
  description: string;
  imageUrl?: string | null;
  minBet: number;
  maxBet: number;
  houseEdge?: number | null;
  active: boolean;
}

// ─── Illustrated SVG Game Covers ─────────────────────────────────────────────

function CoverCoinflip() {
  return (
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs>
        {/* Cosmic background gradient */}
        <radialGradient id="cf-cosmic" cx="50%" cy="40%" r="80%">
          <stop offset="0%" stopColor="#2a1a3d" />
          <stop offset="50%" stopColor="#1a0a2d" />
          <stop offset="100%" stopColor="#0a0015" />
        </radialGradient>
        {/* Coin metallic gradient */}
        <radialGradient id="cf-coin-metal" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#FFE566" />
          <stop offset="25%" stopColor="#FFD700" />
          <stop offset="60%" stopColor="#FFA500" />
          <stop offset="100%" stopColor="#CC8800" />
        </radialGradient>
        {/* Glow filter */}
        <filter id="cf-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background */}
      <rect width="320" height="200" fill="url(#cf-cosmic)" />

      {/* Cosmic nebula glow effect */}
      <ellipse cx="160" cy="80" rx="140" ry="100" fill="#E91E63" opacity="0.08" filter="url(#cf-glow)" />
      <ellipse cx="160" cy="90" rx="120" ry="80" fill="#FF1493" opacity="0.05" />

      {/* Star particles */}
      {[
        [30, 20, 0.6],
        [290, 30, 0.8],
        [50, 160, 0.5],
        [280, 150, 0.7],
        [160, 10, 0.4],
        [20, 100, 0.5],
        [300, 80, 0.6],
      ].map(([x, y, op], i) => (
        <circle key={i} cx={x} cy={y} r="1.5" fill="white" opacity={op} />
      ))}

      {/* Coin shadow/glow behind */}
      <ellipse cx="160" cy="105" rx="95" ry="95" fill="#E91E63" opacity="0.12" filter="url(#cf-glow)" />
      <ellipse cx="160" cy="100" rx="92" ry="92" fill="#FF69B4" opacity="0.08" />

      {/* Main coin */}
      <circle cx="160" cy="100" r="85" fill="url(#cf-coin-metal)" stroke="#FFE566" strokeWidth="2.5" filter="url(#cf-glow)" />

      {/* Coin rim detail */}
      <circle cx="160" cy="100" r="85" fill="none" stroke="#FFB800" strokeWidth="1.5" opacity="0.6" />
      <circle cx="160" cy="100" r="78" fill="none" stroke="#FFE566" strokeWidth="0.8" opacity="0.4" />

      {/* Inner coin detail circle */}
      <circle cx="160" cy="100" r="70" fill="none" stroke="#FFD700" strokeWidth="1" opacity="0.3" />

      {/* DGC text on coin */}
      <text
        x="160"
        y="108"
        textAnchor="middle"
        fontFamily="'Outfit', Arial, sans-serif"
        fontSize="48"
        fontWeight="900"
        fill="#8B6914"
        opacity="0.9"
        letterSpacing="2"
      >
        DGC
      </text>

      {/* Arcade text */}
      <text
        x="160"
        y="128"
        textAnchor="middle"
        fontFamily="'Outfit', Arial, sans-serif"
        fontSize="10"
        fontWeight="700"
        fill="#8B6914"
        opacity="0.7"
        letterSpacing="1.5"
      >
        ARCADE
      </text>

      {/* Coin shine highlight */}
      <ellipse cx="140" cy="85" rx="18" ry="22" fill="white" opacity="0.25" />
      <ellipse cx="145" cy="82" rx="8" ry="12" fill="white" opacity="0.4" />

      {/* Title text */}
      <text
        x="160"
        y="175"
        textAnchor="middle"
        fontFamily="'Outfit', Arial, sans-serif"
        fontSize="16"
        fontWeight="900"
        fill="white"
        letterSpacing="2"
      >
        COIN FLIP
      </text>

      {/* Subtitle */}
      <text
        x="160"
        y="192"
        textAnchor="middle"
        fontFamily="monospace"
        fontSize="8"
        fill="#FFD700"
        opacity="0.85"
        letterSpacing="1"
      >
        50/50 · PAYS 2 TO 1
      </text>
    </svg>
  );
}

function CoverDice() {
  return (
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs><linearGradient id="d-bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#1a0a3d"/><stop offset="100%" stopColor="#0d0020"/></linearGradient></defs>
      <rect width="320" height="200" fill="url(#d-bg)"/>
      <circle cx="160" cy="100" r="100" fill="#6B21FF" opacity="0.1"/>
      <g transform="translate(62,48) rotate(-15,50,52)">
        <rect width="96" height="96" rx="16" fill="#4B21D9" stroke="#7B4FFF" strokeWidth="2.5"/>
        {[[20,20],[48,48],[76,76],[76,20],[20,76],[20,48],[76,48]].map(([cx,cy],i)=><circle key={i} cx={cx} cy={cy} r="8" fill="#E2D4FF"/>)}
      </g>
      <g transform="translate(165,62) rotate(12,50,45)">
        <rect width="90" height="90" rx="14" fill="#3A11CC" stroke="#8B6FFF" strokeWidth="2"/>
        {[[24,24],[66,66],[24,66],[66,24],[45,45]].map(([cx,cy],i)=><circle key={i} cx={cx} cy={cy} r="7.5" fill="#C8B8FF"/>)}
      </g>
    </svg>
  );
}

function CoverCrash() {
  return (
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs>
        <linearGradient id="cr-bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#001a0d"/><stop offset="100%" stopColor="#000d08"/></linearGradient>
        <linearGradient id="cr-trail" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#00FF87" stopOpacity="0"/><stop offset="100%" stopColor="#00FF87" stopOpacity="0.9"/></linearGradient>
      </defs>
      <rect width="320" height="200" fill="url(#cr-bg)"/>
      {[40,80,120,160].map(y=><line key={y} x1="0" y1={y} x2="320" y2={y} stroke="#00FF87" strokeWidth="0.3" strokeOpacity="0.15"/>)}
      <polyline points="20,185 90,165 155,125 225,65 280,22" fill="none" stroke="url(#cr-trail)" strokeWidth="3.5" strokeLinecap="round"/>
      <g transform="translate(258,6) rotate(-38)">
        <ellipse cx="11" cy="24" rx="11" ry="24" fill="#00FF87"/>
        <polygon points="11,0 2,12 20,12" fill="#00CC66"/>
        <rect x="3" y="42" width="16" height="7" rx="3" fill="#FF4444"/>
        <circle cx="11" cy="24" r="5" fill="#001a0d"/>
      </g>
      <text x="28" y="52" fontFamily="monospace" fontWeight="900" fontSize="30" fill="#00FF87">2.47x</text>
      <text x="28" y="70" fontFamily="monospace" fontSize="9" fill="#00FF87" opacity="0.6">CRASH IN PROGRESS</text>
    </svg>
  );
}

function CoverSlots() {
  return (
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs><linearGradient id="sl-bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#160028"/><stop offset="100%" stopColor="#0a0018"/></linearGradient></defs>
      <rect width="320" height="200" fill="url(#sl-bg)"/>
      <rect x="50" y="25" width="220" height="150" rx="20" fill="#1a0540" stroke="#CC00FF" strokeWidth="2.5"/>
      <rect x="70" y="50" width="180" height="88" rx="10" fill="#0a0020" stroke="#AA00FF" strokeWidth="2"/>
      <line x1="130" y1="50" x2="130" y2="138" stroke="#AA00FF" strokeWidth="1.5"/>
      <line x1="190" y1="50" x2="190" y2="138" stroke="#AA00FF" strokeWidth="1.5"/>
      <text x="100" y="108" textAnchor="middle" fontSize="38" fontWeight="900" fill="#FFD700">7</text>
      <text x="160" y="108" textAnchor="middle" fontSize="38" fontWeight="900" fill="#FF4466">7</text>
      <text x="220" y="108" textAnchor="middle" fontSize="38" fontWeight="900" fill="#FFD700">7</text>
      <line x1="70" y1="94" x2="250" y2="94" stroke="#FFFF00" strokeWidth="2" strokeDasharray="5 3" opacity="0.7"/>
      <rect x="258" y="58" width="14" height="52" rx="7" fill="#FF00FF" opacity="0.7"/>
      <circle cx="265" cy="56" r="10" fill="#FF66FF"/>
      <rect x="130" y="150" width="60" height="10" rx="5" fill="#AA00FF"/>
    </svg>
  );
}

function CoverRoulette() {
  const ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
  const RED_NUMS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  const segments = 37;
  const r = 80, cx = 160, cy = 100;
  const paths = ORDER.map((num, i) => {
    const s = (i/segments)*2*Math.PI - Math.PI/2, e = ((i+1)/segments)*2*Math.PI - Math.PI/2;
    const x1=cx+r*Math.cos(s),y1=cy+r*Math.sin(s),x2=cx+r*Math.cos(e),y2=cy+r*Math.sin(e);
    const fill = num === 0 ? "#00AA44" : RED_NUMS.has(num) ? "#CC1111" : "#1a1a1a";
    return <path key={i} d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2} Z`} fill={fill} stroke="#333" strokeWidth="0.5"/>;
  });
  return (
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="320" height="200" fill="#0a0a0a"/>
      <circle cx={cx} cy={cy} r="95" fill="#1a0a00" stroke="#CC8800" strokeWidth="3.5"/>
      <g className="animate-[spin_10s_linear_infinite]" style={{ transformOrigin: `${cx}px ${cy}px` }}>
        {paths}
      </g>
      <circle cx={cx} cy={cy} r="26" fill="#CC8800" stroke="#FFD700" strokeWidth="2.5"/>
      <circle cx={cx} cy={cy} r="11" fill="#111"/>
      <circle cx={cx+56} cy={cy-32} r="7" fill="white" stroke="#ccc" strokeWidth="1.5"/>
    </svg>
  );
}

function CoverMines() {
  const mineIdx = [2,7,13,17];
  const gemIdx  = [0,4,5,9,10,15,19];
  return (
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs><linearGradient id="mn-bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#0d0020"/><stop offset="100%" stopColor="#000a1a"/></linearGradient></defs>
      <rect width="320" height="200" fill="url(#mn-bg)"/>
      {Array.from({length:20},(_,i)=>{
        const col=i%5, row=Math.floor(i/5);
        const x=42+col*50, y=28+row*40;
        const mine=mineIdx.includes(i), gem=gemIdx.includes(i);
        return (
          <g key={i}>
            <rect x={x} y={y} width="40" height="30" rx="6"
              fill={mine?"#3d0000":gem?"#001a1a":"#0d0020"}
              stroke={mine?"#FF2222":gem?"#00FFCC":"#1a1040"} strokeWidth="1.5"/>
            {mine&&<text x={x+20} y={y+22} textAnchor="middle" fontSize="18">💣</text>}
            {gem&&<text x={x+20} y={y+22} textAnchor="middle" fontSize="18">💎</text>}
            {!mine&&!gem&&<text x={x+20} y={y+20} textAnchor="middle" fontSize="13" fill="#334">?</text>}
          </g>
        );
      })}
    </svg>
  );
}

function CoverBlackjack() {
  return (
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs><linearGradient id="bj-bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#002211"/><stop offset="100%" stopColor="#000f08"/></linearGradient></defs>
      <rect width="320" height="200" fill="url(#bj-bg)"/>
      <ellipse cx="160" cy="100" rx="135" ry="82" fill="#003318" stroke="#004422" strokeWidth="2"/>
      <g transform="rotate(-18,160,100)">
        <rect x="72" y="28" width="85" height="126" rx="9" fill="white" stroke="#ccc" strokeWidth="1.5"/>
        <text x="85" y="62" fontSize="30" fontWeight="900" fill="#111">A</text>
        <text x="86" y="85" fontSize="22" fill="#111">♠</text>
        <g transform="rotate(180,114,130)"><text x="85" y="62" fontSize="30" fontWeight="900" fill="#111">A</text></g>
      </g>
      <g transform="rotate(14,160,100)">
        <rect x="160" y="38" width="85" height="126" rx="9" fill="white" stroke="#ccc" strokeWidth="1.5"/>
        <text x="173" y="72" fontSize="30" fontWeight="900" fill="#CC1111">K</text>
        <text x="174" y="95" fontSize="22" fill="#CC1111">♥</text>
        <g transform="rotate(180,202,138)"><text x="173" y="72" fontSize="30" fontWeight="900" fill="#CC1111">K</text></g>
      </g>
    </svg>
  );
}

function CoverChickenRoad() {
  const laneColors = ["#0a1a0a","#0d1f0d","#0a1a0a","#0d1f0d","#0a1a0a","#0d1f0d","#0a1a0a","#0d1f0d","#0a1a0a","#0d1f0d"];
  const carPositions = [{lane:1,tile:2},{lane:3,tile:0},{lane:5,tile:3},{lane:7,tile:1},{lane:9,tile:4}];
  const LANE_H = 16;
  const TILE_W = 28;
  return (
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs>
        <linearGradient id="cr2-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#050f05"/>
          <stop offset="100%" stopColor="#010801"/>
        </linearGradient>
        <radialGradient id="cr2-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00FF44" stopOpacity="0.18"/>
          <stop offset="100%" stopColor="#00FF44" stopOpacity="0"/>
        </radialGradient>
        <filter id="cr2-blur">
          <feGaussianBlur stdDeviation="2.5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      <rect width="320" height="200" fill="url(#cr2-bg)"/>
      <ellipse cx="160" cy="100" rx="160" ry="100" fill="url(#cr2-glow)"/>

      {/* Road grid — 10 lanes × 5 tiles */}
      {laneColors.map((fill, lane) => {
        const y = 12 + lane * (LANE_H + 2);
        return (
          <g key={lane}>
            <rect x="30" y={y} width={5 * TILE_W + 4} height={LANE_H} rx="3" fill={fill} stroke="#1a3a1a" strokeWidth="0.8"/>
            {[0,1,2,3,4].map(tile => (
              <rect key={tile} x={32 + tile * (TILE_W + 1)} y={y+1} width={TILE_W-2} height={LANE_H-2} rx="2"
                fill="none" stroke="#1f3f1f" strokeWidth="0.5"/>
            ))}
          </g>
        );
      })}

      {/* Cars (hazards) */}
      {carPositions.map((pos, i) => {
        const y = 12 + pos.lane * (LANE_H + 2) + 2;
        const x = 32 + pos.tile * (TILE_W + 1);
        return (
          <g key={i} filter="url(#cr2-blur)">
            <rect x={x+1} y={y+1} width={TILE_W-4} height={LANE_H-5} rx="3" fill="#FF2222" opacity="0.95"/>
            <rect x={x+4} y={y+2} width={TILE_W-10} height={4} rx="1" fill="#FF6666" opacity="0.7"/>
            <circle cx={x+4} cy={y+LANE_H-6} r="2" fill="#333"/>
            <circle cx={x+TILE_W-7} cy={y+LANE_H-6} r="2" fill="#333"/>
          </g>
        );
      })}

      {/* Chicken — in lane 4, tile 1 (safe spot) */}
      {(() => {
        const cx2 = 32 + 1 * (TILE_W + 1) + (TILE_W-2)/2;
        const cy2 = 12 + 4 * (LANE_H + 2) + LANE_H/2;
        return (
          <g filter="url(#cr2-blur)">
            <ellipse cx={cx2} cy={cy2+1} rx="6" ry="5" fill="#FFD700"/>
            <circle cx={cx2} cy={cy2-3} r="4" fill="#FFD700"/>
            <polygon points={`${cx2+4},${cy2-4} ${cx2+8},${cy2-5} ${cx2+7},${cy2-2}`} fill="#FF8800"/>
            <circle cx={cx2+1} cy={cy2-4} r="1" fill="#1a1a1a"/>
            <text x={cx2} y={cy2+14} textAnchor="middle" fontSize="7" fill="#00FF44" fontWeight="900" letterSpacing="0.5">SAFE</text>
          </g>
        );
      })()}

      {/* Safe zone marker */}
      <rect x="175" y="12" width="28" height={10*(LANE_H+2)-2} rx="3" fill="#00FF44" opacity="0.06" stroke="#00FF44" strokeWidth="0.8" strokeDasharray="3 3"/>
      <text x="189" y="9" textAnchor="middle" fontSize="6" fill="#00FF44" opacity="0.7" letterSpacing="1">GOAL</text>

      {/* Multiplier labels on right */}
      {["1.2x","1.6x","2.1x","2.8x","3.8x","5.2x","7x","10x","14x","20x"].map((m, i) => (
        <text key={i} x="215" y={12 + i*(LANE_H+2) + LANE_H/2 + 4}
          fontSize="8" fontWeight="900" fill={i < 3 ? "#00CC44" : i < 6 ? "#FFB800" : "#FF4444"}
          fontFamily="monospace">{m}</text>
      ))}

      {/* Title */}
      <text x="264" y="90" textAnchor="middle" fontSize="11" fontWeight="900" fill="white" letterSpacing="1"
        transform="rotate(-90 264 90)">CHICKEN ROAD</text>

      {/* Difficulty tags */}
      {[["EASY","#00CC44"],["MED","#FFB800"],["HARD","#FF6622"],["XTREME","#FF2222"]].map(([label,color],i)=>(
        <rect key={i} x={30+i*37} y="186" width="32" height="10" rx="3" fill={color as string} opacity="0.85"/>
      ))}
      {[["EASY","#00CC44"],["MED","#FFB800"],["HARD","#FF6622"],["XTREME","#FF2222"]].map(([label,color],i)=>(
        <text key={i} x={30+i*37+16} y="194" textAnchor="middle" fontSize="6.5" fontWeight="900" fill="#000">{label}</text>
      ))}
    </svg>
  );
}

function CoverHiLo() {
  return (
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs><linearGradient id="hl-bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#001520"/><stop offset="100%" stopColor="#000a15"/></linearGradient></defs>
      <rect width="320" height="200" fill="url(#hl-bg)"/>
      <rect x="42" y="28" width="90" height="134" rx="11" fill="white" stroke="#ddd" strokeWidth="2"/>
      <text x="56" y="68" fontSize="34" fontWeight="900" fill="#1a1a1a">7</text>
      <text x="58" y="93" fontSize="26" fill="#CC4400">♦</text>
      <g transform="rotate(180,87,148)"><text x="56" y="68" fontSize="34" fontWeight="900" fill="#1a1a1a">7</text></g>
      <g transform="translate(160,100)">
        <circle cx="0" cy="0" r="22" fill="#00AAFF" opacity="0.15" stroke="#00AAFF" strokeWidth="2"/>
        <text x="0" y="7" textAnchor="middle" fontSize="22" fontWeight="900" fill="#00AAFF">?</text>
      </g>
      <rect x="192" y="28" width="90" height="134" rx="11" fill="#003355" stroke="#00AAFF" strokeWidth="2"/>
      {Array.from({length:30},(_,i)=><circle key={i} cx={204+(i%5)*17} cy={44+Math.floor(i/5)*18} r="3.5" fill="#00AAFF" opacity="0.35"/>)}
      <text x="108" y="120" textAnchor="middle" fontSize="30" fill="#00FF88">▲</text>
      <text x="108" y="154" textAnchor="middle" fontSize="30" fill="#FF4444">▼</text>
    </svg>
  );
}

function CoverKeno() {
  const selected = new Set([3,7,15,22,38,44,51,62,75,80]);
  const drawn = new Set([7,15,38,51,75]);
  return (
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs><radialGradient id="kn-bg" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#1a0030"/><stop offset="100%" stopColor="#0a0018"/></radialGradient></defs>
      <rect width="320" height="200" fill="url(#kn-bg)"/>
      {Array.from({length:80},(_,i)=>{
        const n=i+1,col=i%10,row=Math.floor(i/10),x=10+col*30,y=12+row*18;
        const sel=selected.has(n),drw=drawn.has(n);
        return (
          <g key={i}>
            <rect x={x} y={y} width="25" height="13" rx="3"
              fill={drw?"#9900EE":sel?"#5500AA":"#1a0030"}
              stroke={sel||drw?"#CC44FF":"#2a0050"} strokeWidth={sel?1.5:0.8}/>
            <text x={x+12} y={y+10} textAnchor="middle" fontSize="7.5" fontWeight={sel?"900":"400"} fill={sel?"#FFD700":"#888"}>{n}</text>
          </g>
        );
      })}
    </svg>
  );
}

function CoverDefault({ slug }: { slug: string }) {
  return (
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="320" height="200" fill="#0d1117"/>
      <text x="160" y="112" textAnchor="middle" fontFamily="sans-serif" fontWeight="900" fontSize="72" fill="#FFD700" opacity="0.4">
        {slug.charAt(0).toUpperCase()}
      </text>
    </svg>
  );
}

function CoverRace() {
  return (
    <svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs>
        <linearGradient id="race-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0f172a"/>
          <stop offset="100%" stopColor="#1e3a5f"/>
        </linearGradient>
        <linearGradient id="race-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#15803d"/>
          <stop offset="100%" stopColor="#166534"/>
        </linearGradient>
      </defs>
      <rect width="200" height="140" fill="url(#race-sky)"/>
      {/* Ground */}
      <rect x="0" y="95" width="200" height="45" fill="url(#race-ground)"/>
      {/* Track lanes */}
      <rect x="0" y="95" width="200" height="3" fill="#ca8a04" opacity="0.7"/>
      <rect x="0" y="105" width="200" height="1" fill="white" opacity="0.2" strokeDasharray="8,6"/>
      <rect x="0" y="115" width="200" height="1" fill="white" opacity="0.2"/>
      {/* Finish line */}
      <rect x="170" y="85" width="4" height="50" fill="white" opacity="0.9"/>
      {[0,1,2,3,4,5].map(i => (
        <rect key={i} x="170" y={85 + i*8} width="4" height="4"
          fill={i % 2 === 0 ? "#111" : "white"} opacity="0.9"/>
      ))}
      {/* Horse 1 - red, leading */}
      <g transform="translate(130,90)">
        <ellipse cx="12" cy="5" rx="14" ry="5" fill="#ef4444"/>
        <circle cx="24" cy="3" r="4" fill="#ef4444"/>
        <rect x="2" y="8" width="3" height="8" fill="#ef4444"/>
        <rect x="8" y="9" width="3" height="7" fill="#ef4444"/>
        <rect x="15" y="9" width="3" height="7" fill="#ef4444"/>
        <rect x="21" y="9" width="3" height="7" fill="#ef4444"/>
        <text x="12" y="3" textAnchor="middle" fontSize="6" fill="white" fontWeight="bold">1</text>
      </g>
      {/* Horse 2 - yellow, close second */}
      <g transform="translate(105,100)">
        <ellipse cx="12" cy="5" rx="14" ry="5" fill="#f59e0b"/>
        <circle cx="24" cy="3" r="4" fill="#f59e0b"/>
        <rect x="2" y="8" width="3" height="8" fill="#f59e0b"/>
        <rect x="8" y="9" width="3" height="7" fill="#f59e0b"/>
        <rect x="15" y="9" width="3" height="7" fill="#f59e0b"/>
        <rect x="21" y="9" width="3" height="7" fill="#f59e0b"/>
      </g>
      {/* Horse 3 - purple, third */}
      <g transform="translate(80,108)">
        <ellipse cx="12" cy="5" rx="14" ry="5" fill="#8b5cf6"/>
        <circle cx="24" cy="3" r="4" fill="#8b5cf6"/>
        <rect x="2" y="8" width="3" height="8" fill="#8b5cf6"/>
        <rect x="15" y="9" width="3" height="7" fill="#8b5cf6"/>
      </g>
      {/* Trophy */}
      <g transform="translate(150,55)">
        <rect x="8" y="0" width="14" height="14" rx="2" fill="#ca8a04" opacity="0.9"/>
        <text x="15" y="11" textAnchor="middle" fontSize="10">🏆</text>
      </g>
      {/* Stars */}
      {[[20,15],[60,8],[100,20],[140,10],[170,25]].map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r="1" fill="white" opacity={0.4 + i*0.1}/>
      ))}
      {/* 5.5x label */}
      <text x="100" y="75" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#fbbf24" opacity="0.95">5.5×</text>
    </svg>
  );
}

const COVER_MAP: Record<string, React.ComponentType<{ slug: string }>> = {
  "coinflip":    () => <CoverCoinflip />,
  "coin-flip":   () => <CoverCoinflip />,
  "dice":        () => <CoverDice />,
  "crash":       () => <CoverCrash />,
  "slots":       () => <CoverSlots />,
  "lucky-slots": () => <CoverSlots />,
  "roulette":    () => <CoverRoulette />,
  "mines":       () => <CoverMines />,
  "blackjack":   () => <CoverBlackjack />,
  "chicken-road": () => <CoverChickenRoad />,
  "hilo":        () => <CoverHiLo />,
  "hi-lo":       () => <CoverHiLo />,
  "keno":        () => <CoverKeno />,
  "race":        () => <CoverRace />,
};

export function GameCard({ game }: { game: Game }) {
  const Cover = COVER_MAP[game.slug] ?? CoverDefault;
  return (
    <Link href={`/games/${game.id}`}>
      <Card className="group relative overflow-hidden bg-card border-border/50 hover:border-primary/60 transition-all duration-300 cursor-pointer flex flex-col card-hover-glow h-full min-h-[160px] md:min-h-0">
        <div className="aspect-[16/9] relative overflow-hidden bg-secondary shrink-0">
          <Cover slug={game.slug} />
          <div className="absolute inset-0 bg-gradient-to-t from-card/90 via-transparent to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 bg-black/30 pointer-events-none">
            <div className="w-10 h-10 md:w-14 md:h-14 rounded-full bg-primary flex items-center justify-center shadow-[0_0_24px_var(--theme-glow-strong)] scale-75 group-hover:scale-100 transition-transform duration-200">
              <Play className="w-4 h-4 md:w-6 md:h-6 ml-0.5 text-primary-foreground" fill="currentColor" />
            </div>
          </div>
          <div className="absolute top-1 left-1 md:top-2 md:left-2">
            <span className="flex items-center gap-1 bg-black/70 backdrop-blur-sm rounded-full px-1.5 py-0.5 text-[8px] md:text-xs font-bold uppercase tracking-wider text-green-400 border border-green-500/30">
              <span className="live-dot w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-green-400" />Live
            </span>
          </div>
          {game.houseEdge != null && (
            <div className="absolute top-1 right-1 md:top-2 md:right-2">
              <span className="bg-black/70 backdrop-blur-sm rounded-full px-1.5 py-0.5 text-[8px] md:text-xs font-mono text-muted-foreground border border-border/40">
                {game.houseEdge}%
              </span>
            </div>
          )}
        </div>
        <div className="p-2 md:p-4 flex flex-col gap-1 md:gap-2 flex-1 min-h-0">
          <h3 className="font-display font-bold text-sm md:text-lg text-foreground group-hover:text-primary transition-colors uppercase tracking-wide line-clamp-1 shrink-0">{game.name}</h3>
          <p className="text-[10px] md:text-xs text-muted-foreground line-clamp-1 md:line-clamp-1 shrink-0">{game.description}</p>
          <div className="flex items-center justify-between text-[9px] md:text-xs font-mono text-muted-foreground pt-1.5 md:pt-2 border-t border-border/40 mt-auto shrink-0">
            <span className="flex flex-col md:flex-row md:gap-1">
              <span className="opacity-50 md:opacity-100">Min</span>
              <span className="text-foreground font-bold">{formatCurrency(game.minBet)}</span>
            </span>
            <span className="flex flex-col md:flex-row md:gap-1 items-end md:items-start">
              <span className="opacity-50 md:opacity-100">Max</span>
              <span className="text-foreground font-bold">{formatCurrency(game.maxBet)}</span>
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
