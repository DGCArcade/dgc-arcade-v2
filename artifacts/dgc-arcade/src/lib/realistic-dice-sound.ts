/**
 * Generate a realistic dice rolling sound with multiple impacts and tumbling
 */
export function generateRealisticDiceSound(): string {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const duration = 0.8; // 800ms total
  const sampleRate = audioContext.sampleRate;
  const length = duration * sampleRate;
  
  // Create audio buffer
  const audioBuffer = audioContext.createBuffer(1, length, sampleRate);
  const data = audioBuffer.getChannelData(0);
  
  // Initialize with silence
  data.fill(0);
  
  // Generate tumbling sound with multiple impacts
  const impacts = [
    { time: 0.05, freq: 1200, decay: 0.3 },
    { time: 0.15, freq: 1400, decay: 0.35 },
    { time: 0.28, freq: 1100, decay: 0.4 },
    { time: 0.42, freq: 1300, decay: 0.45 },
    { time: 0.58, freq: 1250, decay: 0.5 },
    { time: 0.72, freq: 1150, decay: 0.55 },
  ];
  
  // Add each impact
  for (const impact of impacts) {
    const startSample = Math.floor(impact.time * sampleRate);
    const impactDuration = 0.12; // 120ms per impact
    const impactLength = Math.floor(impactDuration * sampleRate);
    
    for (let i = 0; i < impactLength; i++) {
      const sampleIndex = startSample + i;
      if (sampleIndex >= length) break;
      
      const progress = i / impactLength;
      const frequency = impact.freq;
      const phase = (i / sampleRate) * frequency * Math.PI * 2;
      
      // Sine wave with harmonics for richer sound
      const fundamental = Math.sin(phase);
      const harmonic1 = Math.sin(phase * 2) * 0.3;
      const harmonic2 = Math.sin(phase * 0.5) * 0.2;
      const wave = fundamental + harmonic1 + harmonic2;
      
      // Attack-decay envelope for each impact
      const attack = Math.min(progress * 3, 1);
      const decay = Math.exp(-progress * impact.decay * 8);
      const envelope = attack * decay;
      
      // Add some noise for realistic tumbling
      const noise = (Math.random() - 0.5) * 0.15;
      
      data[sampleIndex] = (wave * envelope + noise) * 0.5;
    }
  }
  
  // Add background tumble noise (low frequency rumble)
  for (let i = 0; i < length; i++) {
    const progress = i / length;
    const tumbleFreq = 80 + Math.sin(progress * Math.PI * 4) * 30;
    const phase = (i / sampleRate) * tumbleFreq * Math.PI * 2;
    const tumble = Math.sin(phase) * 0.08;
    
    // Fade in and out
    const tumbleEnvelope = Math.sin(progress * Math.PI) * Math.exp(-progress * 2);
    data[i] += tumble * tumbleEnvelope;
  }
  
  // Normalize to prevent clipping
  let max = 0;
  for (let i = 0; i < length; i++) {
    max = Math.max(max, Math.abs(data[i]));
  }
  if (max > 0) {
    for (let i = 0; i < length; i++) {
      data[i] /= max * 1.2;
    }
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
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      interleaved[index++] = channelData[channel][i];
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
  for (let i = 0; i < interleaved.length; i++) {
    view.setInt16(44 + index2, interleaved[i] < 0 ? interleaved[i] * 0x8000 : interleaved[i] * 0x7fff, true);
    index2 += 2;
  }

  const blob = new Blob([buffer], { type: "audio/wav" });
  return URL.createObjectURL(blob);
}

/**
 * Play realistic dice roll sound
 */
export function playRealisticDiceSound() {
  try {
    const audio = new Audio(generateRealisticDiceSound());
    audio.volume = 0.75;
    audio.play().catch(() => {});
  } catch (err) {
    // Silently fail
  }
}
