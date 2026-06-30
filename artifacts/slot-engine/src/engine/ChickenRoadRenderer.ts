import * as PIXI from "pixi.js";
import { gsap } from "gsap";
import {
  CHICKEN_ROAD_LAYOUT,
  type ChickenRoadState,
  type CrossAnim,
  type LaneState,
} from "./chicken-road-types";

const CAR_COLORS = [0xe74c3c, 0x3498db, 0x9b59b6, 0x2ecc71, 0xf39c12, 0x1abc9c];

function laneStateFor(
  laneIndex: number,
  state: ChickenRoadState,
): LaneState {
  const { currentLane, status, bustLane } = state;
  if (status === "idle") return "future";
  if (laneIndex < currentLane) return "past";
  if (laneIndex === currentLane && status === "active") return "current";
  if (bustLane === laneIndex && status === "lost") return "bust";
  return "future";
}

function drawChicken(g: PIXI.Graphics, scale = 1) {
  g.clear();
  g.ellipse(0, 28 * scale, 12 * scale, 3 * scale);
  g.fill({ color: 0x000000, alpha: 0.25 });
  g.roundRect(-16 * scale, 8 * scale, 32 * scale, 28 * scale, 14 * scale);
  g.fill(0xf8f8f2);
  g.circle(0, -8 * scale, 13 * scale);
  g.fill(0xf8f8f2);
  g.moveTo(-10 * scale, -20 * scale);
  g.lineTo(-8 * scale, -26 * scale);
  g.lineTo(-5 * scale, -18 * scale);
  g.lineTo(-2 * scale, -28 * scale);
  g.lineTo(2 * scale, -18 * scale);
  g.lineTo(5 * scale, -26 * scale);
  g.lineTo(10 * scale, -20 * scale);
  g.fill(0xe53e3e);
  g.moveTo(0, -2 * scale);
  g.lineTo(-6 * scale, 4 * scale);
  g.lineTo(0, 2 * scale);
  g.lineTo(6 * scale, 4 * scale);
  g.fill(0xf6ad55);
  g.circle(-6 * scale, -10 * scale, 2.5 * scale);
  g.fill(0x1a1a1a);
  g.circle(6 * scale, -10 * scale, 2.5 * scale);
  g.fill(0x1a1a1a);
  g.circle(12 * scale, -6 * scale, 5 * scale);
  g.fill({ color: 0xf04040, alpha: 0.5 });
}

function drawCar(g: PIXI.Graphics, color: number, variant: number, scale = 1) {
  g.clear();
  if (variant % 3 === 2) {
    g.roundRect(-14 * scale, -28 * scale, 28 * scale, 36 * scale, 4 * scale);
    g.fill(color);
    g.roundRect(-12 * scale, -24 * scale, 24 * scale, 14 * scale, 2 * scale);
    g.fill({ color: 0x1a1a2e, alpha: 0.45 });
    g.roundRect(-16 * scale, 6 * scale, 32 * scale, 18 * scale, 3 * scale);
    g.fill({ color, alpha: 0.85 });
    g.circle(-10 * scale, 24 * scale, 5 * scale);
    g.fill(0x1a1a1a);
    g.circle(10 * scale, 24 * scale, 5 * scale);
    g.fill(0x1a1a1a);
    return;
  }
  g.roundRect(-14 * scale, -20 * scale, 28 * scale, 36 * scale, 7 * scale);
  g.fill(color);
  g.roundRect(-10 * scale, -16 * scale, 20 * scale, 12 * scale, 2 * scale);
  g.fill({ color: 0x1a1a2e, alpha: 0.45 });
  g.roundRect(-12 * scale, 14 * scale, 24 * scale, 8 * scale, 2 * scale);
  g.fill(0x2d3748);
  g.circle(-8 * scale, 26 * scale, 5 * scale);
  g.fill(0x1a1a1a);
  g.circle(8 * scale, 26 * scale, 5 * scale);
  g.fill(0x1a1a1a);
}

function drawBarrier(g: PIXI.Graphics) {
  g.clear();
  g.roundRect(-20, -12, 40, 24, 2);
  g.fill(0x2563eb);
  g.stroke({ width: 1, color: 0x1d4ed8 });
  for (let i = 0; i < 4; i++) {
    g.rect(-18 + i * 10, -10, 8, 20);
    g.fill(i % 2 === 0 ? 0xffffff : 0x2563eb);
  }
}

function drawManhole(
  container: PIXI.Container,
  multiplier: number,
  state: LaneState,
) {
  container.removeChildren();
  const lit = state === "past" || state === "current";
  const isCurrent = state === "current";
  const isBust = state === "bust";

  if (lit) {
    const fire = new PIXI.Graphics();
    fire.ellipse(0, -8, isCurrent ? 36 : 28, isCurrent ? 16 : 12);
    fire.fill({ color: 0xff6b35, alpha: isCurrent ? 0.75 : 0.45 });
    container.addChild(fire);
    gsap.to(fire, {
      alpha: isCurrent ? 0.95 : 0.55,
      duration: isCurrent ? 0.4 : 0.6,
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut",
    });
  }

  const cover = new PIXI.Graphics();
  const radius = isCurrent ? 30 : 26;
  const fill = isBust
    ? 0x7f1d1d
    : isCurrent
      ? 0x1e3a5f
      : lit
        ? 0x2d3748
        : 0x252a35;
  const stroke = isBust
    ? 0xf87171
    : isCurrent
      ? 0x60a5fa
      : lit
        ? 0x3b82f6
        : 0xffffff;
  cover.circle(0, 0, radius);
  cover.fill(fill);
  cover.stroke({ width: 2, color: stroke, alpha: isCurrent ? 1 : 0.35 });
  for (const x of [-8, 0, 8]) {
    cover.roundRect(x - 2, -14, 4, 28, 1);
    cover.fill(0x1a1f28);
  }
  container.addChild(cover);

  const label = new PIXI.Text({
    text: `${multiplier.toFixed(2)}×`,
    style: {
      fontFamily: "monospace",
      fontSize: isCurrent ? 11 : 10,
      fontWeight: "900",
      fill: lit ? 0xffffff : 0x888888,
    },
  });
  label.anchor.set(0.5);
  container.addChild(label);

  if (isCurrent) {
    gsap.fromTo(
      container.scale,
      { x: 1, y: 1 },
      { x: 1.12, y: 1.12, duration: 0.35, yoyo: true, repeat: -1, ease: "sine.inOut" },
    );
  } else {
    container.scale.set(1);
  }
}

export class ChickenRoadRenderer {
  private app: PIXI.Application | null = null;
  private container: HTMLElement;
  private viewport = new PIXI.Container();
  private world = new PIXI.Container();
  private laneContainers: PIXI.Container[] = [];
  private chicken = new PIXI.Graphics();
  private chickenContainer = new PIXI.Container();
  private animSprite: PIXI.Container | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private lastCrossAnimKey = "";

  private crossAnimKey(anim: CrossAnim): string {
    if (!anim) return "";
    return `${anim.lane}:${anim.phase}:${anim.carDirection}`;
  }
  private ready = false;
  private state: ChickenRoadState | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    const app = new PIXI.Application();
    await app.init({
      background: 0x141a28,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });

    this.app = app;
    this.container.innerHTML = "";
    this.container.appendChild(app.canvas as HTMLCanvasElement);

    this.viewport.addChild(this.world);
    app.stage.addChild(this.viewport);

    this.chickenContainer.addChild(this.chicken);
    drawChicken(this.chicken, 1.1);
    this.world.addChild(this.chickenContainer);

    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.ready = true;

    if (this.state) this.renderState(this.state);
  }

  updateState(state: ChickenRoadState) {
    if (this.ready) this.renderState(state);
    else this.state = state;
  }

  private resize() {
    if (!this.app) return;
    const w = this.container.clientWidth || 800;
    const h = Math.min(500, Math.max(340, this.container.clientHeight || 500));
    this.app.renderer.resize(w, h);
    this.viewport.scale.set(1);
    if (this.state) this.positionCamera(this.state, false);
  }

  private renderState(state: ChickenRoadState) {
    if (!this.app) return;

    const rebuild = this.needsLaneRebuild(state);
    if (rebuild) this.buildLanes(state);
    this.positionChicken(state);
    this.positionCamera(state, true);
    this.handleCrossAnim(state.crossAnim);
    this.lastCrossAnimKey = this.crossAnimKey(state.crossAnim);
    this.state = state;
  }

  private needsLaneRebuild(state: ChickenRoadState): boolean {
    const prev = this.state;
    if (!prev) return true;
    return (
      prev.lanes !== state.lanes ||
      prev.currentLane !== state.currentLane ||
      prev.status !== state.status ||
      prev.bustLane !== state.bustLane ||
      prev.bustHazard !== state.bustHazard ||
      prev.multipliers.length !== state.multipliers.length
    );
  }

  private buildLanes(state: ChickenRoadState) {
    const { lanes, multipliers } = state;
    const { laneWidth, sidewalkWidth, boardHeight, manholeY } = CHICKEN_ROAD_LAYOUT;

    while (this.laneContainers.length > lanes) {
      const rem = this.laneContainers.pop();
      if (rem) this.world.removeChild(rem);
    }

    for (let i = 0; i < lanes; i++) {
      let lane = this.laneContainers[i];
      if (!lane) {
        lane = new PIXI.Container();
        this.laneContainers.push(lane);
        this.world.addChildAt(lane, i);
      }

      lane.removeChildren();
      lane.x = sidewalkWidth + i * laneWidth + laneWidth / 2;
      lane.y = 0;

      const laneState = laneStateFor(i, state);
      const alpha = state.status === "idle" ? 0.92 : laneState === "future" ? 0.45 : 1;
      lane.alpha = alpha;

      const road = new PIXI.Graphics();
      road.rect(-laneWidth / 2, 40, laneWidth, boardHeight - 112);
      road.fill(0x4a5568);
      road.stroke({ width: 1, color: 0x5a6578, alpha: 0.8 });
      road.moveTo(0, 52);
      road.lineTo(0, boardHeight - 120);
      road.stroke({ width: 1, color: 0xffffff, alpha: 0.12 });
      if (laneState === "current") {
        road.rect(-laneWidth / 2, 40, laneWidth, boardHeight - 112);
        road.stroke({ width: 2, color: 0x3b82f6, alpha: 0.55 });
      }
      lane.addChild(road);

      const manhole = new PIXI.Container();
      manhole.y = manholeY;
      drawManhole(manhole, multipliers[i] ?? 1, laneState);
      lane.addChild(manhole);

      if (state.bustLane === i && state.status === "lost") {
        const bustMark = new PIXI.Text({
          text: "✕",
          style: { fontSize: 28, fontWeight: "900", fill: 0xf87171 },
        });
        bustMark.anchor.set(0.5);
        bustMark.y = 180;
        lane.addChild(bustMark);
        gsap.fromTo(bustMark.scale, { x: 0.5, y: 0.5 }, { x: 1.2, y: 1.2, duration: 0.25, yoyo: true, repeat: 3 });
      }
    }

    this.drawSidewalk(state);
    this.drawSkyline();
  }

  private drawSkyline() {
    const existing = this.world.getChildByName("skyline");
    if (existing) return;

    const skyline = new PIXI.Container();
    skyline.name = "skyline";
    skyline.zIndex = -10;

    const bg = new PIXI.Graphics();
    bg.rect(0, 0, 4000, 140);
    bg.fill({ color: 0x12182a, alpha: 1 });
    skyline.addChild(bg);

    const heights = [28, 40, 32, 52, 36, 48];
    [0.05, 0.18, 0.32, 0.48, 0.64, 0.78].forEach((left, i) => {
      const b = new PIXI.Graphics();
      const w = 56 + (i % 3) * 24;
      const h = heights[i];
      b.roundRect(left * 4000, 140 - h, w, h, 4);
      b.fill({ color: 0x161c2e, alpha: 0.6 + (i % 2) * 0.15 });
      b.stroke({ width: 1, color: 0xffffff, alpha: 0.05 });
      skyline.addChild(b);
    });

    this.world.addChildAt(skyline, 0);
    this.world.sortableChildren = true;
  }

  private drawSidewalk(state: ChickenRoadState) {
    let sidewalk = this.world.getChildByName("sidewalk") as PIXI.Container | null;
    if (!sidewalk) {
      sidewalk = new PIXI.Container();
      sidewalk.name = "sidewalk";
      this.world.addChild(sidewalk);
    }
    sidewalk.removeChildren();

    const { sidewalkWidth, boardHeight } = CHICKEN_ROAD_LAYOUT;
    const pad = new PIXI.Graphics();
    pad.rect(0, 0, sidewalkWidth, boardHeight);
    pad.fill(0x5a6578);
    pad.stroke({ width: 1, color: 0xffffff, alpha: 0.1 });
    sidewalk.addChild(pad);

    const light = new PIXI.Graphics();
    const active =
      state.status === "active" ? "green" : state.status === "lost" ? "red" : "yellow";
    const colors = { red: 0xfc8181, yellow: 0xf6e05e, green: 0x68d391 };
    const dim = { red: 0x3d1a1a, yellow: 0x3d3d1a, green: 0x1a3d2a };
    light.roundRect(sidewalkWidth / 2 - 6, 16, 12, 52, 4);
    light.fill(0x2d3748);
    [16, 34, 52].forEach((y, idx) => {
      const key = (["red", "yellow", "green"] as const)[idx];
      light.circle(sidewalkWidth / 2, y, 5);
      light.fill(active === key ? colors[key] : dim[key]);
    });
    sidewalk.addChild(light);

    const bush = new PIXI.Graphics();
    bush.circle(sidewalkWidth / 2, 90, 22);
    bush.fill(0x276749);
    bush.stroke({ width: 2, color: 0x22543d });
    sidewalk.addChild(bush);

    for (let i = 0; i < 8; i++) {
      const stripe = new PIXI.Graphics();
      stripe.roundRect(20, boardHeight - 120 + i * 10, sidewalkWidth - 40, 4, 2);
      stripe.fill(0xffffff);
      sidewalk.addChild(stripe);
    }

    const start = new PIXI.Text({
      text: "START",
      style: { fontSize: 8, fontWeight: "900", fill: 0xffffff, letterSpacing: 2 },
    });
    start.alpha = 0.35;
    start.anchor.set(0.5);
    start.x = sidewalkWidth / 2;
    start.y = boardHeight - 24;
    sidewalk.addChild(start);
  }

  private positionChicken(state: ChickenRoadState) {
    const { laneWidth, sidewalkWidth, chickenY } = CHICKEN_ROAD_LAYOUT;
    const onSidewalk = state.status === "active" && state.currentLane === 0;
    const chickenLane =
      state.status === "active" && state.currentLane > 0
        ? state.currentLane - 1
        : state.status === "won" || state.status === "lost"
          ? Math.max(0, state.currentLane - 1)
          : -1;

    this.chickenContainer.visible = state.chickenVisible;
    if (!state.chickenVisible) return;

    const targetX = onSidewalk
      ? sidewalkWidth / 2
      : chickenLane >= 0
        ? sidewalkWidth + chickenLane * laneWidth + laneWidth / 2
        : sidewalkWidth / 2;
    const targetY = onSidewalk ? chickenY + 20 : chickenY;

    gsap.to(this.chickenContainer, {
      x: targetX,
      y: targetY,
      duration: 0.5,
      ease: "power2.out",
    });

    if (state.hopping) {
      gsap.fromTo(
        this.chickenContainer,
        { y: targetY + 18 },
        { y: targetY, duration: 0.45, ease: "back.out(2)" },
      );
    }

    if (onSidewalk && state.chickenVisible) {
      gsap.fromTo(
        this.chickenContainer.scale,
        { x: 0.3, y: 0.3 },
        { x: 1, y: 1, duration: 0.45, ease: "back.out(2)" },
      );
    }
  }

  private positionCamera(state: ChickenRoadState, animate: boolean) {
    if (!this.app) return;
    const { laneWidth, sidewalkWidth } = CHICKEN_ROAD_LAYOUT;
    const onSidewalk = state.status === "active" && state.currentLane === 0;
    const chickenLane =
      state.status === "active" && state.currentLane > 0
        ? state.currentLane - 1
        : state.status === "won" || state.status === "lost"
          ? Math.max(0, state.currentLane - 1)
          : -1;

    let targetX = 0;
    if (!onSidewalk && chickenLane >= 0 && state.chickenVisible) {
      const chickenWorldX = sidewalkWidth + chickenLane * laneWidth + laneWidth / 2;
      targetX = Math.max(0, chickenWorldX - this.app.screen.width / 2);
    }

    if (animate) {
      gsap.to(this.world, { x: -targetX, duration: 0.55, ease: "power2.out" });
    } else {
      this.world.x = -targetX;
    }
  }

  private clearAnimSprite() {
    if (this.animSprite) {
      this.world.removeChild(this.animSprite);
      this.animSprite.destroy({ children: true });
      this.animSprite = null;
    }
  }

  private handleCrossAnim(crossAnim: CrossAnim) {
    const key = this.crossAnimKey(crossAnim);
    if (!crossAnim || key === this.lastCrossAnimKey) return;
    this.clearAnimSprite();

    const { laneWidth, sidewalkWidth } = CHICKEN_ROAD_LAYOUT;
    const laneX = sidewalkWidth + crossAnim.lane * laneWidth + laneWidth / 2;
    const container = new PIXI.Container();
    container.x = laneX;
    this.animSprite = container;
    this.world.addChild(container);

    if (crossAnim.phase === "car-down" || crossAnim.phase === "car-up") {
      const car = new PIXI.Graphics();
      drawCar(car, CAR_COLORS[crossAnim.lane % CAR_COLORS.length], crossAnim.lane);
      container.addChild(car);
      const fromY = crossAnim.phase === "car-down" ? -60 : 360;
      const toY = crossAnim.phase === "car-down" ? 360 : -60;
      car.y = fromY;
      gsap.to(car, {
        y: toY,
        duration: 0.85,
        ease: "power1.in",
        onComplete: () => this.clearAnimSprite(),
      });
    }

    if (crossAnim.phase === "barrier") {
      const barrier = new PIXI.Graphics();
      drawBarrier(barrier);
      barrier.y = 160;
      barrier.scale.set(0.2);
      container.addChild(barrier);
      gsap.to(barrier.scale, { x: 1, y: 1, duration: 0.35, ease: "back.out(2.5)" });
      gsap.to(container, {
        x: laneX + 4,
        duration: 0.05,
        yoyo: true,
        repeat: 5,
        onComplete: () => this.clearAnimSprite(),
      });
    }

    if (crossAnim.phase === "manhole-fire") {
      for (let i = 0; i < 12; i++) {
        const p = new PIXI.Graphics();
        p.circle(0, 0, 3 + Math.random() * 4);
        p.fill({ color: 0xff4500, alpha: 0.9 });
        p.x = (Math.random() - 0.5) * 30;
        p.y = 300;
        container.addChild(p);
        gsap.to(p, {
          y: 260 - Math.random() * 40,
          x: p.x + (Math.random() - 0.5) * 40,
          alpha: 0,
          duration: 0.5 + Math.random() * 0.3,
          ease: "power2.out",
        });
      }
      gsap.delayedCall(0.9, () => this.clearAnimSprite());
    }

    if (crossAnim.phase === "done" && this.state?.bustHazard === "car") {
      const car = new PIXI.Graphics();
      drawCar(car, 0xe74c3c, 0);
      car.y = 180;
      container.addChild(car);
      gsap.to(container, {
        x: laneX + 6,
        duration: 0.08,
        yoyo: true,
        repeat: 5,
      });
    }
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.clearAnimSprite();
    gsap.killTweensOf(this.world);
    gsap.killTweensOf(this.chickenContainer);
    if (this.app) {
      this.app.destroy(true, { children: true });
      this.app = null;
    }
    this.container.innerHTML = "";
    this.ready = false;
  }
}
