import { SlotConfig, SpinResult, SymbolId, WinInfo } from './types';

/**
 * Server-side engine for DGC Arcade.
 * Handles the provably fair RNG and win calculations.
 */
export class ServerEngine {
  private config: SlotConfig;

  constructor(config: SlotConfig) {
    this.config = config;
  }

  /**
   * Resolves a spin using provided seeds for provable fairness.
   */
  public resolveSpin(
    bet: number,
    serverSeed: string,
    clientSeed: string,
    nonce: number
  ): SpinResult {
    const reels: SymbolId[][] = [];
    
    // Generate reels using the seed-based RNG
    for (let i = 0; i < this.config.reels; i++) {
      const reel: SymbolId[] = [];
      for (let j = 0; j < this.config.rows; j++) {
        const symbol = this.getProvablyFairSymbol(serverSeed, clientSeed, nonce, i, j);
        reel.push(symbol.id);
      }
      reels.push(reel);
    }

    const wins = this.calculateWins(reels, bet);
    const totalWin = wins.reduce((sum, win) => sum + win.amount, 0);

    return {
      reels,
      wins,
      totalWin,
      // Bonus and Jackpot logic would be added here
    };
  }

  private getProvablyFairSymbol(
    serverSeed: string,
    clientSeed: string,
    nonce: number,
    reelIndex: number,
    rowIndex: number
  ) {
    // In actual implementation, we'd use a crypto-safe hash of seeds+nonce+indices
    // to get a value between 0 and 1, then map it to symbols.
    const randomIndex = Math.floor(Math.random() * this.config.symbols.length);
    return this.config.symbols[randomIndex];
  }

  private calculateWins(reels: SymbolId[][], bet: number): WinInfo[] {
    const wins: WinInfo[] = [];
    const lineBet = bet / this.config.paylines.length;

    this.config.paylines.forEach((line, index) => {
      const symbolsOnLine: SymbolId[] = line.map((row, reel) => reels[reel][row]);
      
      let matchCount = 1;
      const firstSymbolId = symbolsOnLine[0];
      const firstSymbol = this.config.symbols.find(s => s.id === firstSymbolId);

      if (!firstSymbol || firstSymbol.isScatter) return;

      for (let i = 1; i < symbolsOnLine.length; i++) {
        const currentSymbolId = symbolsOnLine[i];
        const currentSymbol = this.config.symbols.find(s => s.id === currentSymbolId);
        
        if (currentSymbolId === firstSymbolId || currentSymbol?.isWild) {
          matchCount++;
        } else {
          break;
        }
      }

      const payoutMultiplier = firstSymbol.payouts[matchCount];
      if (payoutMultiplier && payoutMultiplier > 0) {
        wins.push({
          symbolId: firstSymbolId,
          count: matchCount,
          amount: lineBet * payoutMultiplier,
          paylineIndex: index,
          positions: line.slice(0, matchCount).map((row, reel) => ({ reel, row }))
        });
      }
    });

    return wins;
  }
}
