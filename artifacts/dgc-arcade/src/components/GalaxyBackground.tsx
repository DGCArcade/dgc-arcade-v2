import { useEffect, useRef } from "react";

const SCENES = [
  "earth", "mars", "saturn", "sun", "moon", "neptune"
] as const;

type Scene = typeof SCENES[number];

export default function GalaxyBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    // Pick a random scene every reload
    const scene: Scene = SCENES[Math.floor(Math.random() * SCENES.length)];

    let animId: number;
    let t = 0;

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    // ── 320 stars with twinkle ──
    const stars = Array.from({ length: 380 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.8 + 0.2,
      baseAlpha: Math.random() * 0.7 + 0.3,
      speed: Math.random() * 0.025 + 0.005,
      offset: Math.random() * Math.PI * 2,
      color: Math.random() > 0.85
        ? `hsl(${Math.random() * 60 + 200},80%,90%)`
        : "#ffffff",
    }));

    // ── Shooting stars ──
    interface Shot {
      x: number; y: number;
      vx: number; vy: number;
      life: number; maxLife: number;
      width: number;
      hue: number;
    }
    const shots: Shot[] = [];
    let shotTimer = 0;

    function spawnShot() {
      const angle = (Math.random() * 25 + 15) * (Math.PI / 180);
      const speed = Math.random() * 18 + 12;
      shots.push({
        x: Math.random() * window.innerWidth * 0.7,
        y: Math.random() * window.innerHeight * 0.45,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: Math.random() * 55 + 35,
        width: Math.random() * 2 + 1,
        hue: Math.random() > 0.5 ? 200 : Math.random() * 60 + 20,
      });
    }

    // ── Nebula clouds ──
    const nebulas = Array.from({ length: 6 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 220 + 100,
      hue: Math.random() * 360,
      alpha: Math.random() * 0.055 + 0.015,
    }));

    // ── Planet config per scene ──
    function getPlanet() {
      const W = canvas!.width;
      const H = canvas!.height;
      // Planet is always far top-right, big and dramatic
      const px = W * 0.78;
      const py = H * 0.22;
      const pr = Math.min(W, H) * 0.13; // big

      switch(scene) {
        case "earth": return {
          px, py, pr,
          colors: ["#1a5fa8","#1a7acc","#0d3b6e"],
          glow: "#2288ff",
          glowSize: 2.8,
          rings: false,
          clouds: true,
          moons: [{ dist: 1.7, size: 0.12, color: "#aaaaaa", speed: 0.008 }],
          label: "EARTH",
        };
        case "mars": return {
          px, py, pr,
          colors: ["#8b2500","#c1440e","#6b1a00"],
          glow: "#ff4400",
          glowSize: 2.5,
          rings: false,
          clouds: false,
          moons: [
            { dist: 1.6, size: 0.08, color: "#888888", speed: 0.012 },
            { dist: 2.0, size: 0.06, color: "#999999", speed: 0.007 },
          ],
          label: "MARS",
        };
        case "saturn": return {
          px, py, pr,
          colors: ["#b8943f","#d4aa55","#8a6e2a"],
          glow: "#ffdd88",
          glowSize: 3.2,
          rings: true,
          clouds: false,
          moons: [
            { dist: 2.8, size: 0.09, color: "#ccbbaa", speed: 0.006 },
            { dist: 3.4, size: 0.07, color: "#bbaaaa", speed: 0.004 },
            { dist: 2.2, size: 0.06, color: "#ddccbb", speed: 0.009 },
          ],
          label: "SATURN",
        };
        case "sun": return {
          px: W * 0.85, py: H * 0.15,
          pr: Math.min(W,H) * 0.18,
          colors: ["#fff7aa","#ffcc00","#ff8800"],
          glow: "#ffaa00",
          glowSize: 4.5,
          rings: false,
          clouds: false,
          moons: [],
          label: "SOL",
        };
        case "moon": return {
          px, py, pr,
          colors: ["#888888","#aaaaaa","#666666"],
          glow: "#cccccc",
          glowSize: 2.0,
          rings: false,
          clouds: false,
          moons: [],
          label: "MOON",
        };
        case "neptune": return {
          px, py, pr,
          colors: ["#1133aa","#1a4acc","#0d2266"],
          glow: "#4466ff",
          glowSize: 2.6,
          rings: true,
          clouds: false,
          moons: [{ dist: 1.8, size: 0.1, color: "#8899cc", speed: 0.009 }],
          label: "NEPTUNE",
        };
      }
    }

    function drawFrame() {
      const W = canvas!.width;
      const H = canvas!.height;
      t++;

      // ── Deep space background ──
      ctx.clearRect(0, 0, W, H);
      const bg = ctx.createRadialGradient(W*0.4, H*0.3, 0, W*0.5, H*0.6, Math.max(W,H));
      bg.addColorStop(0, "#080c18");
      bg.addColorStop(0.4, "#050810");
      bg.addColorStop(1, "#020305");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // ── Nebula ──
      nebulas.forEach(n => {
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
        g.addColorStop(0, `hsla(${n.hue},75%,55%,${n.alpha * 1.5})`);
        g.addColorStop(0.5, `hsla(${n.hue},60%,40%,${n.alpha})`);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI*2);
        ctx.fill();
      });

      // ── Stars ──
      stars.forEach(s => {
        const tw = Math.sin(t * s.speed + s.offset) * 0.35 + 0.65;
        ctx.globalAlpha = s.baseAlpha * tw;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
        ctx.fill();
        if (s.r > 1.3) {
          const sg = ctx.createRadialGradient(s.x,s.y,0,s.x,s.y,s.r*5);
          sg.addColorStop(0, `rgba(255,255,255,0.25)`);
          sg.addColorStop(1, "transparent");
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.arc(s.x,s.y,s.r*5,0,Math.PI*2);
          ctx.fill();
        }
      });
      ctx.globalAlpha = 1;

      // ── Shooting stars ──
      shotTimer++;
      if (shotTimer > 70 + Math.random() * 100) {
        spawnShot();
        if (Math.random() > 0.6) spawnShot(); // sometimes double
        shotTimer = 0;
      }
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        s.x += s.vx;
        s.y += s.vy;
        s.life++;
        const prog = s.life / s.maxLife;
        const alpha = prog < 0.15 ? prog/0.15 : 1-(prog-0.15)/0.85;
        const tailLen = 180 + s.width * 40;
        const tailX = s.x - s.vx * (tailLen / Math.sqrt(s.vx*s.vx+s.vy*s.vy));
        const tailY = s.y - s.vy * (tailLen / Math.sqrt(s.vx*s.vx+s.vy*s.vy));
        const grad = ctx.createLinearGradient(tailX, tailY, s.x, s.y);
        grad.addColorStop(0, "transparent");
        grad.addColorStop(0.4, `hsla(${s.hue},90%,80%,${alpha*0.3})`);
        grad.addColorStop(0.8, `hsla(${s.hue},100%,95%,${alpha*0.7})`);
        grad.addColorStop(1, `rgba(255,255,255,${alpha})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = s.width;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
        // Head spark
        const hg = ctx.createRadialGradient(s.x,s.y,0,s.x,s.y,10);
        hg.addColorStop(0, `rgba(255,255,255,${alpha})`);
        hg.addColorStop(0.4, `hsla(${s.hue},100%,80%,${alpha*0.5})`);
        hg.addColorStop(1, "transparent");
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(s.x,s.y,10,0,Math.PI*2);
        ctx.fill();
        if (s.life >= s.maxLife || s.x > W+200 || s.y > H+200) shots.splice(i,1);
      }

      // ── Planet ──
      const p = getPlanet()!;
      const spin = t * 0.0025;

      // Sun flares
      if (scene === "sun") {
        for (let f = 0; f < 8; f++) {
          const fAngle = (f / 8) * Math.PI * 2 + spin * 0.5;
          const fLen = p.pr * (1.3 + Math.sin(t * 0.02 + f) * 0.4);
          const fx = p.px + Math.cos(fAngle) * fLen;
          const fy = p.py + Math.sin(fAngle) * fLen;
          const flare = ctx.createLinearGradient(p.px, p.py, fx, fy);
          flare.addColorStop(0, "rgba(255,200,50,0.4)");
          flare.addColorStop(0.6, "rgba(255,120,0,0.15)");
          flare.addColorStop(1, "transparent");
          ctx.strokeStyle = flare;
          ctx.lineWidth = 3 + Math.sin(t*0.03+f)*2;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(p.px, p.py);
          ctx.lineTo(fx, fy);
          ctx.stroke();
        }
        // Corona
        const corona = ctx.createRadialGradient(p.px,p.py,p.pr,p.px,p.py,p.pr*p.glowSize);
        corona.addColorStop(0, "rgba(255,180,0,0.35)");
        corona.addColorStop(0.3, "rgba(255,100,0,0.12)");
        corona.addColorStop(0.7, "rgba(255,60,0,0.04)");
        corona.addColorStop(1, "transparent");
        ctx.fillStyle = corona;
        ctx.beginPath();
        ctx.arc(p.px,p.py,p.pr*p.glowSize,0,Math.PI*2);
        ctx.fill();
      }

      // Planet outer glow
      const outerGlow = ctx.createRadialGradient(p.px,p.py,p.pr*0.8,p.px,p.py,p.pr*p.glowSize);
      outerGlow.addColorStop(0, p.glow + "33");
      outerGlow.addColorStop(0.5, p.glow + "11");
      outerGlow.addColorStop(1, "transparent");
      ctx.fillStyle = outerGlow;
      ctx.beginPath();
      ctx.arc(p.px,p.py,p.pr*p.glowSize,0,Math.PI*2);
      ctx.fill();

      // Saturn rings (behind planet)
      if (p.rings && scene === "saturn") {
        ctx.save();
        ctx.translate(p.px, p.py);
        ctx.scale(1, 0.3);
        for (let ri = 0; ri < 3; ri++) {
          const ro = p.pr * (1.4 + ri * 0.35);
          const ri2 = p.pr * (1.25 + ri * 0.35);
          const rg = ctx.createRadialGradient(0,0,ri2,0,0,ro);
          rg.addColorStop(0, `rgba(200,170,100,${0.5 - ri*0.12})`);
          rg.addColorStop(0.5, `rgba(180,150,80,${0.3 - ri*0.08})`);
          rg.addColorStop(1, "transparent");
          ctx.fillStyle = rg;
          ctx.beginPath();
          ctx.arc(0,0,ro,0,Math.PI*2);
          ctx.arc(0,0,ri2,0,Math.PI*2,true);
          ctx.fill();
        }
        ctx.restore();
      }

      // Neptune rings
      if (p.rings && scene === "neptune") {
        ctx.save();
        ctx.translate(p.px, p.py);
        ctx.scale(1, 0.25);
        const rg = ctx.createRadialGradient(0,0,p.pr*1.3,0,0,p.pr*1.8);
        rg.addColorStop(0, "rgba(100,130,255,0.3)");
        rg.addColorStop(1, "transparent");
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(0,0,p.pr*1.8,0,Math.PI*2);
        ctx.arc(0,0,p.pr*1.3,0,Math.PI*2,true);
        ctx.fill();
        ctx.restore();
      }

      // Planet body
      const body = ctx.createRadialGradient(
        p.px - p.pr*0.35, p.py - p.pr*0.35, p.pr*0.05,
        p.px, p.py, p.pr
      );
      body.addColorStop(0, lighten(p.colors[1], 70));
      body.addColorStop(0.35, p.colors[1]);
      body.addColorStop(0.7, p.colors[0]);
      body.addColorStop(1, p.colors[2]);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(p.px, p.py, p.pr, 0, Math.PI*2);
      ctx.fill();

      // Earth clouds
      if (p.clouds) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.px, p.py, p.pr, 0, Math.PI*2);
        ctx.clip();
        for (let b = 0; b < 7; b++) {
          const by = p.py - p.pr + (b/6)*p.pr*2;
          const bw = Math.sin((b/6)*Math.PI) * p.pr;
          const cloudAlpha = 0.05 + Math.sin(spin*2 + b*1.1) * 0.025;
          ctx.fillStyle = `rgba(255,255,255,${cloudAlpha})`;
          ctx.fillRect(p.px - bw, by - 4, bw*2, 8);
        }
        ctx.restore();
      }

      // Moon craters
      if (scene === "moon") {
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.px, p.py, p.pr, 0, Math.PI*2);
        ctx.clip();
        const craters = [[0.2,0.1,0.12],[-0.3,0.3,0.08],[0.1,-0.25,0.15],[-0.15,-0.1,0.06]];
        craters.forEach(([cx,cy,cr]) => {
          const cxp = p.px + cx*p.pr;
          const cyp = p.py + cy*p.pr;
          ctx.fillStyle = "rgba(0,0,0,0.2)";
          ctx.beginPath();
          ctx.arc(cxp,cyp,cr*p.pr,0,Math.PI*2);
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.1)";
          ctx.lineWidth = 1;
          ctx.stroke();
        });
        ctx.restore();
      }

      // Planet night shadow
      const shadow = ctx.createRadialGradient(
        p.px + p.pr*0.45, p.py + p.pr*0.1, p.pr*0.1,
        p.px + p.pr*0.5, p.py, p.pr*1.15
      );
      shadow.addColorStop(0, "rgba(0,0,10,0.85)");
      shadow.addColorStop(0.4, "rgba(0,0,5,0.5)");
      shadow.addColorStop(1, "transparent");
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.arc(p.px, p.py, p.pr, 0, Math.PI*2);
      ctx.fill();

      // Moons orbiting
      p.moons.forEach((m, i) => {
        const mAngle = spin * (1 + i*0.4) * (m.speed/0.008) + i * (Math.PI*2/p.moons.length);
        const mx = p.px + Math.cos(mAngle) * p.pr * m.dist;
        const my = p.py + Math.sin(mAngle) * p.pr * m.dist * 0.38;
        const mr = p.pr * m.size;
        const mg = ctx.createRadialGradient(mx-mr*0.3,my-mr*0.3,0,mx,my,mr);
        mg.addColorStop(0, lighten(m.color, 40));
        mg.addColorStop(1, darken(m.color, 30));
        ctx.fillStyle = mg;
        ctx.beginPath();
        ctx.arc(mx,my,mr,0,Math.PI*2);
        ctx.fill();
      });

      // Asteroid belt (between Mars orbit area)
      if (scene === "mars" || scene === "saturn") {
        for (let a = 0; a < 55; a++) {
          const aAngle = (a/55)*Math.PI*2 + spin*0.15;
          const aDist = p.pr * (scene==="saturn" ? 2.6 : 2.2) + Math.sin(a*7.3)*p.pr*0.25;
          const ax = p.px + Math.cos(aAngle) * aDist;
          const ay = p.py + Math.sin(aAngle) * aDist * 0.3;
          const ar = Math.random() * 1.5 + 0.5;
          ctx.globalAlpha = 0.4 + Math.sin(a*2.1)*0.2;
          ctx.fillStyle = "#aa9988";
          ctx.beginPath();
          ctx.arc(ax,ay,ar,0,Math.PI*2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      animId = requestAnimationFrame(drawFrame);
    }

    drawFrame();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0, left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
        pointerEvents: "none",
        display: "block",
      }}
    />
  );
}

function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.replace("#",""), 16);
  const r = Math.min(255,(n>>16)+amt);
  const g = Math.min(255,((n>>8)&0xff)+amt);
  const b = Math.min(255,(n&0xff)+amt);
  return `rgb(${r},${g},${b})`;
}
function darken(hex: string, amt: number): string {
  const n = parseInt(hex.replace("#",""), 16);
  const r = Math.max(0,(n>>16)-amt);
  const g = Math.max(0,((n>>8)&0xff)-amt);
  const b = Math.max(0,(n&0xff)-amt);
  return `rgb(${r},${g},${b})`;
}
