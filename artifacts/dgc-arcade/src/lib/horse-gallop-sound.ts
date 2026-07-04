/** Procedural horse gallop — filtered noise bursts mimicking hoof impacts */

let ctx: AudioContext | null = null;
let gallopInterval: ReturnType<typeof setInterval> | null = null;
let crowdNodes: { stop: () => void } | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return ctx;
}

function playHoofImpact(ac: AudioContext, intensity = 1, pan = 0) {
  const now = ac.currentTime;
  const duration = 0.08;
  const bufferSize = Math.floor(ac.sampleRate * duration);
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    const t = i / ac.sampleRate;
    const env = Math.exp(-t * 45);
    const thud = (Math.random() * 2 - 1) * env;
    const tone = Math.sin(2 * Math.PI * (80 + Math.random() * 40) * t) * env * 0.4;
    data[i] = (thud * 0.6 + tone) * intensity;
  }

  const source = ac.createBufferSource();
  source.buffer = buffer;

  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 320;
  filter.Q.value = 0.7;

  const panner = ac.createStereoPanner();
  panner.pan.value = pan;

  const gain = ac.createGain();
  gain.gain.value = 0.35 * intensity;

  source.connect(filter);
  filter.connect(panner);
  panner.connect(gain);
  gain.connect(ac.destination);
  source.start(now);
}

function playSnort(ac: AudioContext) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(180, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(90, ac.currentTime + 0.15);
  gain.gain.setValueAtTime(0.04, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.2);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + 0.2);
}

export function startHorseGallopLoop() {
  stopHorseGallopLoop();
  const ac = getCtx();
  if (ac.state === "suspended") void ac.resume();

  let beat = 0;
  gallopInterval = setInterval(() => {
    const intensity = 0.7 + (beat % 4) * 0.08;
    const pan = ((beat % 6) - 2.5) * 0.12;
    playHoofImpact(ac, intensity, pan);
    if (beat % 8 === 0) playHoofImpact(ac, intensity * 0.55, -pan);
    beat++;
  }, 155);
}

export function stopHorseGallopLoop() {
  if (gallopInterval) {
    clearInterval(gallopInterval);
    gallopInterval = null;
  }
}

/** Grandstand crowd murmur during race */
export function startCrowdAmbience() {
  stopCrowdAmbience();
  const ac = getCtx();
  if (ac.state === "suspended") void ac.resume();
  const now = ac.currentTime;

  const bufferSize = Math.floor(ac.sampleRate * 2);
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.3;

  const src = ac.createBufferSource();
  src.buffer = buffer;
  src.loop = true;

  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 600;
  filter.Q.value = 0.5;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.04, now + 0.8);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  src.start(now);

  crowdNodes = {
    stop: () => {
      gain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.5);
      setTimeout(() => src.stop(), 520);
    },
  };
}

export function stopCrowdAmbience() {
  crowdNodes?.stop();
  crowdNodes = null;
}

export function playGateOpenClang() {
  const ac = getCtx();
  if (ac.state === "suspended") void ac.resume();
  const now = ac.currentTime;

  const clang = ac.createOscillator();
  const clangGain = ac.createGain();
  clang.type = "square";
  clang.frequency.setValueAtTime(180, now);
  clang.frequency.exponentialRampToValueAtTime(90, now + 0.15);
  clangGain.gain.setValueAtTime(0.12, now);
  clangGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
  clang.connect(clangGain);
  clangGain.connect(ac.destination);
  clang.start(now);
  clang.stop(now + 0.25);

  const rattle = ac.createOscillator();
  const rattleGain = ac.createGain();
  rattle.type = "triangle";
  rattle.frequency.setValueAtTime(320, now + 0.05);
  rattle.frequency.exponentialRampToValueAtTime(120, now + 0.3);
  rattleGain.gain.setValueAtTime(0.06, now + 0.05);
  rattleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
  rattle.connect(rattleGain);
  rattleGain.connect(ac.destination);
  rattle.start(now + 0.05);
  rattle.stop(now + 0.35);
}

export function playRaceStartBugle() {
  const ac = getCtx();
  if (ac.state === "suspended") void ac.resume();
  playSnort(ac);
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(440, now);
  osc.frequency.setValueAtTime(523, now + 0.12);
  osc.frequency.setValueAtTime(659, now + 0.24);
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start();
  osc.stop(now + 0.45);
}

export function playRaceFinishCheer() {
  stopHorseGallopLoop();
  const ac = getCtx();
  const now = ac.currentTime;

  const cheer = ac.createOscillator();
  const cheerGain = ac.createGain();
  cheer.type = "sine";
  cheer.frequency.setValueAtTime(500, now);
  cheer.frequency.exponentialRampToValueAtTime(1000, now + 0.35);
  cheerGain.gain.setValueAtTime(0.07, now);
  cheerGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
  cheer.connect(cheerGain);
  cheerGain.connect(ac.destination);
  cheer.start(now);
  cheer.stop(now + 0.55);

  const bufferSize = Math.floor(ac.sampleRate * 0.5);
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const t = i / ac.sampleRate;
    data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 3) * 0.2;
  }
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 400;
  const gain = ac.createGain();
  gain.gain.value = 0.15;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  src.start(now);
}
