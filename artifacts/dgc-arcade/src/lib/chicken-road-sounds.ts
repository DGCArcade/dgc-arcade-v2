let ctx: AudioContext | null = null;
let ambienceNodes: { stop: () => void } | null = null;
let honkTimer: ReturnType<typeof setInterval> | null = null;

function ac(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function noiseBurst(c: AudioContext, duration: number, filterHz: number, gainVal: number) {
  const now = c.currentTime;
  const bufferSize = Math.floor(c.sampleRate * duration);
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const t = i / c.sampleRate;
    const env = Math.sin((Math.PI * t) / duration);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = filterHz;
  const gain = c.createGain();
  gain.gain.value = gainVal;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);
  src.start(now);
  return src;
}

/** Low city traffic hum + occasional distant honks — Stake-style ambience */
export function startChickenRoadAmbience() {
  stopChickenRoadAmbience();
  const c = ac();
  const now = c.currentTime;

  const trafficOsc = c.createOscillator();
  const trafficGain = c.createGain();
  trafficOsc.type = "sawtooth";
  trafficOsc.frequency.value = 55;
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 0.3;
  lfoGain.gain.value = 8;
  lfo.connect(lfoGain);
  lfoGain.connect(trafficOsc.frequency);
  const trafficFilter = c.createBiquadFilter();
  trafficFilter.type = "lowpass";
  trafficFilter.frequency.value = 180;
  trafficGain.gain.setValueAtTime(0, now);
  trafficGain.gain.linearRampToValueAtTime(0.018, now + 1.2);
  trafficOsc.connect(trafficFilter);
  trafficFilter.connect(trafficGain);
  trafficGain.connect(c.destination);
  trafficOsc.start(now);
  lfo.start(now);

  const sizzle = c.createOscillator();
  const sizzleGain = c.createGain();
  sizzle.type = "triangle";
  sizzle.frequency.value = 220;
  const sizzleFilter = c.createBiquadFilter();
  sizzleFilter.type = "bandpass";
  sizzleFilter.frequency.value = 400;
  sizzleFilter.Q.value = 2;
  sizzleGain.gain.value = 0.006;
  sizzle.connect(sizzleFilter);
  sizzleFilter.connect(sizzleGain);
  sizzleGain.connect(c.destination);
  sizzle.start(now);

  ambienceNodes = {
    stop: () => {
      trafficGain.gain.linearRampToValueAtTime(0, c.currentTime + 0.4);
      sizzleGain.gain.linearRampToValueAtTime(0, c.currentTime + 0.4);
      setTimeout(() => {
        trafficOsc.stop();
        lfo.stop();
        sizzle.stop();
      }, 450);
    },
  };

  honkTimer = setInterval(() => {
    if (Math.random() > 0.35) return;
    const honk = c.createOscillator();
    const honkGain = c.createGain();
    honk.type = "square";
    const t = c.currentTime;
    honk.frequency.setValueAtTime(280 + Math.random() * 80, t);
    honk.frequency.setValueAtTime(220 + Math.random() * 60, t + 0.12);
    honkGain.gain.setValueAtTime(0, t);
    honkGain.gain.linearRampToValueAtTime(0.04, t + 0.02);
    honkGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    honk.connect(honkGain);
    honkGain.connect(c.destination);
    honk.start(t);
    honk.stop(t + 0.3);
  }, 4500);
}

export function stopChickenRoadAmbience() {
  ambienceNodes?.stop();
  ambienceNodes = null;
  if (honkTimer) {
    clearInterval(honkTimer);
    honkTimer = null;
  }
}

export function playChickenSpawn() {
  const c = ac();
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(300, now);
  osc.frequency.exponentialRampToValueAtTime(600, now + 0.12);
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.2);
  playChickenCluck();
}

export function playChickenCluck() {
  const c = ac();
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(900, now);
  osc.frequency.exponentialRampToValueAtTime(400, now + 0.06);
  gain.gain.setValueAtTime(0.06, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.1);
}

export function playCarPass(whoosh = false) {
  const c = ac();
  const dur = whoosh ? 0.35 : 0.25;
  noiseBurst(c, dur, whoosh ? 800 : 400, 0.2);
  if (!whoosh) {
    const t = c.currentTime;
    const engine = c.createOscillator();
    const engineGain = c.createGain();
    engine.type = "sawtooth";
    engine.frequency.setValueAtTime(120, t);
    engine.frequency.exponentialRampToValueAtTime(60, t + dur);
    engineGain.gain.setValueAtTime(0.06, t);
    engineGain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    engine.connect(engineGain);
    engineGain.connect(c.destination);
    engine.start(t);
    engine.stop(t + dur);
  }
}

export function playCrossSuccess() {
  const c = ac();
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(520, now);
  osc.frequency.setValueAtTime(780, now + 0.08);
  gain.gain.setValueAtTime(0.1, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

export function playChickenBust() {
  const c = ac();
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.4);
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.linearRampToValueAtTime(0, now + 0.45);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.45);
  playCarPass(true);
}

export function playBarrierClang() {
  const c = ac();
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(320, now);
  osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.15);
}

export function playManholeIgnite() {
  const c = ac();
  const now = c.currentTime;
  const bufferSize = Math.floor(c.sampleRate * 0.2);
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const t = i / c.sampleRate;
    const env = Math.exp(-t * 12);
    data[i] = (Math.random() * 2 - 1) * env * 0.15;
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 600;
  const gain = c.createGain();
  gain.gain.value = 0.25;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);
  src.start(now);
}
