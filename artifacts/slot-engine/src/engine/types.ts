export type SymbolId = string;

export interface SymbolConfig {
  id: SymbolId;
  name: string;
  image: string;
  payouts: Record<number, number>; // count -> multiplier
  isWild?: boolean;
  isScatter?: boolean;
  isBonus?: boolean;
}

export interface SlotConfig {
  id: string;
  name: string;
  reels: number;
  rows: number;
  symbols: SymbolConfig[];
  paylines: number[][]; // array of row indices for each reel
  rtp: number;
  minBet: number;
  maxBet: number;
  jackpots?: {
    mini: number;
    minor: number;
    major: number;
    grand: number;
  };
  themes: {
    background: string;
    music: string;
    spinSound: string;
    winSound: string;
    bonusSound: string;
    particles: Record<string, any>;
  };
}

export interface SpinResult {
  reels: SymbolId[][]; // symbols for each reel
  wins: WinInfo[];
  totalWin: number;
  bonusTriggered?: string;
  jackpotWon?: 'mini' | 'minor' | 'major' | 'grand';
}

export interface WinInfo {
  symbolId: SymbolId;
  count: number;
  amount: number;
  paylineIndex?: number;
  positions: { reel: number; row: number }[];
}

export interface EngineState {
  isSpinning: boolean;
  currentBet: number;
  balance: number;
  lastResult?: SpinResult;
}
