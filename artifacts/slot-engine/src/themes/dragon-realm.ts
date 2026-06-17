import { SlotConfig } from '../engine/types';

export const DragonRealmConfig: SlotConfig = {
  id: 'dragon-realm',
  name: 'Dragon Realm',
  reels: 5,
  rows: 3,
  symbols: [
    { id: 'dragon', name: 'Dragon', image: 'dragon.png', payouts: { 3: 10, 4: 50, 5: 500 } },
    { id: 'egg', name: 'Dragon Egg', image: 'egg.png', payouts: { 3: 5, 4: 20, 5: 100 } },
    { id: 'treasure', name: 'Treasure', image: 'treasure.png', payouts: { 3: 2, 4: 10, 5: 50 } },
    { id: 'wild', name: 'Wild', image: 'wild.png', payouts: {}, isWild: true },
    { id: 'scatter', name: 'Scatter', image: 'scatter.png', payouts: {}, isScatter: true },
  ],
  paylines: [
    [1, 1, 1, 1, 1], // Middle row
    [0, 0, 0, 0, 0], // Top row
    [2, 2, 2, 2, 2], // Bottom row
    [0, 1, 2, 1, 0], // V shape
    [2, 1, 0, 1, 2], // Inverted V
  ],
  rtp: 96.5,
  minBet: 0.1,
  maxBet: 100,
  jackpots: {
    mini: 10,
    minor: 50,
    major: 250,
    grand: 1000
  },
  themes: {
    background: 'dragon-bg.jpg',
    music: 'dragon-theme.mp3',
    spinSound: 'spin.wav',
    winSound: 'win.wav',
    bonusSound: 'bonus.wav',
    particles: {
      win: 'fire-particles.json'
    }
  }
};
