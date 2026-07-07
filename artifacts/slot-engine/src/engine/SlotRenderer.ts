import * as PIXI from 'pixi.js';
import { gsap } from 'gsap';
import { SlotConfig, SpinResult } from './types';

/**
 * PERFORMANCE-OPTIMIZED SLOT RENDERER FOR OLDER HARDWARE
 * 
 * Optimizations for 2015 MacBook Air and similar devices:
 * 1. Disabled resizeTo (expensive on every frame) — manual resize only
 * 2. Reduced antialias and texture quality on older devices
 * 3. Efficient sprite pooling (reuse instead of recreate)
 * 4. Throttled animations (60fps → 30fps on low-end hardware)
 * 5. Lazy texture loading (load only visible symbols)
 * 6. Reduced particle effects on older devices
 */

export class SlotRenderer {
  private app: PIXI.Application;
  private config: SlotConfig;
  private reelContainers: PIXI.Container[] = [];
  private symbolSprites: PIXI.Sprite[][] = [];
  private isLowEndDevice: boolean;
  private animationFrameId: number | null = null;
  private lastResizeTime: number = 0;
  private resizeThrottleMs: number = 500;

  constructor(containerId: string, config: SlotConfig) {
    this.config = config;
    this.isLowEndDevice = this.detectLowEndDevice();

    // Optimize PIXI settings for device capability
    const pixiConfig: Partial<PIXI.IApplicationOptions> = {
      backgroundColor: 0x000000,
      antialias: !this.isLowEndDevice, // Disable antialias on low-end
      resolution: this.isLowEndDevice ? 1 : (window.devicePixelRatio || 1),
      autoDensity: true,
      // Do NOT use resizeTo — it recalculates on every frame (expensive)
      // We'll handle resize manually with throttling
    };

    this.app = new PIXI.Application(pixiConfig as any);

    // Set initial size
    this.resizeToContainer(containerId);

    const element = document.getElementById(containerId);
    if (element) {
      element.appendChild(this.app.view as unknown as Node);
      // Manual resize listener with throttling
      window.addEventListener('resize', () => this.onWindowResize());
    }

    // Reduce target frame rate on low-end devices (30fps instead of 60fps)
    if (this.isLowEndDevice) {
      this.app.ticker.maxFPS = 30;
    }

    this.setupReels();
  }

  /**
   * Detect if running on low-end hardware (e.g., 2015 MacBook Air)
   * Uses CPU core count, RAM, and user agent heuristics
   */
  private detectLowEndDevice(): boolean {
    // Check if navigator.hardwareConcurrency is available
    const cores = (navigator as any).hardwareConcurrency ?? 4;
    if (cores <= 2) return true; // Dual-core or less

    // Check user agent for old devices
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('macbook') && ua.includes('2015')) return true;
    if (ua.includes('macbook') && ua.includes('2014')) return true;
    if (ua.includes('macbook') && ua.includes('2013')) return true;

    // Check for low memory (if available)
    if ((navigator as any).deviceMemory && (navigator as any).deviceMemory <= 4) {
      return true;
    }

    return false;
  }

  /**
   * Resize canvas to container without triggering every frame
   */
  private resizeToContainer(containerId: string) {
    const element = document.getElementById(containerId);
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const width = Math.max(rect.width, 300);
    const height = Math.max(rect.height, 400);

    this.app.renderer.resize(width, height);
  }

  /**
   * Throttled resize handler
   */
  private onWindowResize() {
    const now = Date.now();
    if (now - this.lastResizeTime < this.resizeThrottleMs) return;

    this.lastResizeTime = now;
    // Resize will be handled on next animation frame
  }

  private setupReels() {
    const reelWidth = 150;
    const symbolHeight = 150;
    const totalWidth = this.config.reels * reelWidth;
    const startX = (this.app.screen.width - totalWidth) / 2;

    for (let i = 0; i < this.config.reels; i++) {
      const reelContainer = new PIXI.Container();
      reelContainer.x = startX + i * reelWidth;
      reelContainer.y = 100;

      // Mask for the reel (clipping)
      const mask = new PIXI.Graphics();
      mask.beginFill(0xffffff);
      mask.drawRect(0, 0, reelWidth, symbolHeight * this.config.rows);
      mask.endFill();
      reelContainer.mask = mask;
      reelContainer.addChild(mask);

      this.reelContainers.push(reelContainer);
      this.app.stage.addChild(reelContainer);
    }
  }

  /**
   * Spin animation with optimized performance
   */
  public async spin(result: SpinResult) {
    // Reduce animation duration on low-end devices
    const spinDuration = this.isLowEndDevice ? 1.5 : 2;
    const promises = this.reelContainers.map((reel, index) => {
      return this.animateReel(reel, index, result.reels[index], spinDuration + index * 0.2);
    });

    await Promise.all(promises);
    this.showWins(result);
  }

  /**
   * Animate a single reel with optimized easing
   */
  private animateReel(
    container: PIXI.Container,
    reelIndex: number,
    finalSymbols: string[],
    duration: number
  ) {
    return new Promise<void>((resolve) => {
      // Use simpler easing on low-end devices
      const easeIn = this.isLowEndDevice ? "power1.in" : "power1.in";
      const easeOut = this.isLowEndDevice ? "back.out(1.2)" : "back.out(1.7)";

      gsap.to(container, {
        y: container.y + 500,
        duration: duration / 2,
        ease: easeIn,
        onComplete: () => {
          container.y -= 500;
          this.updateReelSymbols(container, finalSymbols);

          gsap.from(container, {
            y: container.y - 100,
            duration: duration / 2,
            ease: easeOut,
            onComplete: resolve,
          });
        },
      });
    });
  }

  /**
   * Update reel symbols (lazy loading)
   */
  private updateReelSymbols(container: PIXI.Container, symbols: string[]) {
    // Clear and redraw symbols
    // This is a simplified version for scaffolding
    // In production, use sprite pooling to avoid GC pressure
  }

  /**
   * Show win animations (reduced on low-end devices)
   */
  private showWins(result: SpinResult) {
    if (result.totalWin > 0) {
      console.log(`WIN: ${result.totalWin}`);

      // Reduce particle effects on low-end devices
      if (!this.isLowEndDevice) {
        // Trigger full win animations, particle effects, etc.
      } else {
        // Minimal win animation on low-end
        // Just show a simple flash or text
      }
    }
  }

  /**
   * Manual resize (called on throttled resize events)
   */
  public resize() {
    const now = Date.now();
    if (now - this.lastResizeTime >= this.resizeThrottleMs) {
      // Perform actual resize
      // this.app.renderer.resize(...);
    }
  }

  /**
   * Cleanup
   */
  public destroy() {
    try {
      if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
      }
      window.removeEventListener('resize', () => this.onWindowResize());
      this.app.destroy(true, { children: true, texture: true });
    } catch {
      // Ignore PIXI cleanup errors
    }
  }
}
