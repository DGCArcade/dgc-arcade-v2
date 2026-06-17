import { EventEmitter } from 'events';
import { SlotConfig, SpinResult, SymbolId, WinInfo } from './types';

export class SlotEngine extends EventEmitter {
  private config: SlotConfig;

  constructor(config: SlotConfig) {
    super();
    this.config = config;
  }

  /**
   * Generates a random spin result based on the config.
   * In a production environment, this would be called on the server.
   */
  public spin(bet: number): SpinResult {
    const reels: SymbolId[][] = [];
    
    // 1. Generate random symbols for each reel
    for (let i = 0; i < this.config.reels; i++) {
      const reel: SymbolId[] = [];
      for (let j = 0; j < this.config.rows; j++) {
        const randomSymbol = this.getRandomSymbol();
        reel.push(randomSymbol.id);
      }
      reels.push(reel);
    }

    // 2. Calculate wins
    const wins = this.calculateWins(reels, bet);
    const totalWin = wins.reduce((sum, win) => sum + win.amount, 0);

    const result: SpinResult = {
      reels,
      wins,
      totalWin
    };

    // 3. Check for bonus triggers (example logic)
    const scatterCount = this.countSymbol(reels, 'scatter');
    if (scatterCount >= 3) {
      result.bonusTriggered = 'free_spins';
    }

    return result;
  }

  private getRandomSymbol() {
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

  private countSymbol(reels: SymbolId[][], type: 'scatter' | 'wild' | 'bonus'): number {
    let count = 0;
    reels.forEach(reel => {
      reel.forEach(symbolId => {
        const symbol = this.config.symbols.find(s => s.id === symbolId);
        if (type === 'scatter' && symbol?.isScatter) count++;
        if (type === 'wild' && symbol?.isWild) count++;
        if (type === 'bonus' && symbol?.isBonus) count++;
      });
    });
    return count;
  }
}
