import * as PIXI from 'pixi.js';
import { gsap } from 'gsap';

export class AnimationManager {
  private app: PIXI.Application;

  constructor(app: PIXI.Application) {
    this.app = app;
  }

  public async playWinAnimation(positions: { reel: number; row: number }[]) {
    // 1. Highlight symbols
    // 2. Shake screen if it's a big win
    // 3. Trigger particle effects
    return new Promise<void>((resolve) => {
      gsap.to(this.app.stage, {
        x: "+=10",
        y: "+=10",
        duration: 0.05,
        repeat: 10,
        yoyo: true,
        onComplete: () => {
          this.app.stage.x = 0;
          this.app.stage.y = 0;
          resolve();
        }
      });
    });
  }

  public spawnCoins(amount: number) {
    const coinCount = Math.min(amount * 10, 100);
    for (let i = 0; i < coinCount; i++) {
      const coin = new PIXI.Graphics();
      coin.beginFill(0xFFD700);
      coin.drawCircle(0, 0, 5);
      coin.endFill();
      
      coin.x = this.app.screen.width / 2;
      coin.y = this.app.screen.height / 2;
      
      this.app.stage.addChild(coin);
      
      gsap.to(coin, {
        x: Math.random() * this.app.screen.width,
        y: this.app.screen.height + 50,
        rotation: Math.random() * 10,
        duration: 1 + Math.random(),
        ease: "power2.in",
        onComplete: () => {
          this.app.stage.removeChild(coin);
          coin.destroy();
        }
      });
    }
  }
}
