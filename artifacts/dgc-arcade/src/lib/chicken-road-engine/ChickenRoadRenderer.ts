import * as PIXI from "pixi.js";
import { gsap } from "gsap";
import {
  CHICKEN_ROAD_LAYOUT,
  type ChickenRoadState,
  type CrossAnim,
  type LaneState,
} from "./types";

/** Stake.us Chicken palette */
const STAKE = {
  sky: 0x0f2530,
  skyGlow: 0x1a4a5c,
  road: 0x3d5163,
  roadEdge: 0x4a6275,
  sidewalk: 0x5a6d7a,
  grass: 0x2d6a4f,
  moon: 0xe8eef5,
  manhole: 0x2a3544,
  manholeLit: 0x1e3a5f,
  manholeRing: 0x4a9eff,
  fire: 0xff6b35,
} as const;

const CAR_COLORS = [0xe74c3c, 0x3498db, 0x9b59b6, 0xf1c40f, 0x2ecc71, 0xe67e22];

function laneStateFor(laneIndex: number, state: ChickenRoadState): LaneState {
  const { currentLane, status, bustLane } = state;
  if (status === "idle") return "future";
  if (laneIndex < currentLane) return "past";
  if (laneIndex === currentLane && status === "active") return "current";
  if (bustLane === laneIndex && status === "lost") return "bust";
  return "future";
}

function drawChicken(g: PIXI.Graphics, scale = 1) {
  g.clear();
  g.ellipse(0, 30 * scale, 14 * scale, 4 * scale);
  g.fill({ color: 0x000000, alpha: 0.3 });
  g.roundRect(-18 * scale, 10 * scale, 36 * scale, 30 * scale, 16 * scale);
  g.fill(0xffffff);
  g.circle(0, -10 * scale, 15 * scale);
  g.fill(0xffffff);
  g.moveTo(-12 * scale, -24 * scale);
  g.lineTo(-9 * scale, -32 * scale);
  g.lineTo(-5 * scale, -22 * scale);
  g.lineTo(0, -34 * scale);
  g.lineTo(5 * scale, -22 * scale);
  g.lineTo(9 * scale, -32 * scale);
  g.lineTo(12 * scale, -24 * scale);
  g.fill(0xe53e3e);
  g.moveTo(0, -4 * scale);
  g.lineTo(-7 * scale, 4 * scale);
  g.lineTo(0, 1 * scale);
  g.lineTo(7 * scale, 4 * scale);
  g.fill(0xf6ad55);
  g.circle(-7 * scale, -12 * scale, 3 * scale);
  g.fill(0x111111);
  g.circle(7 * scale, -12 * scale, 3 * scale);
  g.fill(0x111111);
  g.circle(13 * scale, -8 * scale, 6 * scale);
  g.fill({ color: 0xff6b6b, alpha: 0.45 });
}

function drawCar(g: PIXI.Graphics, color: number, variant: number, scale = 1) {
  g.clear();
  const truck = variant % 3 === 2;
  const suv = variant % 3 === 1;
  const darken = (c: number, f = 0.85) => {
    const r = ((c >> 16) & 0xff) * f;
    const gr = ((c >> 8) & 0xff) * f;
    const b = (c & 0xff) * f;
    return (r << 16) | (gr << 8) | b;
  };

  if (truck) {
    g.roundRect(-14 * scale, -28 * scale, 28 * scale, 32 * scale, 4 * scale);
    g.fill(color);
    g.roundRect(-12 * scale, -24 * scale, 24 * scale, 12 * scale, 2 * scale);
    g.fill({ color: 0x111827, alpha: 0.55 });
    g.roundRect(-16 * scale, 2 * scale, 32 * scale, 18 * scale, 3 * scale);
    g.fill(darken(color));
    g.roundRect(-14 * scale, 18 * scale, 28 * scale, 6 * scale, 2 * scale);
    g.fill(0x2d3748);
    g.circle(-9 * scale, 26 * scale, 5.5 * scale);
    g.fill(0x111111);
    g.circle(9 * scale, 26 * scale, 5.5 * scale);
    g.fill(0x111111);
    g.roundRect(10 * scale, 4 * scale, 3 * scale, 4 * scale, 1);
    g.fill(0xfbbf24);
    return;
  }

  const bodyH = suv ? 36 : 34;
  g.roundRect(-14 * scale, -20 * scale, 28 * scale, bodyH * scale, (suv ? 7 : 6) * scale);
  g.fill(color);
  g.roundRect(-11 * scale, -16 * scale, 22 * scale, 12 * scale, 3 * scale);
  g.fill({ color: 0x1a2438, alpha: 0.75 });
  g.roundRect(-12 * scale, 14 * scale, 24 * scale, 8 * scale, 2 * scale);
  g.fill(0x1f2937);
  g.circle(-8 * scale, 24 * scale, 5.5 * scale);
  g.fill(0x111111);
  g.circle(8 * scale, 24 * scale, 5.5 * scale);
  g.fill(0x111111);
  g.circle(-8 * scale, 24 * scale, 2 * scale);
  g.fill(0x718096);
  g.circle(8 * scale, 24 * scale, 2 * scale);
  g.fill(0x718096);
  g.roundRect(10 * scale, -2 * scale, 3 * scale, 5 * scale, 1);
  g.fill(0xfde68a);
  g.ellipse(0, -18 * scale, 8 * scale, 2 * scale);
  g.fill({ color: 0xffffff, alpha: 0.12 });
}

function drawBarrier(g: PIXI.Graphics) {
  g.clear();
  g.roundRect(-22, -14, 44, 28, 3);
  g.fill(0x2563eb);
  g.stroke({ width: 2, color: 0x1d4ed8 });
  for (let i = 0; i < 4; i++) {
    g.rect(-20 + i * 11, -12, 9, 24);
    g.fill(i % 2 === 0 ? 0xffffff : 0x2563eb);
  }
}

function drawManhole(container: PIXI.Container, multiplier: number, state: LaneState, gameActive = true) {
  container.removeChildren();
  const lit = state === "past" || state === "current";
  const isCurrent = state === "current";
  const isBust = state === "bust";
  const showEmber = gameActive && (state === "future" || state === "idle" || lit);

  if (showEmber) {
    const glow = new PIXI.Graphics();
    const glowR = isCurrent ? 38 : lit ? 32 : 26;
    glow.circle(0, 0, glowR);
    glow.fill({ color: STAKE.fire, alpha: isCurrent ? 0.38 : lit ? 0.22 : 0.12 });
    container.addChild(glow);
    const fire = new PIXI.Graphics();
    const fw = isCurrent ? 40 : lit ? 30 : 22;
    const fh = isCurrent ? 18 : lit ? 14 : 10;
    fire.ellipse(0, -10, fw, fh);
    fire.fill({ color: STAKE.fire, alpha: isCurrent ? 0.85 : lit ? 0.5 : 0.28 });
    container.addChild(fire);
    gsap.to(fire.scale, {
      x: isCurrent ? 1.2 : 1.1,
      y: isCurrent ? 1.2 : 1.1,
      duration: isCurrent ? 0.32 : 0.55,
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut",
    });
    if (isCurrent) {
      for (let s = 0; s < 4; s++) {
        const spark = new PIXI.Graphics();
        spark.circle(0, 0, 2);
        spark.fill({ color: 0xffcc00, alpha: 0.9 });
        spark.x = (Math.random() - 0.5) * 20;
        spark.y = -14;
        container.addChild(spark);
        gsap.to(spark, {
          y: -28 - Math.random() * 12,
          x: spark.x + (Math.random() - 0.5) * 16,
          alpha: 0,
          duration: 0.5 + Math.random() * 0.3,
          repeat: -1,
          delay: s * 0.15,
          ease: "power2.out",
        });
      }
    }
  }

  const cover = new PIXI.Graphics();
  const radius = isCurrent ? 32 : 28;
  cover.circle(0, 0, radius);
  cover.fill(isBust ? 0x7f1d1d : lit ? STAKE.manholeLit : STAKE.manhole);
  cover.stroke({
    width: isCurrent ? 3 : 2,
    color: isBust ? 0xf87171 : lit ? STAKE.manholeRing : 0x4b5563,
    alpha: 1,
  });
  for (const x of [-9, 0, 9]) {
    cover.roundRect(x - 2, -16, 4, 32, 1);
    cover.fill(0x111827);
  }
  container.addChild(cover);

  const label = new PIXI.Text({
    text: `${multiplier.toFixed(2)}×`,
    style: {
      fontFamily: "system-ui, sans-serif",
      fontSize: isCurrent ? 12 : 10,
      fontWeight: "900",
      fill: lit ? 0xffffff : 0x9ca3af,
    },
  });
  label.anchor.set(0.5);
  container.addChild(label);
}

export class ChickenRoadRenderer {
  private app: PIXI.Application | null = null;
  private container: HTMLElement;
  private world = new PIXI.Container();
  private laneContainers: PIXI.Container[] = [];
  private chicken = new PIXI.Graphics();
  private chickenContainer = new PIXI.Container();
  private animSprite: PIXI.Container | null = null;
  private ambientCars: PIXI.Container[] = [];
  private resizeObserver: ResizeObserver | null = null;
  private lastCrossAnimKey = "";
  private ready = false;
  private state: ChickenRoadState | null = null;
  private initError: Error | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  getInitError(): Error | null {
    return this.initError;
  }

  async init(): Promise<void> {
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(Math.floor(rect.width || this.container.clientWidth || 640), 320);
    const height = Math.max(Math.floor(rect.height || this.container.clientHeight || 400), 280);

    const app = new PIXI.Application();
    try {
      await app.init({
        width,
        height,
        background: STAKE.sky,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
    } catch (err) {
      this.initError = err instanceof Error ? err : new Error(String(err));
      throw this.initError;
    }

    this.app = app;
    this.container.innerHTML = "";
    const canvas = app.canvas as HTMLCanvasElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    this.container.appendChild(canvas);

    app.stage.addChild(this.world);
    this.chickenContainer.addChild(this.chicken);
    drawChicken(this.chicken, 1.15);
    this.world.addChild(this.chickenContainer);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.ready = true;

    if (this.state) this.renderState(this.state);
    else this.renderState(this.defaultPreviewState());
  }

  private defaultPreviewState(): ChickenRoadState {
    return {
      lanes: 17,
      currentLane: 0,
      status: "idle",
      multipliers: [],
      hopping: false,
      chickenVisible: true,
      crossAnim: null,
      previewMode: true,
    };
  }

  private killLaneTweens() {
    this.laneContainers.forEach(lane => gsap.killTweensOf(lane));
    gsap.killTweensOf(this.chickenContainer);
    gsap.killTweensOf(this.chickenContainer.scale);
    this.ambientCars.forEach(c => gsap.killTweensOf(c));
  }

  updateState(state: ChickenRoadState) {
    try {
      if (this.ready) this.renderState(state);
      else this.state = state;
    } catch (err) {
      console.error("Chicken Road render error:", err);
      throw err;
    }
  }

  private resize() {
    if (!this.app) return;
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(Math.floor(rect.width), 320);
    const h = Math.max(Math.floor(rect.height), 280);
    this.app.renderer.resize(w, h);
    if (this.state) {
      this.positionCamera(this.state, false);
      this.drawSkyline(this.state);
    }
  }

  private renderState(state: ChickenRoadState) {
    if (!this.app) return;

    const rebuild = this.needsLaneRebuild(state);
    if (rebuild) {
      this.killLaneTweens();
      this.buildLanes(state);
      this.drawSkyline(state);
    }
    if (rebuild || this.ambientCars.length !== state.lanes) {
      this.startAmbientTraffic(state.lanes);
    }
    this.positionChicken(state);
    this.positionCamera(state, true);
    this.handleCrossAnim(state.crossAnim);
    this.lastCrossAnimKey = this.crossAnimKey(state.crossAnim);
    this.state = state;
  }

  private crossAnimKey(anim: CrossAnim): string {
    if (!anim) return "";
    return `${anim.lane}:${anim.phase}:${anim.carDirection}`;
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
      prev.multipliers.length !== state.multipliers.length ||
      prev.previewMode !== state.previewMode
    );
  }

  private buildLanes(state: ChickenRoadState) {
    const { lanes, multipliers } = state;
    const { laneWidth, sidewalkWidth, boardHeight, manholeY } = CHICKEN_ROAD_LAYOUT;
    const boardH = Math.min(boardHeight, (this.app?.screen.height ?? boardHeight) - 8);

    while (this.laneContainers.length > lanes) {
      const rem = this.laneContainers.pop();
      if (rem) this.world.removeChild(rem);
    }

    for (let i = 0; i < lanes; i++) {
      let lane = this.laneContainers[i];
      if (!lane) {
        lane = new PIXI.Container();
        this.laneContainers.push(lane);
        this.world.addChild(lane);
      }

      lane.removeChildren();
      lane.x = sidewalkWidth + i * laneWidth + laneWidth / 2;
      lane.y = 0;

      const laneState = laneStateFor(i, state);
      lane.alpha = state.status === "idle" ? 1 : laneState === "future" ? 0.5 : 1;

      const road = new PIXI.Graphics();
      road.rect(-laneWidth / 2, 36, laneWidth, boardH - 100);
      road.fill(STAKE.road);
      road.stroke({ width: 1, color: STAKE.roadEdge, alpha: 0.9 });
      road.moveTo(0, 48);
      road.lineTo(0, boardH - 108);
      road.stroke({ width: 1, color: 0xffffff, alpha: 0.15 });
      if (laneState === "current") {
        road.rect(-laneWidth / 2, 36, laneWidth, boardH - 100);
        road.stroke({ width: 2, color: STAKE.manholeRing, alpha: 0.7 });
      }
      lane.addChild(road);

      const mult = multipliers[i] ?? 1;
      const manhole = new PIXI.Container();
      manhole.y = Math.min(manholeY, boardH - 72);
      drawManhole(manhole, mult, laneState, state.status === "idle" || state.status === "active");
      lane.addChild(manhole);

      if (state.bustLane === i && state.status === "lost") {
        const bust = new PIXI.Text({
          text: "✕",
          style: { fontSize: 32, fontWeight: "900", fill: 0xf87171 },
        });
        bust.anchor.set(0.5);
        bust.y = boardH * 0.42;
        lane.addChild(bust);
      }
    }

    this.drawSidewalk(state, boardH);
    this.drawGrassStrip(boardH);
  }

  private drawGrassStrip(boardH: number) {
    let grass = this.world.getChildByName("grass") as PIXI.Container | null;
    if (!grass) {
      grass = new PIXI.Container();
      grass.name = "grass";
      this.world.addChildAt(grass, 0);
    }
    grass.removeChildren();
    const g = new PIXI.Graphics();
    g.rect(-40, 36, 36, boardH - 100);
    g.fill(STAKE.grass);
    for (let i = 0; i < 5; i++) {
      g.circle(-22, 80 + i * 55, 14 + (i % 2) * 6);
      g.fill({ color: 0x22543d, alpha: 0.85 });
    }
    grass.addChild(g);
  }

  private drawSkyline(state: ChickenRoadState) {
    let sky = this.world.getChildByName("sky") as PIXI.Container | null;
    if (!sky) {
      sky = new PIXI.Container();
      sky.name = "sky";
      sky.zIndex = -20;
      this.world.sortableChildren = true;
      this.world.addChildAt(sky, 0);
    }
    sky.removeChildren();

    const w = Math.max((this.app?.screen.width ?? 800) + 800, state.lanes * 80 + 200);
    const h = this.app?.screen.height ?? 500;

    const bg = new PIXI.Graphics();
    bg.rect(-200, 0, w, h);
    bg.fill(STAKE.sky);
    bg.rect(-200, 0, w, h * 0.5);
    bg.fill({ color: STAKE.skyGlow, alpha: 0.45 });
    sky.addChild(bg);

    const moon = new PIXI.Graphics();
    moon.circle(w * 0.75, 48, 22);
    moon.fill(STAKE.moon);
    moon.circle(w * 0.75 - 8, 42, 20);
    moon.fill({ color: STAKE.skyGlow, alpha: 0.35 });
    sky.addChild(moon);

    for (let i = 0; i < 24; i++) {
      const star = new PIXI.Graphics();
      star.circle((i * 97) % w, 20 + (i * 43) % 80, 1 + (i % 2));
      star.fill({ color: 0xffffff, alpha: 0.25 + (i % 3) * 0.15 });
      sky.addChild(star);
    }
  }

  private drawSidewalk(state: ChickenRoadState, boardH: number) {
    let sidewalk = this.world.getChildByName("sidewalk") as PIXI.Container | null;
    if (!sidewalk) {
      sidewalk = new PIXI.Container();
      sidewalk.name = "sidewalk";
      this.world.addChild(sidewalk);
    }
    sidewalk.removeChildren();

    const { sidewalkWidth } = CHICKEN_ROAD_LAYOUT;
    const pad = new PIXI.Graphics();
    pad.rect(0, 0, sidewalkWidth, boardH);
    pad.fill(STAKE.sidewalk);
    pad.stroke({ width: 1, color: 0xffffff, alpha: 0.12 });
    sidewalk.addChild(pad);

    const activeLight =
      state.status === "active" ? "green" : state.status === "lost" ? "red" : "yellow";
    const light = new PIXI.Graphics();
    light.roundRect(sidewalkWidth / 2 - 7, 14, 14, 58, 4);
    light.fill(0x1f2937);
    const lightOn: Record<string, number> = { red: 0xfc8181, yellow: 0xf6e05e, green: 0x68d391 };
    const lightOff: Record<string, number> = { red: 0x3d1a1a, yellow: 0x3d3d1a, green: 0x1a3d2a };
    ([16, 36, 56] as const).forEach((y, idx) => {
      const keys = ["red", "yellow", "green"] as const;
      const key = keys[idx];
      light.circle(sidewalkWidth / 2, y, 6);
      light.fill(activeLight === key ? lightOn[key] : lightOff[key]);
    });
    sidewalk.addChild(light);

    for (let i = 0; i < 9; i++) {
      const stripe = new PIXI.Graphics();
      stripe.roundRect(18, boardH - 130 + i * 11, sidewalkWidth - 36, 5, 2);
      stripe.fill(0xffffff);
      sidewalk.addChild(stripe);
    }

    const start = new PIXI.Text({
      text: "START",
      style: { fontSize: 9, fontWeight: "900", fill: 0xffffff, letterSpacing: 3 },
    });
    start.alpha = 0.4;
    start.anchor.set(0.5);
    start.x = sidewalkWidth / 2;
    start.y = boardH - 20;
    sidewalk.addChild(start);
  }

  private startAmbientTraffic(lanes: number) {
    this.ambientCars.forEach(c => {
      gsap.killTweensOf(c);
      this.world.removeChild(c);
      c.destroy({ children: true });
    });
    this.ambientCars = [];

    const { laneWidth, sidewalkWidth } = CHICKEN_ROAD_LAYOUT;
    const boardH = this.app?.screen.height ?? 500;

    for (let i = 0; i < lanes; i++) {
      const carWrap = new PIXI.Container();
      const car = new PIXI.Graphics();
      drawCar(car, CAR_COLORS[i % CAR_COLORS.length], i + 2, 0.88);
      carWrap.addChild(car);
      carWrap.x = sidewalkWidth + i * laneWidth + laneWidth / 2;
      const goingDown = i % 2 === 0;
      carWrap.y = goingDown ? -90 - (i % 4) * 30 : boardH + 50 + (i % 3) * 25;
      carWrap.alpha = 0.62;
      this.world.addChild(carWrap);
      this.ambientCars.push(carWrap);

      const duration = 2.1 + (i % 5) * 0.38;
      const delay = (i * 0.38) % duration;
      gsap.to(carWrap, {
        y: goingDown ? boardH + 70 : -90,
        duration,
        repeat: -1,
        delay,
        ease: "none",
      });
    }
  }

  private positionChicken(state: ChickenRoadState) {
    const { laneWidth, sidewalkWidth, chickenY } = CHICKEN_ROAD_LAYOUT;
    const boardH = this.app?.screen.height ?? CHICKEN_ROAD_LAYOUT.boardHeight;
    const onSidewalk =
      (state.status === "active" && state.currentLane === 0) ||
      (state.status === "idle" && !!state.previewMode);
    const chickenLane =
      state.status === "active" && state.currentLane > 0
        ? state.currentLane - 1
        : state.status === "won" || state.status === "lost"
          ? Math.max(0, state.currentLane - 1)
          : -1;

    const showChicken = state.chickenVisible || (state.status === "idle" && !!state.previewMode);
    this.chickenContainer.visible = showChicken;
    if (!showChicken) return;

    const yBase = Math.min(chickenY, boardH - 80);
    const targetX = onSidewalk
      ? sidewalkWidth / 2
      : chickenLane >= 0
        ? sidewalkWidth + chickenLane * laneWidth + laneWidth / 2
        : sidewalkWidth / 2;
    const targetY = onSidewalk ? yBase + 16 : yBase;

    gsap.to(this.chickenContainer, { x: targetX, y: targetY, duration: 0.5, ease: "power2.out" });

    if (state.hopping) {
      gsap.fromTo(
        this.chickenContainer,
        { y: targetY + 20 },
        { y: targetY, duration: 0.45, ease: "back.out(2)" },
      );
    }
  }

  private positionCamera(state: ChickenRoadState, animate: boolean) {
    if (!this.app) return;
    const { laneWidth, sidewalkWidth } = CHICKEN_ROAD_LAYOUT;
    const onSidewalk =
      (state.status === "active" && state.currentLane === 0) ||
      (state.status === "idle" && !!state.previewMode);
    const chickenLane =
      state.status === "active" && state.currentLane > 0
        ? state.currentLane - 1
        : state.status === "won" || state.status === "lost"
          ? Math.max(0, state.currentLane - 1)
          : -1;

    let targetX = 0;
    const showChicken = state.chickenVisible || (state.status === "idle" && !!state.previewMode);
    if (!onSidewalk && chickenLane >= 0 && showChicken) {
      const chickenWorldX = sidewalkWidth + chickenLane * laneWidth + laneWidth / 2;
      targetX = Math.max(0, chickenWorldX - this.app.screen.width / 2);
    }

    if (animate) gsap.to(this.world, { x: -targetX, duration: 0.55, ease: "power2.out" });
    else this.world.x = -targetX;
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
    const boardH = this.app?.screen.height ?? 500;

    if (crossAnim.phase === "car-down" || crossAnim.phase === "car-up") {
      const car = new PIXI.Graphics();
      drawCar(car, CAR_COLORS[crossAnim.lane % CAR_COLORS.length], crossAnim.lane);
      container.addChild(car);
      const fromY = crossAnim.phase === "car-down" ? -70 : boardH + 20;
      const toY = crossAnim.phase === "car-down" ? boardH + 20 : -70;
      car.y = fromY;
      gsap.to(car, { y: toY, duration: 0.85, ease: "power1.in", onComplete: () => this.clearAnimSprite() });
    }

    if (crossAnim.phase === "barrier") {
      const barrier = new PIXI.Graphics();
      drawBarrier(barrier);
      barrier.y = boardH * 0.38;
      barrier.scale.set(0.15);
      container.addChild(barrier);
      gsap.to(barrier.scale, { x: 1, y: 1, duration: 0.35, ease: "back.out(2.5)" });
      gsap.to(container, { x: laneX + 5, duration: 0.05, yoyo: true, repeat: 5, onComplete: () => this.clearAnimSprite() });
    }

    if (crossAnim.phase === "manhole-fire") {
      for (let i = 0; i < 16; i++) {
        const p = new PIXI.Graphics();
        p.circle(0, 0, 3 + Math.random() * 5);
        p.fill({ color: 0xff4500, alpha: 0.95 });
        p.x = (Math.random() - 0.5) * 36;
        p.y = boardH - 90;
        container.addChild(p);
        gsap.to(p, {
          y: boardH - 130 - Math.random() * 50,
          x: p.x + (Math.random() - 0.5) * 50,
          alpha: 0,
          duration: 0.45 + Math.random() * 0.35,
          ease: "power2.out",
        });
      }
      gsap.delayedCall(0.85, () => this.clearAnimSprite());
    }

    if (crossAnim.phase === "done" && this.state?.bustHazard === "car") {
      const car = new PIXI.Graphics();
      drawCar(car, 0xe74c3c, 0);
      car.y = boardH * 0.4;
      container.addChild(car);
      gsap.to(container, { x: laneX + 8, duration: 0.08, yoyo: true, repeat: 5 });
    }
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.clearAnimSprite();
    this.killLaneTweens();
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
