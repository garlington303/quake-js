/**
 * audioSystem.js
 * Uses audio files from /public/sounds with synth fallbacks.
 * AudioContext is created lazily on first call so it follows user gestures.
 */

let ctx = null;
let masterGain = null;
let preloadStarted = false;

const MASTER_GAIN = 0.85;
const SOUND_LIBRARY = {
  shoot:   { files: ["SHOTGUN16.WAV", "SHOTGUN6.WAV", "SHOTGUN3.WAV"], volume: 0.9 },
  hit:     { files: ["PUNCH1.WAV", "PUNCH3.WAV", "PUNCH5.WAV"], volume: 0.6 },
  pickup:  { files: ["ITEM1.WAV", "ITEM2.WAV", "ITEM5.WAV"], volume: 0.7 },
  hurt:    { files: ["PUNCH6.WAV", "PUNCH4.WAV"], volume: 0.8 },
  death:   { files: ["EXPLODE10.WAV", "EXPLODE14.WAV"], volume: 0.9 },
  footstep:{ files: ["STEP1.WAV", "STEP2.WAV", "STEP3.WAV"], volume: 0.9 },
};

const buffers = new Map();

function getCtx() {
  if (!ctx) {
    ctx = new AudioContext();
    masterGain = ctx.createGain();
    masterGain.gain.value = MASTER_GAIN;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function ramp(param, from, to, duration) {
  param.setValueAtTime(from, ctx.currentTime);
  param.exponentialRampToValueAtTime(Math.max(to, 0.0001), ctx.currentTime + duration);
}

function noiseBuffer(c, seconds) {
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  return buf;
}

async function loadBuffer(fileName) {
  if (buffers.has(fileName)) {
    return buffers.get(fileName);
  }

  const response = await fetch(`/sounds/${fileName}`);
  if (!response.ok) {
    throw new Error(`Failed to load sound ${fileName}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = await ctx.decodeAudioData(arrayBuffer);
  buffers.set(fileName, buffer);
  return buffer;
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

async function playSample(key) {
  const entry = SOUND_LIBRARY[key];
  if (!entry) return false;
  const fileName = pickRandom(entry.files);

  try {
    const buffer = await loadBuffer(fileName);
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = entry.volume;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(masterGain);
    source.start();
    return true;
  } catch {
    return false;
  }
}

function preloadAll() {
  if (preloadStarted) return;
  preloadStarted = true;
  const files = Object.values(SOUND_LIBRARY).flatMap((entry) => entry.files);
  files.forEach((file) => {
    loadBuffer(file).catch(() => {});
  });
}

// ── Individual sounds ─────────────────────────────────────────────────────────

function playShootSynth() {
  const c = getCtx();

  // White noise burst — shotgun body
  const noise = c.createBufferSource();
  noise.buffer = noiseBuffer(c, 0.18);
  const hpf = c.createBiquadFilter();
  hpf.type = "highpass";
  hpf.frequency.value = 700;
  const noiseGain = c.createGain();
  ramp(noiseGain.gain, 0.55, 0.001, 0.18);
  noise.connect(hpf);
  hpf.connect(noiseGain);
  noiseGain.connect(c.destination);
  noise.start();

  // Bass thump — punch/weight
  const kick = c.createOscillator();
  const kickGain = c.createGain();
  kick.frequency.setValueAtTime(130, c.currentTime);
  kick.frequency.exponentialRampToValueAtTime(28, c.currentTime + 0.22);
  ramp(kickGain.gain, 0.75, 0.001, 0.22);
  kick.connect(kickGain);
  kickGain.connect(c.destination);
  kick.start();
  kick.stop(c.currentTime + 0.22);
}

function playHitSynth() {
  const c = getCtx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(900, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(180, c.currentTime + 0.07);
  ramp(gain.gain, 0.28, 0.001, 0.07);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.07);
}

function playPickupSynth() {
  const c = getCtx();
  // Two-tone ascending chirp
  [380, 620].forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    const t = c.currentTime + i * 0.07;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.1);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.13);
  });
}

function playHurtSynth() {
  const c = getCtx();
  const noise = c.createBufferSource();
  noise.buffer = noiseBuffer(c, 0.22);
  const lpf = c.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.value = 280;
  const gain = c.createGain();
  ramp(gain.gain, 0.85, 0.001, 0.22);
  noise.connect(lpf);
  lpf.connect(gain);
  gain.connect(c.destination);
  noise.start();
}

function playDeathSynth() {
  const c = getCtx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(260, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(25, c.currentTime + 1.6);
  ramp(gain.gain, 0.55, 0.001, 1.6);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 1.6);
}

function playFootstepSynth() {
  const c = getCtx();
  const noise = c.createBufferSource();
  noise.buffer = noiseBuffer(c, 0.06);
  const bpf = c.createBiquadFilter();
  bpf.type = "bandpass";
  bpf.frequency.value = 320;
  bpf.Q.value = 0.8;
  const gain = c.createGain();
  ramp(gain.gain, 0.8, 0.001, 0.07);
  noise.connect(bpf);
  bpf.connect(gain);
  gain.connect(c.destination);
  noise.start();
}

// ── Public API ────────────────────────────────────────────────────────────────

export function createAudioSystem() {
  const FOOTSTEP_THRESHOLD = 28;
  const FOOTSTEP_INTERVAL = 0.75;
  let footstepTimer = 0;

  const playShoot = () => {
    getCtx();
    playSample("shoot").then((ok) => { if (!ok) playShootSynth(); });
  };

  const playHit = () => {
    getCtx();
    playSample("hit").then((ok) => { if (!ok) playHitSynth(); });
  };

  const playPickup = () => {
    getCtx();
    playSample("pickup").then((ok) => { if (!ok) playPickupSynth(); });
  };

  const playHurt = () => {
    getCtx();
    playSample("hurt").then((ok) => { if (!ok) playHurtSynth(); });
  };

  const playDeath = () => {
    getCtx();
    playSample("death").then((ok) => { if (!ok) playDeathSynth(); });
  };

  const playFootstep = () => {
    getCtx();
    playSample("footstep").then((ok) => { if (!ok) playFootstepSynth(); });
  };

  return {
    playShoot,
    playHit,
    playPickup,
    playHurt,
    playDeath,
    playFootstep,
    resume: () => {
      getCtx();
      preloadAll();
    },
    update(deltaTimeSeconds, movement = {}) {
      const speed = movement.horizontalSpeed ?? 0;
      const grounded = Boolean(movement.grounded);

      if (grounded && speed > FOOTSTEP_THRESHOLD) {
        footstepTimer -= deltaTimeSeconds;
        if (footstepTimer <= 0) {
          playFootstep();
          footstepTimer = FOOTSTEP_INTERVAL;
        }
      } else {
        footstepTimer = Math.min(footstepTimer, 0.1);
      }
    },
  };
}
