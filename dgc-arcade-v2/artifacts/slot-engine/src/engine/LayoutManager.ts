import * as PIXI from 'pixi.js';

export class LayoutManager {
  private app: PIXI.Application;
  private isMobile: boolean = false;

  constructor(app: PIXI.Application) {
    this.app = app;
    this.updateLayout();
    window.addEventListener('resize', () => this.updateLayout());
  }

  private updateLayout() {
    const { width, height } = this.app.screen;
    this.isMobile = height > width;

    if (this.isMobile) {
      this.setupMobileLayout();
    } else {
      this.setupDesktopLayout();
    }
  }

  private setupMobileLayout() {
    // Vertical arrangement
    // Reels take top 60%
    // Controls at bottom
    console.log("Setting up Mobile Portrait Layout");
  }

  private setupDesktopLayout() {
    // Horizontal cinematic arrangement
    // Background fills everything
    // Reels centered
    // Side panels for Jackpots and Recent Wins
    console.log("Setting up Desktop Widescreen Layout");
  }

  public getReelScale(): number {
    return this.isMobile ? 0.8 : 1.2;
  }
}
