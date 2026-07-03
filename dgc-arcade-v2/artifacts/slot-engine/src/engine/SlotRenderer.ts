import * as PIXI from 'pixi.js';
import { gsap } from 'gsap';
import { SlotConfig, SpinResult } from './types';

export class SlotRenderer {
  private app: PIXI.Application;
  private config: SlotConfig;
  private reelContainers: PIXI.Container[] = [];
  private symbolSprites: PIXI.Sprite[][] = [];

  constructor(containerId: string, config: SlotConfig) {
    this.config = config;
    this.app = new PIXI.Application({
      background: '#000000',
      resizeTo: window,
      antialias: true,
    });

    const element = document.getElementById(containerId);
    if (element) {
      element.appendChild(this.app.view as unknown as Node);
    }

    this.setupReels();
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
      
      // Mask for the reel
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

  public async spin(result: SpinResult) {
    const spinDuration = 2;
    const promises = this.reelContainers.map((reel, index) => {
      return this.animateReel(reel, index, result.reels[index], spinDuration + index * 0.2);
    });

    await Promise.all(promises);
    this.showWins(result);
  }

  private animateReel(container: PIXI.Container, reelIndex: number, finalSymbols: string[], duration: number) {
    return new Promise<void>((resolve) => {
      // Simple vertical blur and movement simulation
      // In a real app, we'd swap textures and loop them
      gsap.to(container, {
        y: container.y + 500,
        duration: duration / 2,
        ease: "power1.in",
        onComplete: () => {
          // Snap back and finish with final symbols
          container.y -= 500;
          this.updateReelSymbols(container, finalSymbols);
          gsap.from(container, {
            y: container.y - 100,
            duration: duration / 2,
            ease: "back.out(1.7)",
            onComplete: resolve
          });
        }
      });
    });
  }

  private updateReelSymbols(container: PIXI.Container, symbols: string[]) {
    // Clear and redraw symbols
    // This is a simplified version for scaffolding
  }

  private showWins(result: SpinResult) {
    if (result.totalWin > 0) {
      console.log(`WIN: ${result.totalWin}`);
      // Trigger win animations, particle effects, etc.
    }
  }

  public resize() {
    this.app.renderer.resize(window.innerWidth, window.innerHeight);
    // Recenter reels
  }

  public destroy() {
    try {
      this.app.destroy(true, { children: true, texture: true });
    } catch {
      // Ignore PIXI cleanup errors (e.g. already destroyed)
    }
  }
}
