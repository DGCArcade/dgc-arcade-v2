/**
 * Generate a satisfying "click" sound for bet placement
 */
export function generateBetClickSound(): string {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const duration = 0.15; // 150ms
  const sampleRate = audioContext.sampleRate;
  const length = duration * sampleRate;
  
  // Create audio buffer
  const audioBuffer = audioContext.createBuffer(1, length, sampleRate);
  const data = audioBuffer.getChannelData(0);
  
  // Generate a short, sharp "click" sound
  for (let i = 0; i < length; i++) {
    const progress = i / length;
    
    // Quick sine wave burst (high frequency for "click" feel)
    const frequency = 800; // Hz
    const phase = (i / sampleRate) * frequency * Math.PI * 2;
    const wave = Math.sin(phase);
    
    // Sharp attack, quick decay envelope
    const envelope = Math.exp(-progress * 15);
    
    data[i] = wave * envelope * 0.6;
  }
  
  return audioBufferToWav(audioBuffer);
}

/**
 * Convert AudioBuffer to WAV format data URL
 */
function audioBufferToWav(audioBuffer: AudioBuffer): string {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numberOfChannels * bytesPerSample;

  const channelData: Float32Array[] = [];
  for (let i = 0; i < numberOfChannels; i++) {
    channelData.push(audioBuffer.getChannelData(i));
  }

  const interleaved = new Float32Array(audioBuffer.length * numberOfChannels);
  let index = 0;
  const volume = 0.8;
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      interleaved[index++] = channelData[channel][i] * volume;
    }
  }

  const dataLength = interleaved.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  const subChunk2Size = dataLength;
  const chunkSize = 36 + subChunk2Size;

  writeString(0, "RIFF");
  view.setUint32(4, chunkSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, "data");
  view.setUint32(40, subChunk2Size, true);

  let index2 = 0;
  const volume2 = 0.8;
  for (let i = 0; i < interleaved.length; i++) {
    view.setInt16(44 + index2, interleaved[i] < 0 ? interleaved[i] * 0x8000 : interleaved[i] * 0x7fff, true);
    index2 += 2;
  }

  const blob = new Blob([buffer], { type: "audio/wav" });
  return URL.createObjectURL(blob);
}

/**
 * Play a bet click sound
 */
export function playBetClickSound() {
  try {
    const audio = new Audio(generateBetClickSound());
    audio.volume = 0.7;
    audio.play().catch(() => {});
  } catch (err) {
    // Silently fail
  }
}
