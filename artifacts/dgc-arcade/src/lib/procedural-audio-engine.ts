/* ═══════════════════════════════════════════════════════════════
   PROCEDURAL AUDIO ENGINE: Unlimited unique sounds matching DGC Arcade vibe
   Generates synth, pad, and percussion sounds programmatically
═══════════════════════════════════════════════════════════════ */

export type GameTheme = 'neon-cyber' | 'classic-vegas' | 'dragon-realm';
export type SoundEffect = 'spin-start' | 'reel-land' | 'win-small' | 'win-big' | 'win-mega' | 'coin-drop' | 'button-click';

interface AudioBuffer {
  data: Float32Array;
  sampleRate: number;
}

class ProceduralAudioEngine {
  private audioContext: AudioContext;
  private sampleRate: number = 44100;
  private masterVolume: number = 0.7;
  private themeSeeds: Record<GameTheme, number> = {
    'neon-cyber': 42,
    'classic-vegas': 73,
    'dragon-realm': 88,
  };

  constructor() {
    const audioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new audioContextClass();
    this.sampleRate = this.audioContext.sampleRate;
  }

  /**
   * Seeded random number generator for reproducible but varied sounds
   */
  private seededRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  /**
   * Generate spin-start sound: Rising synth sweep with wobble
   */
  generateSpinStart(theme: GameTheme): AudioBuffer {
    const duration = 0.6;
    const samples = Math.floor(this.sampleRate * duration);
    const data = new Float32Array(samples);
    const seed = this.themeSeeds[theme];

    for (let i = 0; i < samples; i++) {
      const t = i / this.sampleRate;
      const progress = t / duration;

      // Rising frequency sweep
      const baseFreq = 200 + progress * 400;
      
      // Add theme-specific character
      let soundWave = 0;
      
      if (theme === 'neon-cyber') {
        // Sharp, digital rising tone with harmonics
        soundWave = Math.sin(2 * Math.PI * baseFreq * t);
        soundWave += 0.3 * Math.sin(2 * Math.PI * baseFreq * 2 * t);
        soundWave += 0.15 * Math.sin(2 * Math.PI * baseFreq * 3 * t);
      } else if (theme === 'classic-vegas') {
        // Warm, bell-like rising tone
        soundWave = Math.sin(2 * Math.PI * baseFreq * t);
        soundWave += 0.4 * Math.sin(2 * Math.PI * baseFreq * 1.5 * t);
      } else {
        // Oriental-inspired rising tone with slight tremolo
        soundWave = Math.sin(2 * Math.PI * baseFreq * t);
        soundWave *= 1 + 0.2 * Math.sin(2 * Math.PI * 4 * t); // 4Hz tremolo
      }

      // Envelope: quick attack, linear release
      const envelope = Math.max(0, 1 - progress * 1.2);
      data[i] = soundWave * envelope * this.masterVolume;
    }

    return { data, sampleRate: this.sampleRate };
  }

  /**
   * Generate reel landing sound: Sharp metallic "ka-chunk" with pitch bend
   */
  generateReelLand(theme: GameTheme, reelIndex: number = 0): AudioBuffer {
    const duration = 0.25;
    const samples = Math.floor(this.sampleRate * duration);
    const data = new Float32Array(samples);
    const seed = this.themeSeeds[theme] + reelIndex * 7;

    for (let i = 0; i < samples; i++) {
      const t = i / this.sampleRate;
      const progress = t / duration;

      // Pitch bend down (physical reel stopping)
      const startFreq = 400 + reelIndex * 60;
      const endFreq = 200 + reelIndex * 40;
      const freq = startFreq - (startFreq - endFreq) * (progress * progress);

      // Bright, slightly metallic tone
      let soundWave = Math.sin(2 * Math.PI * freq * t);
      soundWave += 0.5 * Math.sin(2 * Math.PI * freq * 1.2 * t);
      soundWave += 0.2 * Math.sin(2 * Math.PI * freq * 0.8 * t);

      // Sharp attack, quick decay
      let envelope = 0;
      if (progress < 0.1) {
        envelope = progress / 0.1; // Quick attack
      } else {
        envelope = Math.max(0, 1 - (progress - 0.1) / 0.9); // Decay
      }

      data[i] = soundWave * envelope * this.masterVolume * 0.8;
    }

    return { data, sampleRate: this.sampleRate };
  }

  /**
   * Generate win sound: Ascending chord with sparkle overlay
   */
  generateWin(theme: GameTheme, tier: 'small' | 'big' | 'mega' | 'jackpot'): AudioBuffer {
    const durationMap = { small: 0.5, big: 0.8, mega: 1.2, jackpot: 1.5 };
    const duration = durationMap[tier];
    const samples = Math.floor(this.sampleRate * duration);
    const data = new Float32Array(samples);
    const seed = this.themeSeeds[theme];

    const frequencies = {
      small: [523.25, 659.25, 783.99], // C, E, G major chord
      big: [523.25, 659.25, 783.99, 1046.5], // C, E, G, C octave
      mega: [440, 554.37, 659.25, 880], // A, C#, E, A major 7th
      jackpot: [523.25, 659.25, 783.99, 1046.5, 1318.51], // Rich C major triad
    };

    for (let i = 0; i < samples; i++) {
      const t = i / this.sampleRate;
      const progress = t / duration;

      let soundWave = 0;

      // Build chord
      const freqs = frequencies[tier];
      for (const freq of freqs) {
        soundWave += Math.sin(2 * Math.PI * freq * t) / freqs.length;
      }

      // Add sparkle: high-frequency shimmer
      if (tier === 'mega' || tier === 'jackpot') {
        soundWave += 0.15 * Math.sin(2 * Math.PI * 3500 * t + progress * 20);
      }

      // Envelope: soft attack, hold, decay
      let envelope = 0;
      if (progress < 0.2) {
        envelope = progress / 0.2; // Soft attack
      } else if (progress < 0.7) {
        envelope = 1; // Hold
      } else {
        envelope = Math.max(0, 1 - (progress - 0.7) / 0.3);
      }

      const volumeMultiplier = { small: 0.6, big: 0.75, mega: 0.85, jackpot: 0.9 }[tier];
      data[i] = soundWave * envelope * this.masterVolume * volumeMultiplier;
    }

    return { data, sampleRate: this.sampleRate };
  }

  /**
   * Generate coin drop sound: Metallic clink with reverb tail
   */
  generateCoinDrop(theme: GameTheme): AudioBuffer {
    const duration = 0.4;
    const samples = Math.floor(this.sampleRate * duration);
    const data = new Float32Array(samples);
    const seed = this.themeSeeds[theme];

    for (let i = 0; i < samples; i++) {
      const t = i / this.sampleRate;
      const progress = t / duration;

      // Bright metallic ping
      const baseFreq = 800;
      const harmonicDecay = Math.pow(0.98, i / (this.sampleRate * 0.1)); // Harmonic decay

      let soundWave = 0;
      soundWave += Math.sin(2 * Math.PI * baseFreq * t) * 0.6;
      soundWave += 0.4 * Math.sin(2 * Math.PI * baseFreq * 1.5 * t);
      soundWave += 0.2 * Math.sin(2 * Math.PI * baseFreq * 2 * t);
      soundWave *= harmonicDecay;

      // Quick attack, exponential decay
      let envelope = 0;
      if (progress < 0.05) {
        envelope = progress / 0.05;
      } else {
        envelope = Math.pow(1 - progress, 2.5);
      }

      data[i] = soundWave * envelope * this.masterVolume * 0.7;
    }

    return { data, sampleRate: this.sampleRate };
  }

  /**
   * Generate button click sound: Punchy short beep
   */
  generateButtonClick(theme: GameTheme): AudioBuffer {
    const duration = 0.15;
    const samples = Math.floor(this.sampleRate * duration);
    const data = new Float32Array(samples);
    const seed = this.themeSeeds[theme];

    const clickFreq = theme === 'neon-cyber' ? 950 : theme === 'classic-vegas' ? 750 : 850;

    for (let i = 0; i < samples; i++) {
      const t = i / this.sampleRate;
      const progress = t / duration;

      // Simple sine wave
      let soundWave = Math.sin(2 * Math.PI * clickFreq * t);
      soundWave += 0.3 * Math.sin(2 * Math.PI * clickFreq * 1.5 * t);

      // Sharp attack and decay
      const envelope = Math.pow(1 - progress, 2);

      data[i] = soundWave * envelope * this.masterVolume * 0.5;
    }

    return { data, sampleRate: this.sampleRate };
  }

  /**
   * Generate background music: Loopable ambient synth pad
   */
  generateBackgroundMusic(theme: GameTheme, durationSeconds: number = 30): AudioBuffer {
    const samples = Math.floor(this.sampleRate * durationSeconds);
    const data = new Float32Array(samples);
    const seed = this.themeSeeds[theme];

    // Theme-specific chord progressions and frequencies
    const progressions = {
      'neon-cyber': [
        { freqs: [110, 220, 330], duration: 4 }, // A minor
        { freqs: [130.81, 261.63, 392], duration: 4 }, // C major
        { freqs: [146.83, 293.66, 440], duration: 4 }, // D minor
        { freqs: [110, 220, 330], duration: 4 }, // A minor (loop back)
      ],
      'classic-vegas': [
        { freqs: [82.41, 164.81, 246.94], duration: 3 }, // Low E
        { freqs: [110, 220, 330], duration: 3 }, // A major
        { freqs: [97.99, 195.98, 293.66], duration: 3 }, // B major
        { freqs: [82.41, 164.81, 246.94], duration: 3 }, // Loop
      ],
      'dragon-realm': [
        { freqs: [65.41, 130.81, 196.00], duration: 5 }, // Pentatonic: C
        { freqs: [73.42, 146.83, 220], duration: 5 }, // D
        { freqs: [82.41, 164.81, 246.94], duration: 5 }, // E
        { freqs: [65.41, 130.81, 196.00], duration: 5 }, // Loop
      ],
    };

    const progression = progressions[theme];
    let totalDuration = progression.reduce((sum, p) => sum + p.duration, 0);
    let progressionIndex = 0;
    let progressionTime = 0;

    for (let i = 0; i < samples; i++) {
      const t = i / this.sampleRate;
      const globalProgress = (t % totalDuration) / totalDuration;

      // Find current chord
      let chordProgress = 0;
      let currentChord = progression[0];
      let accumulatedTime = 0;

      for (const chord of progression) {
        if (chordProgress + chord.duration >= (t % totalDuration)) {
          currentChord = chord;
          break;
        }
        accumulatedTime += chord.duration;
        chordProgress += chord.duration;
      }

      // Build pad sound
      let soundWave = 0;
      for (const freq of currentChord.freqs) {
        // Sine wave with slight detuning for richness
        const detuned = freq * (1 + this.seededRandom(seed + freq) * 0.01);
        soundWave += Math.sin(2 * Math.PI * detuned * t) / currentChord.freqs.length;
      }

      // Add gentle LFO modulation
      const lfoFreq = 0.5 + (seed % 10) * 0.05;
      soundWave *= 0.7 + 0.3 * Math.sin(2 * Math.PI * lfoFreq * t);

      // Soft fade in/out at transitions
      const fadeInDuration = 0.5;
      const fadeOutDuration = 0.5;
      let envelope = 1;

      if (accumulatedTime < fadeInDuration) {
        envelope *= accumulatedTime / fadeInDuration;
      }
      if (accumulatedTime + fadeOutDuration > totalDuration) {
        envelope *= (totalDuration - accumulatedTime) / fadeOutDuration;
      }

      data[i] = soundWave * envelope * this.masterVolume * 0.4;
    }

    return { data, sampleRate: this.sampleRate };
  }

  /**
   * Convert AudioBuffer to WAV data URL
   */
  bufferToWavUrl(buffer: AudioBuffer): string {
    const { data, sampleRate } = buffer;
    const numChannels = 1;
    const bitDepth = 16;

    // WAV header
    const frameLength = data.length;
    const blockAlign = (numChannels * bitDepth) / 8;
    const byteRate = sampleRate * blockAlign;
    const dataSize = frameLength * blockAlign;

    const wavBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(wavBuffer);

    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Write audio data
    let offset = 44;
    for (let i = 0; i < frameLength; i++) {
      const s = Math.max(-1, Math.min(1, data[i])); // Clamp
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }

    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }
}

let engineInstance: ProceduralAudioEngine | null = null;

export function getAudioEngine(): ProceduralAudioEngine {
  if (!engineInstance) {
    engineInstance = new ProceduralAudioEngine();
  }
  return engineInstance;
}

export function generateGameAudio(
  theme: GameTheme,
  effect: SoundEffect
): string {
  const engine = getAudioEngine();
  let buffer: AudioBuffer;

  switch (effect) {
    case 'spin-start':
      buffer = engine.generateSpinStart(theme);
      break;
    case 'reel-land':
      buffer = engine.generateReelLand(theme);
      break;
    case 'win-small':
      buffer = engine.generateWin(theme, 'small');
      break;
    case 'win-big':
      buffer = engine.generateWin(theme, 'big');
      break;
    case 'win-mega':
      buffer = engine.generateWin(theme, 'mega');
      break;
    case 'coin-drop':
      buffer = engine.generateCoinDrop(theme);
      break;
    case 'button-click':
      buffer = engine.generateButtonClick(theme);
      break;
    default:
      buffer = engine.generateButtonClick(theme);
  }

  return engine.bufferToWavUrl(buffer);
}
