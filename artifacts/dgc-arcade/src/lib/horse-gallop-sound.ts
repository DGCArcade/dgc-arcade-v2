/** Procedural horse gallop — filtered noise bursts mimicking hoof impacts */

let ctx: AudioContext | null = null;
let gallopInterval: ReturnType<typeof setInterval> | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return ctx;
}

function playHoofImpact(ac: AudioContext, intensity = 1) {
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

  const gain = ac.createGain();
  gain.gain.value = 0.35 * intensity;

  source.connect(filter);
  filter.connect(gain);
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
    playHoofImpact(ac, intensity);
    if (beat % 8 === 0) playHoofImpact(ac, intensity * 0.6);
    beat++;
  }, 165);
}

export function stopHorseGallopLoop() {
  if (gallopInterval) {
    clearInterval(gallopInterval);
    gallopInterval = null;
  }
}

export function playRaceStartBugle() {
  const ac = getCtx();
  if (ac.state === "suspended") void ac.resume();
  playSnort(ac);
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(440, ac.currentTime);
  osc.frequency.setValueAtTime(523, ac.currentTime + 0.12);
  gain.gain.setValueAtTime(0.08, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.35);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + 0.35);
}

export function playRaceFinishCheer() {
  stopHorseGallopLoop();
  const ac = getCtx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(600, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(900, ac.currentTime + 0.25);
  gain.gain.setValueAtTime(0.06, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.4);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + 0.4);
}
