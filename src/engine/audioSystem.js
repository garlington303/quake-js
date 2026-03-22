import { ProceduralSoundtrack } from "./proceduralSoundtrack.js";

/**
 * audioSystem.js
 * Uses audio files from /public/sounds with synth fallbacks.
 * AudioContext is created lazily on first call so it follows user gestures.
 */

let ctx = null;
let masterGain = null;
let preloadStarted = false;
let soundtrack = null;

const MASTER_GAIN = 0.85;
const SOUND_LIBRARY = {
  shoot:       { files: ["SHOTGUN16.WAV"], volume: 0.9 },
  pistolShot:  { files: ["pistol4.mp3"], volume: 0.85, pitchVariation: 0.1 },
  hit:         { files: ["PUNCH1.WAV", "PUNCH3.WAV", "PUNCH5.WAV"], volume: 0.6 },
  pickup:      { files: ["ITEM1.WAV", "ITEM2.WAV", "ITEM5.WAV"], volume: 0.7 },
  hurt:        { files: ["PUNCH6.WAV", "PUNCH4.WAV"], volume: 0.8 },
  death:       { files: ["EXPLODE10.WAV", "EXPLODE14.WAV"], volume: 0.9 },
  footstep:    { files: ["STEP1.WAV"], volume: 0.35, pitchVariation: 0.2 },
  staffCast:   { files: ["PLASMA17.WAV"], volume: 0.75, pitchVariation: 0.08 },
  staffImpact: { files: ["FIREBALL2.WAV", "FIREBALL3.WAV"], volume: 0.85, pitchVariation: 0.1 },
  doorOpen:    { files: ["OPEN.WAV", "OPEN1.WAV"], volume: 0.70, pitchVariation: 0.05 },
  doorClose:   { files: ["CLOSE1.WAV"], volume: 0.65, pitchVariation: 0.05 },
};

const buffers = new Map();

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = MASTER_GAIN;
    masterGain.connect(ctx.destination);
    
    soundtrack = new ProceduralSoundtrack(ctx);
    soundtrack.connect(masterGain);
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
  if (!entry || !ctx) return false;
  const fileName = pickRandom(entry.files);

  try {
    const buffer = await loadBuffer(fileName);
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = entry.volume;
    source.buffer = buffer;
    if (entry.pitchVariation) {
      source.playbackRate.value = 1.0 + (Math.random() - 0.5) * entry.pitchVariation;
    }
    source.connect(gain);
    gain.connect(masterGain);
    source.start();
    return true;
  } catch {
    return false;
  }
}

function preloadAll() {
  if (preloadStarted || !ctx) return;
  preloadStarted = true;
  const files = Object.values(SOUND_LIBRARY).flatMap((entry) => entry.files);
  files.forEach((file) => {
    loadBuffer(file).catch(() => {});
  });
}

// ── Individual sounds ─────────────────────────────────────────────────────────

function playShootSynth() {
  const c = getCtx();
  if (!c) return;

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
  if (!c) return;
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
  if (!c) return;
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
  if (!c) return;
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
  if (!c) return;
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
  if (!c) return;
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

// Sword swoosh — filtered noise burst with a pitch-descending body
function playSwingSynth() {
  const c = getCtx();
  if (!c) return;

  // High-frequency air-cut noise
  const noise = c.createBufferSource();
  noise.buffer = noiseBuffer(c, 0.18);
  const hpf = c.createBiquadFilter();
  hpf.type = "highpass";
  hpf.frequency.value = 1800;
  const noiseGain = c.createGain();
  noiseGain.gain.setValueAtTime(0.001, c.currentTime);
  noiseGain.gain.linearRampToValueAtTime(0.38, c.currentTime + 0.03);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.18);
  noise.connect(hpf);
  hpf.connect(noiseGain);
  noiseGain.connect(masterGain ?? c.destination);
  noise.start();

  // Tone whoosh — descends quickly to give a whip crack feel
  const osc = c.createOscillator();
  const oscGain = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(520, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(120, c.currentTime + 0.14);
  oscGain.gain.setValueAtTime(0.001, c.currentTime);
  oscGain.gain.linearRampToValueAtTime(0.18, c.currentTime + 0.02);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.14);
  osc.connect(oscGain);
  oscGain.connect(masterGain ?? c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.18);
}


// Enemy pain grunt — short low organic thud + pitch-drop
function playEnemyHurtSynth() {
  const c = getCtx();
  if (!c) return;
  // Noise body — body-impact thud
  const noise = c.createBufferSource();
  noise.buffer = noiseBuffer(c, 0.12);
  const lpf = c.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.value = 420;
  const noiseGain = c.createGain();
  ramp(noiseGain.gain, 0.45, 0.001, 0.12);
  noise.connect(lpf);
  lpf.connect(noiseGain);
  noiseGain.connect(masterGain ?? c.destination);
  noise.start();
  // Pitch drop — organic grunt
  const osc = c.createOscillator();
  const oscGain = c.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(320, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.14);
  ramp(oscGain.gain, 0.22, 0.001, 0.14);
  osc.connect(oscGain);
  oscGain.connect(masterGain ?? c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.15);
}

// Enemy death scream — descending shriek + thud on landing
function playEnemyDeathSynth() {
  const c = getCtx();
  if (!c) return;
  // Shriek — fast descending oscillator
  const shriek = c.createOscillator();
  const shriekGain = c.createGain();
  shriek.type = "sawtooth";
  shriek.frequency.setValueAtTime(780, c.currentTime);
  shriek.frequency.exponentialRampToValueAtTime(55, c.currentTime + 0.55);
  shriekGain.gain.setValueAtTime(0.001, c.currentTime);
  shriekGain.gain.linearRampToValueAtTime(0.38, c.currentTime + 0.03);
  shriekGain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.55);
  shriek.connect(shriekGain);
  shriekGain.connect(masterGain ?? c.destination);
  shriek.start();
  shriek.stop(c.currentTime + 0.56);
  // Thud on landing
  const thud = c.createOscillator();
  const thudGain = c.createGain();
  thud.frequency.setValueAtTime(90, c.currentTime + 0.45);
  thud.frequency.exponentialRampToValueAtTime(28, c.currentTime + 0.7);
  ramp(thudGain.gain, 0.5, 0.001, 0.25);
  thud.connect(thudGain);
  thudGain.connect(masterGain ?? c.destination);
  thud.start(c.currentTime + 0.45);
  thud.stop(c.currentTime + 0.75);
}

// Enemy aggro alert — rising warble when enemy first spots player
function playEnemyAggroSynth() {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(200, c.currentTime);
  osc.frequency.linearRampToValueAtTime(440, c.currentTime + 0.12);
  osc.frequency.linearRampToValueAtTime(300, c.currentTime + 0.22);
  gain.gain.setValueAtTime(0.001, c.currentTime);
  gain.gain.linearRampToValueAtTime(0.18, c.currentTime + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.22);
  osc.connect(gain);
  gain.connect(masterGain ?? c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.23);
}
// Landing thud — low-pass noise burst, volume scales with fall speed
function playLandSynth(speed) {
  const c = getCtx();
  if (!c) return;
  const vol = Math.min(0.65, 0.2 + (speed / 600) * 0.45);
  const noise = c.createBufferSource();
  noise.buffer = noiseBuffer(c, 0.12);
  const lpf = c.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.value = 180;
  const gain = c.createGain();
  ramp(gain.gain, vol, 0.001, 0.12);
  noise.connect(lpf);
  lpf.connect(gain);
  gain.connect(masterGain ?? c.destination);
  noise.start();
}

// Weapon switch click — short triangle-wave descending blip
function playWeaponSwitchSynth() {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(300, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(120, c.currentTime + 0.06);
  gain.gain.setValueAtTime(0.3, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.06);
  osc.connect(gain);
  gain.connect(masterGain ?? c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.07);
}

// Dry fire click — sharp metallic tick when trigger is pulled on empty chamber
function playDryFireSynth() {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(1200, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(400, c.currentTime + 0.025);
  gain.gain.setValueAtTime(0.25, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.03);
  osc.connect(gain);
  gain.connect(masterGain ?? c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.035);
}

// Door open — low groaning bass sweep
function playDoorOpenSynth() {
  const c = getCtx();
  if (!c) return;
  // Whoosh: noise through a bandpass ramping low
  const buf = noiseBuffer(c, 0.15);
  const src = c.createBufferSource();
  src.buffer = buf;
  const bpf = c.createBiquadFilter();
  bpf.type = "bandpass";
  bpf.frequency.setValueAtTime(800, c.currentTime);
  bpf.frequency.exponentialRampToValueAtTime(200, c.currentTime + 0.15);
  bpf.Q.value = 1.2;
  const g = c.createGain();
  g.gain.setValueAtTime(0.5, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.15);
  src.connect(bpf);
  bpf.connect(g);
  g.connect(masterGain ?? c.destination);
  src.start();
  src.stop(c.currentTime + 0.15);
}

// Door close — heavy thud
function playDoorCloseSynth() {
  const c = getCtx();
  const noise = c.createBufferSource();
  noise.buffer = noiseBuffer(c, 0.1);
  const lpf = c.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.value = 200;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.5, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.1);
  noise.connect(lpf);
  lpf.connect(gain);
  gain.connect(masterGain ?? c.destination);
  noise.start();
}

// Grenade bounce clunk — dull metallic thud with short ring
function playBounceClunkSynth() {
  const c = getCtx();
  if (!c) return;
  // Low-pass noise thud
  const buf = noiseBuffer(c, 0.09);
  const src = c.createBufferSource();
  src.buffer = buf;
  const lpf = c.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.setValueAtTime(900, c.currentTime);
  lpf.frequency.exponentialRampToValueAtTime(180, c.currentTime + 0.09);
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.45, c.currentTime);
  ng.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.09);
  src.connect(lpf);
  lpf.connect(ng);
  ng.connect(masterGain ?? c.destination);
  src.start();
  src.stop(c.currentTime + 0.09);
  // Short metallic ring
  const osc = c.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(220, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(90, c.currentTime + 0.18);
  const og = c.createGain();
  og.gain.setValueAtTime(0.18, c.currentTime);
  og.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.18);
  osc.connect(og);
  og.connect(masterGain ?? c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.18);
}

// Staff impact boom — low thud + high crackle
function playStaffImpactSynth() {
  const c = getCtx();
  // Low boom
  const boom = c.createOscillator();
  const boomGain = c.createGain();
  boom.type = "sine";
  boom.frequency.setValueAtTime(180, c.currentTime);
  boom.frequency.exponentialRampToValueAtTime(30, c.currentTime + 0.35);
  boomGain.gain.setValueAtTime(0.0001, c.currentTime);
  boomGain.gain.linearRampToValueAtTime(0.5, c.currentTime + 0.02);
  boomGain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.35);
  boom.connect(boomGain);
  boomGain.connect(masterGain ?? c.destination);
  boom.start();
  boom.stop(c.currentTime + 0.36);
  // Crackle burst
  const noise = c.createBufferSource();
  noise.buffer = noiseBuffer(c, 0.12);
  const bpf = c.createBiquadFilter();
  bpf.type = "bandpass";
  bpf.frequency.value = 2800;
  bpf.Q.value = 0.5;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.45, c.currentTime);
  ng.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.12);
  noise.connect(bpf);
  bpf.connect(ng);
  ng.connect(masterGain ?? c.destination);
  noise.start();
}

// Explosion — sub-bass punch, noise decay
function playExplosionSynth() {
  const c = getCtx();
  if (!c) return;
  // Sub-bass thud
  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(90, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(25, c.currentTime + 0.45);
  const oscGain = c.createGain();
  oscGain.gain.setValueAtTime(1.0, c.currentTime);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.45);
  osc.connect(oscGain);
  oscGain.connect(masterGain ?? c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.45);
  // Noise burst
  const buf = noiseBuffer(c, 0.5);
  const src = c.createBufferSource();
  src.buffer = buf;
  const lpf = c.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.setValueAtTime(3000, c.currentTime);
  lpf.frequency.exponentialRampToValueAtTime(200, c.currentTime + 0.5);
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.75, c.currentTime);
  ng.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.5);
  src.connect(lpf);
  lpf.connect(ng);
  ng.connect(masterGain ?? c.destination);
  src.start();
  src.stop(c.currentTime + 0.5);
}


// Staff cast — magical crystalline charge-and-release
function playCastSpellSynth() {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(280, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(880, c.currentTime + 0.08);
  osc.frequency.exponentialRampToValueAtTime(440, c.currentTime + 0.22);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.linearRampToValueAtTime(0.4, c.currentTime + 0.06);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.22);
  osc.connect(g);
  g.connect(masterGain ?? c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.22);
  // Shimmer overtone
  const osc2 = c.createOscillator();
  osc2.type = "triangle";
  osc2.frequency.setValueAtTime(560, c.currentTime);
  osc2.frequency.exponentialRampToValueAtTime(1760, c.currentTime + 0.18);
  const g2 = c.createGain();
  g2.gain.setValueAtTime(0.0001, c.currentTime);
  g2.gain.linearRampToValueAtTime(0.2, c.currentTime + 0.04);
  g2.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.18);
  osc2.connect(g2);
  g2.connect(masterGain ?? c.destination);
  osc2.start();
  osc2.stop(c.currentTime + 0.18);
}

function playPistolShotSynth() {
  const c = getCtx();
  // Sharp crack — higher-pitched than shotgun, fast transient
  const noise = c.createBufferSource();
  noise.buffer = noiseBuffer(c, 0.08);
  const bpf = c.createBiquadFilter();
  bpf.type = "bandpass";
  bpf.frequency.value = 3200;
  bpf.Q.value = 0.7;
  const noiseGain = c.createGain();
  ramp(noiseGain.gain, 0.7, 0.001, 0.08);
  noise.connect(bpf);
  bpf.connect(noiseGain);
  noiseGain.connect(masterGain ?? c.destination);
  noise.start();

  // Tight punch tone
  const kick = c.createOscillator();
  const kickGain = c.createGain();
  kick.frequency.setValueAtTime(220, c.currentTime);
  kick.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.10);
  ramp(kickGain.gain, 0.6, 0.001, 0.10);
  kick.connect(kickGain);
  kickGain.connect(masterGain ?? c.destination);
  kick.start();
  kick.stop(c.currentTime + 0.10);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function createAudioSystem() {
  const FOOTSTEP_THRESHOLD = 28;
  const FOOTSTEP_INTERVAL = 0.42;
  let footstepTimer = 0;

  const playShoot = () => {
    getCtx();
    if (soundtrack) soundtrack.triggerShootStab();
    playSample("shoot").then((ok) => { if (!ok) playShootSynth(); });
  };

  const playPistolShot = () => {
    getCtx();
    if (soundtrack) soundtrack.triggerShootStab();
    playSample("pistolShot").then((ok) => { if (!ok) playPistolShotSynth(); });
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

  // Sword swing — synth only (no WAV file needed)
  const playSwing = () => {
    getCtx();
    if (soundtrack) soundtrack.triggerShootStab();
    playSwingSynth();
  };

  const playEnemyHurt  = () => { getCtx(); playEnemyHurtSynth(); };
  const playEnemyDeath = () => { getCtx(); playEnemyDeathSynth(); };
  const playEnemyAggro = () => { getCtx(); playEnemyAggroSynth(); };
  const playLand = (speed = 200) => { getCtx(); playLandSynth(speed); };
  const playWeaponSwitch = () => { getCtx(); playWeaponSwitchSynth(); };
  const playDryFire = () => { getCtx(); playDryFireSynth(); };
  const playCastSpell = () => {
    getCtx();
    playSample("staffCast").then((ok) => { if (!ok) playCastSpellSynth(); });
  };

  const playStaffImpact = () => {
    getCtx();
    playSample("staffImpact").then((ok) => { if (!ok) playStaffImpactSynth(); });
  };

  const playDoorOpen  = () => { getCtx(); playSample("doorOpen").then((ok)  => { if (!ok) playDoorOpenSynth();  }); };
  const playDoorClose = () => { getCtx(); playSample("doorClose").then((ok) => { if (!ok) playDoorCloseSynth(); }); };

  return {
    get soundtrack() {
      // Ensure AudioContext and soundtrack are created
      getCtx();
      return soundtrack;
    },
    playShoot,
    playPistolShot,
    playHit,
    playPickup,
    playHurt,
    playDeath,
    playFootstep,
    playSwing,
    playEnemyHurt,
    playEnemyDeath,
    playEnemyAggro,
    playLand,
    playWeaponSwitch,
    playDryFire,
    playCastSpell,
    playStaffImpact,
    playDoorOpen,
    playDoorClose,
    setMoving: (state) => {
      getCtx();
      if (soundtrack) {
        if (state && !soundtrack.isPlaying) {
          soundtrack.start();
        }
        soundtrack.setMoving(state);
      }
    },
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
