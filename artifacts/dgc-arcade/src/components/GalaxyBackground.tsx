import { useEffect, useRef } from "react";

const SCENES = [
  { name: "earth", bodyColor: "#1a6bcc", glowColor: "#4a9eff", label: "EARTH", moons: 1, rings: false, clouds: true },
  { name: "mars",  bodyColor: "#c1440e", glowColor: "#ff6633", label: "MARS",  moons: 2, rings: false, clouds: false },
  { name: "moon",  bodyColor: "#aaaaaa", glowColor: "#dddddd", label: "MOON",  moons: 0, rings: false, clouds: false },
  { name: "saturn",bodyColor: "#c8a96e", glowColor: "#ffe4a0", label: "SATURN",moons: 3, rings: true,  clouds: false },
  { name: "neptune",bodyColor: "#2255cc",glowColor: "#66aaff", label: "NEPTUNE",moons: 1,rings: false, clouds: false },
];

function randomScene() {
  return SCENES[Math.floor(Math.random() * SCENES.length)];
}

export default function GalaxyBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const scene = randomScene();
    let animFrame: number;
    let t = 0;

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    // ── Stars ──
    const STAR_COUNT = 320;
    const stars = Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.6 + 0.2,
      alpha: Math.random() * 0.6 + 0.4,
      twinkleSpeed: Math.random() * 0.02 + 0.005,
      twinkleOffset: Math.random() * Math.PI * 2,
    }));

    // ── Shooting stars ──
    interface Shooter {
      x: number; y: number; vx: number; vy: number;
      len: number; life: number; maxLife: number; alpha: number;
    }
    const shooters: Shooter[] = [];
    function spawnShooter() {
      const angle = (Math.random() * 30 + 10) * (Math.PI / 180);
      const speed = Math.random() * 14 + 8;
      shooters.push({
        x: Math.random() * 0.8,
        y: Math.random() * 0.4,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        len: Math.random() * 120 + 60,
        life: 0,
        maxLife: Math.random() * 40 + 30,
        alpha: 1,
      });
    }
    let shooterTimer = 0;

    // ── Nebula clusters ──
    const nebulas = Array.from({ length: 5 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 180 + 80,
      hue: Math.random() * 360,
      alpha: Math.random() * 0.07 + 0.02,
    }));

    function drawFrame() {
      const W = canvas!.width;
      const H = canvas!.height;
      t += 1;

      // Background
      const bg = ctx.createRadialGradient(W * 0.5, H * 0.3, 0, W * 0.5, H * 0.5, H);
      bg.addColorStop(0, "#0a0e1a");
      bg.addColorStop(0.5, "#06080f");
      bg.addColorStop(1, "#020305");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Nebulas
      nebulas.forEach(n => {
        const g = ctx.createRadialGradient(n.x * W, n.y * H, 0, n.x * W, n.y * H, n.r);
        g.addColorStop(0, `hsla(${n.hue},80%,60%,${n.alpha})`);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(n.x * W, n.y * H, n.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // Stars
      stars.forEach(s => {
        const flicker = Math.sin(t * s.twinkleSpeed + s.twinkleOffset) * 0.3 + 0.7;
        ctx.globalAlpha = s.alpha * flicker;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
        ctx.fill();
        // Star glow for big stars
        if (s.r > 1.2) {
          const sg = ctx.createRadialGradient(s.x*W, s.y*H, 0, s.x*W, s.y*H, s.r*4);
          sg.addColorStop(0, "rgba(255,255,255,0.3)");
          sg.addColorStop(1, "transparent");
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.arc(s.x*W, s.y*H, s.r*4, 0, Math.PI*2);
          ctx.fill();
        }
      });
      ctx.globalAlpha = 1;

      // Shooting stars
      shooterTimer++;
      if (shooterTimer > 90 + Math.random() * 120) {
        spawnShooter();
        shooterTimer = 0;
      }
      for (let i = shooters.length - 1; i >= 0; i--) {
        const s = shooters[i];
        s.x += s.vx / W;
        s.y += s.vy / H;
        s.life++;
        const progress = s.life / s.maxLife;
        s.alpha = progress < 0.2 ? progress / 0.2 : 1 - (progress - 0.2) / 0.8;
        const tailX = s.x * W - (s.vx / W) * s.len;
        const tailY = s.y * H - (s.vy / H) * s.len;
        const grad = ctx.createLinearGradient(tailX, tailY, s.x * W, s.y * H);
        grad.addColorStop(0, "transparent");
        grad.addColorStop(0.6, `rgba(180,220,255,${s.alpha * 0.4})`);
        grad.addColorStop(1, `rgba(255,255,255,${s.alpha})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(s.x * W, s.y * H);
        ctx.stroke();
        // Head glow
        const hg = ctx.createRadialGradient(s.x*W, s.y*H, 0, s.x*W, s.y*H, 6);
        hg.addColorStop(0, `rgba(255,255,255,${s.alpha})`);
        hg.addColorStop(1, "transparent");
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(s.x*W, s.y*H, 6, 0, Math.PI*2);
        ctx.fill();
        if (s.life >= s.maxLife || s.x > 1.1 || s.y > 1.1) shooters.splice(i, 1);
      }

      // ── Distant planet ──
      const px = W * 0.82;
      const py = H * 0.18;
      const pr = Math.min(W, H) * 0.075;
      const slowSpin = t * 0.003;

      // Planet glow
      const planetGlow = ctx.createRadialGradient(px, py, pr * 0.5, px, py, pr * 3);
      planetGlow.addColorStop(0, scene.glowColor + "22");
      planetGlow.addColorStop(1, "transparent");
      ctx.fillStyle = planetGlow;
      ctx.beginPath();
      ctx.arc(px, py, pr * 3, 0, Math.PI * 2);
      ctx.fill();

      // Rings (Saturn)
      if (scene.rings) {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(0.3);
        ctx.scale(1, 0.35);
        const ringGrad = ctx.createRadialGradient(0, 0, pr * 1.1, 0, 0, pr * 2.2);
        ringGrad.addColorStop(0, "rgba(200,169,110,0.0)");
        ringGrad.addColorStop(0.3, "rgba(200,169,110,0.5)");
        ringGrad.addColorStop(0.6, "rgba(180,150,90,0.3)");
        ringGrad.addColorStop(1, "transparent");
        ctx.fillStyle = ringGrad;
        ctx.beginPath();
        ctx.arc(0, 0, pr * 2.2, 0, Math.PI * 2);
        ctx.arc(0, 0, pr * 1.1, 0, Math.PI * 2, true);
        ctx.fill();
        ctx.restore();
      }

      // Planet body
      const planetBody = ctx.createRadialGradient(px - pr * 0.3, py - pr * 0.3, pr * 0.1, px, py, pr);
      planetBody.addColorStop(0, lighten(scene.bodyColor, 60));
      planetBody.addColorStop(0.4, scene.bodyColor);
      planetBody.addColorStop(1, darken(scene.bodyColor, 60));
      ctx.fillStyle = planetBody;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();

      // Cloud bands (Earth)
      if (scene.clouds) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.clip();
        for (let b = 0; b < 5; b++) {
          const by = py - pr + (b / 4) * pr * 2;
          const bw = Math.sin((b / 4) * Math.PI) * pr;
          ctx.fillStyle = `rgba(255,255,255,${0.04 + Math.sin(slowSpin + b) * 0.02})`;
          ctx.fillRect(px - bw, by - 3, bw * 2, 6);
        }
        ctx.restore();
      }

      // Planet shadow
      const shadow = ctx.createRadialGradient(px + pr * 0.4, py, pr * 0.1, px + pr * 0.5, py, pr * 1.1);
      shadow.addColorStop(0, "rgba(0,0,0,0.7)");
      shadow.addColorStop(0.5, "rgba(0,0,0,0.3)");
      shadow.addColorStop(1, "transparent");
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();

      // Moon orbits
      for (let m = 0; m < scene.moons; m++) {
        const orbitR = pr * (1.6 + m * 0.5);
        const moonAngle = slowSpin * (1 + m * 0.3) + (m * Math.PI * 2 / scene.moons);
        const mx = px + Math.cos(moonAngle) * orbitR;
        const my = py + Math.sin(moonAngle) * orbitR * 0.4;
        const mr = pr * 0.1;
        const moonG = ctx.createRadialGradient(mx - mr*0.3, my - mr*0.3, 0, mx, my, mr);
        moonG.addColorStop(0, "#dddddd");
        moonG.addColorStop(1, "#444444");
        ctx.fillStyle = moonG;
        ctx.beginPath();
        ctx.arc(mx, my, mr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Sun glow in corner
      const sunX = W * 0.05;
      const sunY = H * 0.08;
      const sunGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, W * 0.25);
      sunGlow.addColorStop(0, "rgba(255,220,100,0.18)");
      sunGlow.addColorStop(0.3, "rgba(255,150,50,0.06)");
      sunGlow.addColorStop(1, "transparent");
      ctx.fillStyle = sunGlow;
      ctx.fillRect(0, 0, W, H);

      animFrame = requestAnimationFrame(drawFrame);
    }

    drawFrame();
    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}

function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (n >> 16) + amount);
  const g = Math.min(255, ((n >> 8) & 0xff) + amount);
  const b = Math.min(255, (n & 0xff) + amount);
  return `rgb(${r},${g},${b})`;
}
function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (n >> 16) - amount);
  const g = Math.max(0, ((n >> 8) & 0xff) - amount);
  const b = Math.max(0, (n & 0xff) - amount);
  return `rgb(${r},${g},${b})`;
}
