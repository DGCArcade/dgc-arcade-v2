import { useEffect, useRef } from "react";
import { THEMES, getTheme, ThemeId } from "@/lib/theme";

const THEME_SCENES: Record<ThemeId, string[]> = {
  dgc:        ["saturn", "sun"],
  cyber:      ["neptune", "earth"],
  futuristic: ["galaxy", "neptune"],
  blood:      ["mars", "moon"],
  ocean:      ["ocean", "earth"],
};

const ALL_SCENES = ["earth","mars","saturn","sun","moon","neptune","galaxy","ocean"] as const;
type Scene = typeof ALL_SCENES[number];

const THEME_COLORS: Record<ThemeId, { shoot: string; nebula: string[]; bg1: string; bg2: string }> = {
  dgc:        { shoot: "45",  nebula: ["45","38","50"],   bg1:"#090810", bg2:"#04060e" },
  cyber:      { shoot: "120", nebula: ["120","140","160"],bg1:"#020d04", bg2:"#010803" },
  futuristic: { shoot: "275", nebula: ["265","285","310"],bg1:"#080512", bg2:"#040210" },
  blood:      { shoot: "0",   nebula: ["0","15","350"],   bg1:"#0d0202", bg2:"#080101" },
  ocean:      { shoot: "185", nebula: ["185","200","175"],bg1:"#020b0d", bg2:"#010709" },
};

function pickScene(themeId: ThemeId): Scene {
  const options = THEME_SCENES[themeId];
  return options[Math.floor(Math.random() * options.length)] as Scene;
}

export default function GalaxyBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    let themeId: ThemeId = getTheme();
    let scene: Scene = pickScene(themeId);
    let animId: number;
    let t = 0;

    // ── Resize ──────────────────────────────────────────────────
    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
      rebuildStars();
      rebuildNebulas();
    }

    // ── Stars ───────────────────────────────────────────────────
    let stars: any[] = [];
    function rebuildStars() {
      const W = canvas!.width, H = canvas!.height;
      stars = Array.from({ length: 420 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.6 + 0.2,
        baseAlpha: Math.random() * 0.65 + 0.25,
        speed: Math.random() * 0.022 + 0.004,
        offset: Math.random() * Math.PI * 2,
        color: Math.random() > 0.88
          ? `hsl(${Math.random() * 60 + 200},80%,92%)`
          : "#ffffff",
      }));
    }

    // ── Nebulas ─────────────────────────────────────────────────
    let nebulas: any[] = [];
    function rebuildNebulas() {
      const W = canvas!.width, H = canvas!.height;
      const hues = THEME_COLORS[themeId].nebula;
      nebulas = Array.from({ length: 7 }, (_, i) => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 260 + 120,
        hue: hues[i % hues.length],
        alpha: Math.random() * 0.045 + 0.012,
      }));
    }

    resize();
    window.addEventListener("resize", resize);

    // ── Shooting stars ──────────────────────────────────────────
    const shots: any[] = [];
    let shotTimer = 0;
    function spawnShot() {
      const angle = (Math.random() * 28 + 12) * (Math.PI / 180);
      const speed = Math.random() * 20 + 10;
      const hue = THEME_COLORS[themeId].shoot;
      shots.push({
        x: Math.random() * (canvas!.width * 0.75),
        y: Math.random() * (canvas!.height * 0.5),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: Math.random() * 60 + 40,
        width: Math.random() * 2.2 + 0.8,
        hue,
      });
    }

    // ── Theme observer ──────────────────────────────────────────
    const observer = new MutationObserver(() => {
      const html = document.documentElement;
      let found: ThemeId = "dgc";
      for (const t of THEMES) {
        if (html.classList.contains(`theme-${t.id}`)) { found = t.id; break; }
      }
      if (found !== themeId) {
        themeId = found;
        scene = pickScene(themeId);
        rebuildNebulas();
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    // ── Planet builder ──────────────────────────────────────────
    function getPlanet() {
      const W = canvas!.width, H = canvas!.height;
      const isMobile = W < 600;
      const baseSize = Math.min(W, H) * (isMobile ? 0.22 : 0.14);
      const px = W * (isMobile ? 0.72 : 0.78);
      const py = H * (isMobile ? 0.18 : 0.20);

      switch(scene) {
        case "earth": return {
          px, py, pr: baseSize,
          type: "earth",
          glow: "#2288ff", glowSize: 2.6,
          rings: false,
          moons: [{ dist: 1.75, size: 0.14, color: "#aaaaaa", speed: 0.007, name:"moon" }],
        };
        case "mars": return {
          px, py, pr: baseSize * 1.05,
          type: "mars",
          glow: "#ff4400", glowSize: 2.4,
          rings: false,
          moons: [
            { dist: 1.6, size: 0.09, color: "#888888", speed: 0.013, name:"phobos" },
            { dist: 2.1, size: 0.07, color: "#999999", speed: 0.007, name:"deimos" },
          ],
        };
        case "saturn": return {
          px, py, pr: baseSize * 1.1,
          type: "saturn",
          glow: "#ffdd88", glowSize: 3.0,
          rings: true,
          moons: [
            { dist: 3.0, size: 0.10, color: "#ccbbaa", speed: 0.005, name:"titan" },
            { dist: 3.6, size: 0.07, color: "#bbaaaa", speed: 0.003, name:"rhea" },
            { dist: 2.4, size: 0.07, color: "#ddccbb", speed: 0.008, name:"tethys" },
          ],
        };
        case "sun": return {
          px: W * (isMobile ? 0.80 : 0.84),
          py: H * (isMobile ? 0.16 : 0.14),
          pr: Math.min(W,H) * (isMobile ? 0.26 : 0.20),
          type: "sun",
          glow: "#ffaa00", glowSize: 4.2,
          rings: false,
          moons: [],
        };
        case "moon": return {
          px, py, pr: baseSize * 0.95,
          type: "moon",
          glow: "#cccccc", glowSize: 1.9,
          rings: false,
          moons: [],
        };
        case "neptune": return {
          px, py, pr: baseSize,
          type: "neptune",
          glow: "#4466ff", glowSize: 2.5,
          rings: true,
          moons: [{ dist: 1.9, size: 0.11, color: "#8899cc", speed: 0.008, name:"triton" }],
        };
        case "galaxy": return {
          px: W * 0.5, py: H * 0.42,
          pr: Math.min(W,H) * (isMobile ? 0.38 : 0.28),
          type: "galaxy",
          glow: "#aa44ff", glowSize: 2.0,
          rings: false,
          moons: [],
        };
        case "ocean": return {
          px, py, pr: baseSize,
          type: "ocean",
          glow: "#00ddff", glowSize: 2.6,
          rings: false,
          moons: [{ dist: 1.8, size: 0.12, color: "#88ccdd", speed: 0.006, name:"ice" }],
        };
      }
    }

    // ── Draw helpers ────────────────────────────────────────────
    function lighten(hex: string, amt: number): string {
      const n = parseInt(hex.replace("#",""),16);
      const r = Math.min(255,(n>>16)+amt);
      const g = Math.min(255,((n>>8)&0xff)+amt);
      const b = Math.min(255,(n&0xff)+amt);
      return `rgb(${r},${g},${b})`;
    }
    function darken(hex: string, amt: number): string {
      const n = parseInt(hex.replace("#",""),16);
      const r = Math.max(0,(n>>16)-amt);
      const g = Math.max(0,((n>>8)&0xff)-amt);
      const b = Math.max(0,(n&0xff)-amt);
      return `rgb(${r},${g},${b})`;
    }

    // ── Draw planet body by type ─────────────────────────────────
    function drawPlanetBody(p: any) {
      const { px, py, pr, type } = p;

      if (type === "galaxy") {
        // Spiral galaxy — no solid body, just arm sweeps
        for (let arm = 0; arm < 3; arm++) {
          for (let i = 0; i < 120; i++) {
            const frac = i / 120;
            const angle = frac * Math.PI * 3.5 + (arm * Math.PI * 2 / 3) + t * 0.001;
            const dist = frac * pr * 0.9;
            const spread = pr * 0.08 * frac;
            const ax = px + Math.cos(angle) * dist + (Math.random()-0.5)*spread;
            const ay = py + Math.sin(angle) * dist * 0.45 + (Math.random()-0.5)*spread*0.4;
            const alpha = (1-frac) * 0.6;
            const hue = 260 + frac * 40;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = `hsl(${hue},70%,${60+frac*20}%)`;
            ctx.beginPath();
            ctx.arc(ax, ay, Math.random()*2.2+0.3, 0, Math.PI*2);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
        // Core glow
        const cg = ctx.createRadialGradient(px,py,0,px,py,pr*0.18);
        cg.addColorStop(0,"rgba(255,240,200,0.9)");
        cg.addColorStop(0.4,"rgba(220,180,255,0.4)");
        cg.addColorStop(1,"transparent");
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(px,py,pr*0.18,0,Math.PI*2);
        ctx.fill();
        return;
      }

      if (type === "sun") {
        // Sun granulation texture
        const sg = ctx.createRadialGradient(px-pr*0.3,py-pr*0.3,0,px,py,pr);
        sg.addColorStop(0,"#fff8c0");
        sg.addColorStop(0.2,"#ffe680");
        sg.addColorStop(0.55,"#ffb700");
        sg.addColorStop(0.8,"#ff8800");
        sg.addColorStop(1,"#cc4400");
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(px,py,pr,0,Math.PI*2);
        ctx.fill();
        // Granulation dots
        ctx.save();
        ctx.beginPath();
        ctx.arc(px,py,pr,0,Math.PI*2);
        ctx.clip();
        for(let g=0;g<60;g++){
          const gx=px+(Math.random()-0.5)*pr*1.8;
          const gy=py+(Math.random()-0.5)*pr*1.8;
          const gr=Math.random()*pr*0.08+pr*0.02;
          const ga=0.07+Math.sin(t*0.04+g)*0.04;
          ctx.globalAlpha=ga;
          ctx.fillStyle="rgba(255,180,0,0.6)";
          ctx.beginPath();
          ctx.arc(gx,gy,gr,0,Math.PI*2);
          ctx.fill();
        }
        ctx.globalAlpha=1;
        ctx.restore();
        return;
      }

      if (type === "earth") {
        // Base ocean
        const eg = ctx.createRadialGradient(px-pr*0.35,py-pr*0.35,pr*0.05,px,py,pr);
        eg.addColorStop(0,"#4fc3f7");
        eg.addColorStop(0.3,"#1976d2");
        eg.addColorStop(0.65,"#0d47a1");
        eg.addColorStop(1,"#082a6e");
        ctx.fillStyle=eg;
        ctx.beginPath();
        ctx.arc(px,py,pr,0,Math.PI*2);
        ctx.fill();
        // Continents
        ctx.save();
        ctx.beginPath();
        ctx.arc(px,py,pr,0,Math.PI*2);
        ctx.clip();
        const spin=t*0.0018;
        const lands=[
          [0.1,-0.3,0.28,0.22,"#2e7d32"],
          [-0.35,0.0,0.22,0.32,"#388e3c"],
          [0.3,0.25,0.18,0.25,"#1b5e20"],
          [-0.1,0.35,0.30,0.16,"#33691e"],
          [0.05,-0.05,0.14,0.18,"#2e7d32"],
        ];
        lands.forEach(([lx,ly,lw,lh,lc])=>{
          const rx=px+(lx as number)*pr+Math.sin(spin)*pr*0.3;
          const ry=py+(ly as number)*pr;
          ctx.fillStyle=lc as string;
          ctx.globalAlpha=0.82;
          ctx.beginPath();
          ctx.ellipse(rx,ry,(lw as number)*pr,(lh as number)*pr,spin*0.5,0,Math.PI*2);
          ctx.fill();
        });
        // Ice caps
        ctx.globalAlpha=0.6;
        ctx.fillStyle="#e0f7fa";
        ctx.beginPath();
        ctx.ellipse(px,py-pr*0.88,pr*0.35,pr*0.14,0,0,Math.PI*2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(px,py+pr*0.88,pr*0.28,pr*0.10,0,0,Math.PI*2);
        ctx.fill();
        // Cloud bands
        for(let b=0;b<5;b++){
          const by=py-pr*0.7+(b/4)*pr*1.4;
          const bw=Math.sin((b/4)*Math.PI)*pr*0.9;
          ctx.globalAlpha=0.08+Math.sin(t*0.008+b)*0.03;
          ctx.fillStyle="#ffffff";
          ctx.fillRect(px-bw,by-5,bw*2,10);
        }
        ctx.globalAlpha=1;
        ctx.restore();
        return;
      }

      if (type === "mars") {
        const mg = ctx.createRadialGradient(px-pr*0.3,py-pr*0.3,pr*0.05,px,py,pr);
        mg.addColorStop(0,"#d4603a");
        mg.addColorStop(0.3,"#b84020");
        mg.addColorStop(0.65,"#8b2500");
        mg.addColorStop(1,"#5a1200");
        ctx.fillStyle=mg;
        ctx.beginPath();
        ctx.arc(px,py,pr,0,Math.PI*2);
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.arc(px,py,pr,0,Math.PI*2);
        ctx.clip();
        // Surface bands
        for(let b=0;b<8;b++){
          const by=py-pr+(b/7)*pr*2;
          ctx.globalAlpha=0.06+Math.abs(Math.sin(b*1.3))*0.08;
          ctx.fillStyle=b%2===0?"#c0402a":"#7a2000";
          ctx.fillRect(px-pr,by-pr*0.08,pr*2,pr*0.16);
        }
        // Polar ice cap
        ctx.globalAlpha=0.55;
        ctx.fillStyle="#e8e0d8";
        ctx.beginPath();
        ctx.ellipse(px,py-pr*0.85,pr*0.30,pr*0.12,0,0,Math.PI*2);
        ctx.fill();
        // Dust storm swirl
        const dspin=t*0.003;
        ctx.globalAlpha=0.12;
        ctx.strokeStyle="#e8a060";
        ctx.lineWidth=pr*0.09;
        ctx.beginPath();
        ctx.arc(px+Math.cos(dspin)*pr*0.2,py+Math.sin(dspin)*pr*0.2,pr*0.25,0,Math.PI*1.5);
        ctx.stroke();
        ctx.globalAlpha=1;
        ctx.restore();
        return;
      }

      if (type === "saturn") {
        const satg = ctx.createRadialGradient(px-pr*0.3,py-pr*0.3,pr*0.05,px,py,pr);
        satg.addColorStop(0,"#f0d080");
        satg.addColorStop(0.25,"#d4aa50");
        satg.addColorStop(0.55,"#a87830");
        satg.addColorStop(0.8,"#7a5018");
        satg.addColorStop(1,"#4a3008");
        ctx.fillStyle=satg;
        ctx.beginPath();
        ctx.arc(px,py,pr,0,Math.PI*2);
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.arc(px,py,pr,0,Math.PI*2);
        ctx.clip();
        // Surface bands
        const bands=[
          [0.0,0.16,"rgba(200,160,60,0.18)"],
          [0.18,0.13,"rgba(255,220,100,0.12)"],
          [0.32,0.10,"rgba(180,130,40,0.22)"],
          [0.44,0.12,"rgba(240,190,80,0.10)"],
          [0.58,0.14,"rgba(160,110,30,0.18)"],
          [0.74,0.12,"rgba(220,170,70,0.12)"],
          [0.88,0.12,"rgba(140,90,20,0.14)"],
        ];
        bands.forEach(([start,height,color])=>{
          const by=py-pr+((start as number)+0.0)*pr*2;
          ctx.globalAlpha=1;
          ctx.fillStyle=color as string;
          ctx.fillRect(px-pr,by,pr*2,(height as number)*pr*2);
        });
        ctx.globalAlpha=1;
        ctx.restore();
        return;
      }

      if (type === "neptune") {
        const ng = ctx.createRadialGradient(px-pr*0.3,py-pr*0.3,pr*0.05,px,py,pr);
        ng.addColorStop(0,"#5588ff");
        ng.addColorStop(0.3,"#2244cc");
        ng.addColorStop(0.65,"#1133aa");
        ng.addColorStop(1,"#0a1a66");
        ctx.fillStyle=ng;
        ctx.beginPath();
        ctx.arc(px,py,pr,0,Math.PI*2);
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.arc(px,py,pr,0,Math.PI*2);
        ctx.clip();
        // Storm spot
        const sspin=t*0.0025;
        const sx=px+Math.cos(sspin)*pr*0.25;
        const sy=py+Math.sin(sspin)*pr*0.15;
        ctx.globalAlpha=0.25;
        ctx.fillStyle="#1a2288";
        ctx.beginPath();
        ctx.ellipse(sx,sy,pr*0.22,pr*0.14,sspin,0,Math.PI*2);
        ctx.fill();
        // Bands
        for(let b=0;b<5;b++){
          const by=py-pr+(b/4)*pr*2;
          ctx.globalAlpha=0.07;
          ctx.fillStyle=b%2===0?"#8899ff":"#2233aa";
          ctx.fillRect(px-pr,by-pr*0.07,pr*2,pr*0.14);
        }
        ctx.globalAlpha=1;
        ctx.restore();
        return;
      }

      if (type === "moon") {
        const moonG = ctx.createRadialGradient(px-pr*0.3,py-pr*0.3,pr*0.05,px,py,pr);
        moonG.addColorStop(0,"#d8d8d8");
        moonG.addColorStop(0.4,"#aaaaaa");
        moonG.addColorStop(0.75,"#888888");
        moonG.addColorStop(1,"#555555");
        ctx.fillStyle=moonG;
        ctx.beginPath();
        ctx.arc(px,py,pr,0,Math.PI*2);
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.arc(px,py,pr,0,Math.PI*2);
        ctx.clip();
        const craters=[[0.2,-0.15,0.14],[-0.28,0.25,0.10],[0.10,0.30,0.17],[-0.10,-0.10,0.07],[0.35,0.10,0.09],[-0.20,-0.35,0.08]];
        craters.forEach(([cx,cy,cr])=>{
          const cxp=px+(cx as number)*pr;
          const cyp=py+(cy as number)*pr;
          const crr=(cr as number)*pr;
          // Crater depression
          const cg=ctx.createRadialGradient(cxp-crr*0.2,cyp-crr*0.2,0,cxp,cyp,crr);
          cg.addColorStop(0,"rgba(60,60,60,0.5)");
          cg.addColorStop(0.7,"rgba(40,40,40,0.3)");
          cg.addColorStop(1,"rgba(180,180,180,0.1)");
          ctx.fillStyle=cg;
          ctx.beginPath();
          ctx.arc(cxp,cyp,crr,0,Math.PI*2);
          ctx.fill();
          // Crater rim highlight
          ctx.strokeStyle="rgba(255,255,255,0.12)";
          ctx.lineWidth=1.5;
          ctx.beginPath();
          ctx.arc(cxp,cyp,crr,Math.PI*0.8,Math.PI*1.8);
          ctx.stroke();
        });
        ctx.globalAlpha=1;
        ctx.restore();
        return;
      }

      if (type === "ocean") {
        const og = ctx.createRadialGradient(px-pr*0.3,py-pr*0.3,pr*0.05,px,py,pr);
        og.addColorStop(0,"#00e5ff");
        og.addColorStop(0.3,"#0097a7");
        og.addColorStop(0.65,"#006064");
        og.addColorStop(1,"#00363a");
        ctx.fillStyle=og;
        ctx.beginPath();
        ctx.arc(px,py,pr,0,Math.PI*2);
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.arc(px,py,pr,0,Math.PI*2);
        ctx.clip();
        // Swirling currents
        const wspin=t*0.0015;
        for(let w=0;w<4;w++){
          ctx.globalAlpha=0.10+w*0.02;
          ctx.strokeStyle="#00e5ff";
          ctx.lineWidth=pr*0.06;
          ctx.beginPath();
          ctx.arc(px+Math.cos(wspin+w*1.5)*pr*0.2,py+Math.sin(wspin+w*1.5)*pr*0.15,pr*(0.25+w*0.12),0,Math.PI*1.3);
          ctx.stroke();
        }
        // Ice swirls
        ctx.globalAlpha=0.35;
        ctx.fillStyle="#b2ebf2";
        ctx.beginPath();
        ctx.ellipse(px,py-pr*0.82,pr*0.40,pr*0.13,0,0,Math.PI*2);
        ctx.fill();
        ctx.globalAlpha=1;
        ctx.restore();
        return;
      }
    }

    // ── Main draw loop ───────────────────────────────────────────
    function drawFrame() {
      const W = canvas!.width, H = canvas!.height;
      t++;
      const tc = THEME_COLORS[themeId];

      ctx.clearRect(0,0,W,H);

      // Background
      const bg = ctx.createRadialGradient(W*0.35,H*0.3,0,W*0.5,H*0.65,Math.max(W,H));
      bg.addColorStop(0, tc.bg1);
      bg.addColorStop(1, tc.bg2);
      ctx.fillStyle=bg;
      ctx.fillRect(0,0,W,H);

      // Nebulas
      nebulas.forEach(n=>{
        const ng=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r);
        ng.addColorStop(0,`hsla(${n.hue},70%,50%,${n.alpha*1.6})`);
        ng.addColorStop(0.5,`hsla(${n.hue},55%,35%,${n.alpha})`);
        ng.addColorStop(1,"transparent");
        ctx.fillStyle=ng;
        ctx.beginPath();
        ctx.arc(n.x,n.y,n.r,0,Math.PI*2);
        ctx.fill();
      });

      // Stars
      stars.forEach(s=>{
        const tw=Math.sin(t*s.speed+s.offset)*0.35+0.65;
        ctx.globalAlpha=s.baseAlpha*tw;
        ctx.fillStyle=s.color;
        ctx.beginPath();
        ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
        ctx.fill();
        if(s.r>1.2){
          const grd=ctx.createRadialGradient(s.x,s.y,0,s.x,s.y,s.r*4.5);
          grd.addColorStop(0,"rgba(255,255,255,0.22)");
          grd.addColorStop(1,"transparent");
          ctx.fillStyle=grd;
          ctx.beginPath();
          ctx.arc(s.x,s.y,s.r*4.5,0,Math.PI*2);
          ctx.fill();
        }
      });
      ctx.globalAlpha=1;

      // Shooting stars
      shotTimer++;
      if(shotTimer>65+Math.random()*90){
        spawnShot();
        if(Math.random()>0.55) spawnShot();
        shotTimer=0;
      }
      for(let i=shots.length-1;i>=0;i--){
        const s=shots[i];
        s.x+=s.vx; s.y+=s.vy; s.life++;
        const prog=s.life/s.maxLife;
        const alpha=prog<0.15?prog/0.15:1-(prog-0.15)/0.85;
        const spd=Math.sqrt(s.vx*s.vx+s.vy*s.vy);
        const tailLen=200+s.width*35;
        const tx=s.x-s.vx*(tailLen/spd);
        const ty=s.y-s.vy*(tailLen/spd);
        const grad=ctx.createLinearGradient(tx,ty,s.x,s.y);
        grad.addColorStop(0,"transparent");
        grad.addColorStop(0.35,`hsla(${s.hue},90%,75%,${alpha*0.25})`);
        grad.addColorStop(0.75,`hsla(${s.hue},100%,90%,${alpha*0.65})`);
        grad.addColorStop(1,`rgba(255,255,255,${alpha})`);
        ctx.strokeStyle=grad;
        ctx.lineWidth=s.width;
        ctx.lineCap="round";
        ctx.beginPath();
        ctx.moveTo(tx,ty);
        ctx.lineTo(s.x,s.y);
        ctx.stroke();
        const hg=ctx.createRadialGradient(s.x,s.y,0,s.x,s.y,12);
        hg.addColorStop(0,`rgba(255,255,255,${alpha})`);
        hg.addColorStop(0.4,`hsla(${s.hue},100%,80%,${alpha*0.5})`);
        hg.addColorStop(1,"transparent");
        ctx.fillStyle=hg;
        ctx.beginPath();
        ctx.arc(s.x,s.y,12,0,Math.PI*2);
        ctx.fill();
        if(s.life>=s.maxLife||s.x>W+250||s.y>H+250) shots.splice(i,1);
      }

      // ── Planet section ───────────────────────────────────────
      const p=getPlanet()!;
      const spin=t*0.0022;

      // Sun corona + flares
      if(p.type==="sun"){
        // Outer corona layers
        for(let layer=0;layer<3;layer++){
          const cr=ctx.createRadialGradient(p.px,p.py,p.pr*(0.9+layer*0.3),p.px,p.py,p.pr*(2.2+layer*0.8));
          cr.addColorStop(0,`rgba(255,${160-layer*30},0,${0.20-layer*0.05})`);
          cr.addColorStop(0.5,`rgba(255,${100-layer*20},0,${0.08-layer*0.02})`);
          cr.addColorStop(1,"transparent");
          ctx.fillStyle=cr;
          ctx.beginPath();
          ctx.arc(p.px,p.py,p.pr*(2.2+layer*0.8),0,Math.PI*2);
          ctx.fill();
        }
        // Solar flares
        for(let f=0;f<10;f++){
          const fa=(f/10)*Math.PI*2+spin*0.4;
          const flen=p.pr*(1.25+Math.sin(t*0.018+f*1.3)*0.45);
          const fx=p.px+Math.cos(fa)*flen;
          const fy=p.py+Math.sin(fa)*flen;
          const flare=ctx.createLinearGradient(p.px,p.py,fx,fy);
          flare.addColorStop(0,"rgba(255,210,50,0.35)");
          flare.addColorStop(0.5,"rgba(255,120,0,0.12)");
          flare.addColorStop(1,"transparent");
          ctx.strokeStyle=flare;
          ctx.lineWidth=2+Math.sin(t*0.025+f)*1.5;
          ctx.lineCap="round";
          ctx.beginPath();
          ctx.moveTo(p.px,p.py);
          ctx.lineTo(fx,fy);
          ctx.stroke();
        }
      }

      // Saturn rings — behind planet
      if(p.type==="saturn"){
        ctx.save();
        ctx.translate(p.px,p.py);
        ctx.scale(1,0.28);
        const ringDefs=[
          {inner:1.22,outer:1.50,color:"rgba(210,175,90,0.55)"},
          {inner:1.52,outer:1.72,color:"rgba(195,155,70,0.40)"},
          {inner:1.74,outer:1.88,color:"rgba(230,195,110,0.28)"},
          {inner:1.90,outer:2.05,color:"rgba(170,135,60,0.20)"},
          {inner:2.08,outer:2.18,color:"rgba(210,175,90,0.12)"},
        ];
        ringDefs.forEach(rd=>{
          const rg=ctx.createRadialGradient(0,0,rd.inner*p.pr,0,0,rd.outer*p.pr);
          rg.addColorStop(0,rd.color);
          rg.addColorStop(0.4,rd.color);
          rg.addColorStop(1,"transparent");
          ctx.fillStyle=rg;
          ctx.beginPath();
          ctx.arc(0,0,rd.outer*p.pr,0,Math.PI*2);
          ctx.arc(0,0,rd.inner*p.pr,0,Math.PI*2,true);
          ctx.fill();
        });
        ctx.restore();
      }

      // Neptune rings
      if(p.type==="neptune"){
        ctx.save();
        ctx.translate(p.px,p.py);
        ctx.scale(1,0.22);
        const nrg=ctx.createRadialGradient(0,0,p.pr*1.35,0,0,p.pr*1.85);
        nrg.addColorStop(0,"rgba(80,110,255,0.28)");
        nrg.addColorStop(0.5,"rgba(60,90,220,0.15)");
        nrg.addColorStop(1,"transparent");
        ctx.fillStyle=nrg;
        ctx.beginPath();
        ctx.arc(0,0,p.pr*1.85,0,Math.PI*2);
        ctx.arc(0,0,p.pr*1.35,0,Math.PI*2,true);
        ctx.fill();
        ctx.restore();
      }

      // Planet outer atmosphere glow
      if(p.type!=="galaxy"){
        const atmo=ctx.createRadialGradient(p.px,p.py,p.pr*0.75,p.px,p.py,p.pr*p.glowSize);
        atmo.addColorStop(0,p.glow+"44");
        atmo.addColorStop(0.4,p.glow+"18");
        atmo.addColorStop(1,"transparent");
        ctx.fillStyle=atmo;
        ctx.beginPath();
        ctx.arc(p.px,p.py,p.pr*p.glowSize,0,Math.PI*2);
        ctx.fill();
      }

      // Draw planet body
      drawPlanetBody(p);

      // Night shadow (not sun/galaxy)
      if(p.type!=="sun"&&p.type!=="galaxy"){
        const shadow=ctx.createRadialGradient(
          p.px+p.pr*0.5,p.py+p.pr*0.1,p.pr*0.05,
          p.px+p.pr*0.55,p.py,p.pr*1.2
        );
        shadow.addColorStop(0,"rgba(0,0,10,0.88)");
        shadow.addColorStop(0.35,"rgba(0,0,5,0.55)");
        shadow.addColorStop(1,"transparent");
        ctx.fillStyle=shadow;
        ctx.beginPath();
        ctx.arc(p.px,p.py,p.pr,0,Math.PI*2);
        ctx.fill();
      }

      // Orbiting moons
      if(p.moons){
        p.moons.forEach((m: any, i: number)=>{
          const mAngle=spin*(1.2+i*0.35)*(m.speed/0.007)+i*(Math.PI*2/Math.max(p.moons.length,1));
          const mx=p.px+Math.cos(mAngle)*p.pr*m.dist;
          const my=p.py+Math.sin(mAngle)*p.pr*m.dist*0.35;
          const mr=p.pr*m.size;
          const mg=ctx.createRadialGradient(mx-mr*0.3,my-mr*0.3,0,mx,my,mr);
          mg.addColorStop(0,lighten(m.color,45));
          mg.addColorStop(1,darken(m.color,35));
          ctx.fillStyle=mg;
          ctx.beginPath();
          ctx.arc(mx,my,mr,0,Math.PI*2);
          ctx.fill();
          // Moon shadow
          const msh=ctx.createRadialGradient(mx+mr*0.4,my,0,mx+mr*0.5,my,mr*1.1);
          msh.addColorStop(0,"rgba(0,0,0,0.75)");
          msh.addColorStop(1,"transparent");
          ctx.fillStyle=msh;
          ctx.beginPath();
          ctx.arc(mx,my,mr,0,Math.PI*2);
          ctx.fill();
        });
      }

      // Asteroid belt
      if(p.type==="mars"||p.type==="saturn"){
        const beltDist=p.type==="saturn"?2.7:2.3;
        for(let a=0;a<60;a++){
          const aAngle=(a/60)*Math.PI*2+spin*0.12;
          const aDist=p.pr*beltDist+Math.sin(a*7.7)*p.pr*0.22;
          const ax=p.px+Math.cos(aAngle)*aDist;
          const ay=p.py+Math.sin(aAngle)*aDist*0.28;
          ctx.globalAlpha=0.35+Math.abs(Math.sin(a*1.8))*0.25;
          ctx.fillStyle=a%3===0?"#998877":a%3===1?"#887766":"#aa9988";
          ctx.beginPath();
          ctx.arc(ax,ay,Math.sin(a*3.1)*0.8+1.2,0,Math.PI*2);
          ctx.fill();
        }
        ctx.globalAlpha=1;
      }

      animId=requestAnimationFrame(drawFrame);
    }

    drawFrame();

    return ()=>{
      cancelAnimationFrame(animId);
      window.removeEventListener("resize",resize);
      observer.disconnect();
    };
  },[]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position:"fixed",
        top:0,left:0,
        width:"100vw",
        height:"100vh",
        zIndex:0,
        pointerEvents:"none",
        display:"block",
      }}
    />
  );
}
