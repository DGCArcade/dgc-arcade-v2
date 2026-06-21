import { Howler, Howl } from 'howler';

/* ═══════════════════════════════════════════════════════════════
   AUDIO MANAGER: Multi-game sound design with Howler.js
═══════════════════════════════════════════════════════════════ */

export type GameTheme = 'neon-cyber' | 'classic-vegas' | 'dragon-realm';
export type SoundEffect = 'spin-start' | 'reel-land' | 'win-small' | 'win-big' | 'win-mega' | 'coin-drop' | 'button-click';

interface GameSoundConfig {
  backgroundMusic: string;
  spinStart: string;
  reelLand: string;
  winSmall: string;
  winBig: string;
  winMega: string;
  coinDrop: string;
  buttonClick: string;
}

const SOUND_CONFIG: Record<GameTheme, GameSoundConfig> = {
  'neon-cyber': {
    backgroundMusic: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==',
    spinStart: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==',
    reelLand: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==',
    winSmall: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==',
    winBig: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==',
    winMega: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==',
    coinDrop: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==',
    buttonClick: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==',
  },
  'classic-vegas': {
    backgroundMusic: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==',
    spinStart: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==',
    reelLand: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==',
    winSmall: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==',
    winBig: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==',
    winMega: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==',
    coinDrop: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==',
    buttonClick: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==',
  },
  'dragon-realm': {
    backgroundMusic: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==',
    spinStart: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==',
    reelLand: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==',
    winSmall: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==',
    winBig: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==',
    winMega: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==',
    coinDrop: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==',
    buttonClick: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==',
  },
};

export class AudioManager {
  private sounds: Map<string, Howl> = new Map();
  private currentTheme: GameTheme = 'neon-cyber';
  private backgroundMusic: Howl | null = null;
  private masterVolume: number = 0.7;
  private sfxVolume: number = 0.8;
  private musicVolume: number = 0.5;
  private muted: boolean = false;
  private audioContext: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;

  constructor(theme: GameTheme = 'neon-cyber') {
    this.currentTheme = theme;
    this.initAudio();
  }

  private initAudio() {
    // Set Howler global settings
    Howler.volume(this.masterVolume);
    
    // Initialize Web Audio API context
    try {
      const audioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new audioContextClass();
    } catch (e) {
      console.warn('Web Audio API not supported:', e);
    }

    this.loadGameSounds();
  }

  private loadGameSounds() {
    const config = SOUND_CONFIG[this.currentTheme];
    
    // Load background music (looped)
    this.backgroundMusic = new Howl({
      src: [config.backgroundMusic],
      loop: true,
      volume: this.musicVolume,
      autoplay: false,
    });

    // Load SFX
    this.sounds.set('spin-start', new Howl({
      src: [config.spinStart],
      volume: this.sfxVolume * 0.9,
    }));

    this.sounds.set('reel-land', new Howl({
      src: [config.reelLand],
      volume: this.sfxVolume * 0.85,
    }));

    this.sounds.set('win-small', new Howl({
      src: [config.winSmall],
      volume: this.sfxVolume * 0.8,
    }));

    this.sounds.set('win-big', new Howl({
      src: [config.winBig],
      volume: this.sfxVolume * 0.9,
    }));

    this.sounds.set('win-mega', new Howl({
      src: [config.winMega],
      volume: this.sfxVolume,
    }));

    this.sounds.set('coin-drop', new Howl({
      src: [config.coinDrop],
      volume: this.sfxVolume * 0.7,
    }));

    this.sounds.set('button-click', new Howl({
      src: [config.buttonClick],
      volume: this.sfxVolume * 0.6,
    }));
  }

  public setTheme(theme: GameTheme) {
    if (this.currentTheme !== theme) {
      this.stopBackgroundMusic();
      this.currentTheme = theme;
      this.loadGameSounds();
    }
  }

  public startBackgroundMusic() {
    if (this.backgroundMusic && !this.backgroundMusic.playing()) {
      this.backgroundMusic.play();
    }
  }

  public stopBackgroundMusic() {
    if (this.backgroundMusic) {
      this.backgroundMusic.stop();
    }
  }

  public playSFX(effect: SoundEffect) {
    const sound = this.sounds.get(effect);
    if (sound) {
      sound.stop();
      sound.play();
    }
  }

  public playReelLandSequence(reelIndex: number, totalReels: number) {
    const delay = reelIndex * 150;
    setTimeout(() => {
      this.playSFX('reel-land');
      
      // Add a subtle tone variation for each reel
      if (this.audioContext) {
        this.generateTone(200 + reelIndex * 80, 0.1, 0.15);
      }
    }, delay);
  }

  public playWinSequence(winTier: 'small' | 'big' | 'mega' | 'jackpot') {
    const effectMap = {
      small: 'win-small' as SoundEffect,
      big: 'win-big' as SoundEffect,
      mega: 'win-mega' as SoundEffect,
      jackpot: 'win-mega' as SoundEffect,
    };
    
    this.playSFX(effectMap[winTier]);

    // Layer in coin drop sounds for big wins
    if (winTier === 'big' || winTier === 'mega' || winTier === 'jackpot') {
      const coinCount = winTier === 'jackpot' ? 8 : winTier === 'mega' ? 6 : 4;
      for (let i = 0; i < coinCount; i++) {
        setTimeout(() => this.playSFX('coin-drop'), i * 120);
      }
    }
  }

  public playSpinStart() {
    this.playSFX('spin-start');
    
    // Generate a rising tone sweep for spin initiation
    if (this.audioContext) {
      this.generateToneSweep(150, 400, 0.4);
    }
  }

  public playButtonClick() {
    this.playSFX('button-click');
  }

  private generateTone(frequency: number, duration: number, volume: number = 0.3) {
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.frequency.value = frequency;
    osc.type = 'sine';
    
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    osc.connect(gain);
    gain.connect(this.audioContext.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  private generateToneSweep(startFreq: number, endFreq: number, duration: number) {
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    osc.connect(gain);
    gain.connect(this.audioContext.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  public setMasterVolume(vol: number) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    Howler.volume(this.masterVolume);
  }

  public setSFXVolume(vol: number) {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
    this.sounds.forEach(sound => {
      sound.volume(this.sfxVolume * 0.8);
    });
  }

  public setMusicVolume(vol: number) {
    this.musicVolume = Math.max(0, Math.min(1, vol));
    if (this.backgroundMusic) {
      this.backgroundMusic.volume(this.musicVolume);
    }
  }

  public mute() {
    this.muted = true;
    Howler.mute(true);
  }

  public unmute() {
    this.muted = false;
    Howler.mute(false);
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public dispose() {
    this.stopBackgroundMusic();
    this.sounds.forEach(sound => sound.unload());
    this.sounds.clear();
  }
}

// Singleton instance
let audioManager: AudioManager | null = null;

export function getAudioManager(theme: GameTheme = 'neon-cyber'): AudioManager {
  if (!audioManager) {
    audioManager = new AudioManager(theme);
  }
  return audioManager;
}

export function setAudioTheme(theme: GameTheme) {
  const manager = getAudioManager();
  manager.setTheme(theme);
}
