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
        <radialGradient id="cf-bg" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#3d2a00"/><stop offset="100%" stopColor="#1a1000"/></radialGradient>
        <radialGradient id="cf-coin" cx="38%" cy="32%" r="60%"><stop offset="0%" stopColor="#FFE566"/><stop offset="50%" stopColor="#FFB800"/><stop offset="100%" stopColor="#CC8800"/></radialGradient>
      </defs>
      <rect width="320" height="200" fill="url(#cf-bg)"/>
      <circle cx="160" cy="100" r="90" fill="#FFB800" opacity="0.08"/>
      <ellipse cx="160" cy="100" rx="75" ry="75" fill="url(#cf-coin)" stroke="#FFE566" strokeWidth="3"/>
      <ellipse cx="160" cy="100" rx="62" ry="62" fill="none" stroke="#FFE566" strokeWidth="1.5" strokeDasharray="8 4"/>
      <text x="160" y="120" textAnchor="middle" fontFamily="serif" fontWeight="900" fontSize="60" fill="#7A4800">H</text>
      {[[50,40],[270,60],[80,165],[240,145],[295,90]].map(([x,y],i)=>(
        <g key={i} transform={`translate(${x},${y})`}>
          <line x1="-7" y1="0" x2="7" y2="0" stroke="#FFD700" strokeWidth="2"/>
          <line x1="0" y1="-7" x2="0" y2="7" stroke="#FFD700" strokeWidth="2"/>
        </g>
      ))}
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
  const redNums = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  const segments = 37;
  const r = 80, cx = 160, cy = 100;
  const paths = Array.from({length:segments},(_,i)=>{
    const s = (i/segments)*2*Math.PI - Math.PI/2, e = ((i+1)/segments)*2*Math.PI - Math.PI/2;
    const x1=cx+r*Math.cos(s),y1=cy+r*Math.sin(s),x2=cx+r*Math.cos(e),y2=cy+r*Math.sin(e);
    const fill = i===0 ? "#006600" : redNums.has(i) ? "#CC1111" : "#1a1a1a";
    return <path key={i} d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2} Z`} fill={fill} stroke="#333" strokeWidth="0.5"/>;
  });
  return (
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="320" height="200" fill="#0a0a0a"/>
      <circle cx={cx} cy={cy} r="95" fill="#1a0a00" stroke="#CC8800" strokeWidth="3.5"/>
      {paths}
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

function CoverPlinko() {
  const COLORS = ["#FF2244","#FF6622","#FFB800","#FFE566","#FFFFFF","#FFE566","#FFB800","#FF6622","#FF2244"];
  const MULTS  = ["10x","3x","2x","1.5x","1x","1.5x","2x","3x","10x"];
  const pegs: {x:number;y:number}[] = [];
  for (let r=0;r<7;r++){const n=9-r,sx=160-(n-1)*18;for(let c=0;c<n;c++)pegs.push({x:sx+c*36,y:24+r*24});}
  return (
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs><linearGradient id="pk-bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#1a0a00"/><stop offset="100%" stopColor="#0d0500"/></linearGradient></defs>
      <rect width="320" height="200" fill="url(#pk-bg)"/>
      {pegs.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="4.5" fill="#FF8C00" opacity="0.85"/>)}
      <circle cx="194" cy="78" r="8" fill="white" stroke="#FFD700" strokeWidth="2"/>
      {COLORS.map((c,i)=>(
        <g key={i}>
          <rect x={14+i*33} y="166" width="28" height="24" rx="4" fill={c} opacity="0.9"/>
          <text x={14+i*33+14} y="182" textAnchor="middle" fontSize="7.5" fontWeight="900" fill="#000">{MULTS[i]}</text>
        </g>
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
  "plinko":      () => <CoverPlinko />,
  "hilo":        () => <CoverHiLo />,
  "hi-lo":       () => <CoverHiLo />,
  "keno":        () => <CoverKeno />,
  "race":        () => <CoverRace />,
};

export function GameCard({ game }: { game: Game }) {
  const Cover = COVER_MAP[game.slug] ?? CoverDefault;
  return (
    <Link href={`/games/${game.id}`}>
      <Card className="group relative overflow-hidden bg-card border-border/50 hover:border-primary/60 transition-all duration-300 cursor-pointer flex flex-col card-hover-glow">
        <div className="aspect-[16/9] relative overflow-hidden bg-secondary">
          <Cover slug={game.slug} />
          <div className="absolute inset-0 bg-gradient-to-t from-card/80 via-transparent to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 bg-black/30">
            <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center shadow-[0_0_24px_var(--theme-glow-strong)] scale-75 group-hover:scale-100 transition-transform duration-200">
              <Play className="w-6 h-6 ml-0.5 text-primary-foreground" fill="currentColor" />
            </div>
          </div>
          <div className="absolute top-2 left-2">
            <span className="flex items-center gap-1 bg-black/70 backdrop-blur-sm rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-green-400 border border-green-500/30">
              <span className="live-dot w-1.5 h-1.5 rounded-full bg-green-400" />Live
            </span>
          </div>
          {game.houseEdge != null && (
            <div className="absolute top-2 right-2">
              <span className="bg-black/70 backdrop-blur-sm rounded-full px-2 py-0.5 text-xs font-mono text-muted-foreground border border-border/40">
                {game.houseEdge}%
              </span>
            </div>
          )}
        </div>
        <div className="p-4 flex flex-col gap-2">
          <h3 className="font-display font-bold text-lg text-foreground group-hover:text-primary transition-colors uppercase tracking-wide">{game.name}</h3>
          <p className="text-xs text-muted-foreground line-clamp-1">{game.description}</p>
          <div className="flex items-center justify-between text-xs font-mono text-muted-foreground pt-2 border-t border-border/40">
            <span>Min <span className="text-foreground font-bold">{formatCurrency(game.minBet)}</span></span>
            <span>Max <span className="text-foreground font-bold">{formatCurrency(game.maxBet)}</span></span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
