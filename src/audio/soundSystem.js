const DEFAULT_MASTER_GAIN = 0.25;
const FOOTSTEP_THRESHOLD = 30;
const FOOTSTEP_INTERVAL = 0.45;

function createNoiseBuffer(context, durationSeconds) {
  const length = Math.max(1, Math.floor(context.sampleRate * durationSeconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }
  return buffer;
}

export function createSoundSystem() {
  let context = null;
  let masterGain = null;
  let unlocked = false;
  let footstepTimer = 0;

  const ensureContext = () => {
    if (context) {
      return context;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }

    context = new AudioContextClass();
    masterGain = context.createGain();
    masterGain.gain.value = DEFAULT_MASTER_GAIN;
    masterGain.connect(context.destination);
    return context;
  };

  const resume = async () => {
    const ctx = ensureContext();
    if (!ctx) {
      return;
    }
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    unlocked = true;
  };

  const playGunshot = () => {
    if (!unlocked) {
      return;
    }
    const ctx = ensureContext();
    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.08);
    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.12);

    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx, 0.06);
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.setValueAtTime(1200, now);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.35, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);
    noise.start(now);
    noise.stop(now + 0.07);
  };

  const playFootstep = () => {
    if (!unlocked) {
      return;
    }
    const ctx = ensureContext();
    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx, 0.05);

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(350, now);
    filter.Q.value = 0.8;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    noise.start(now);
    noise.stop(now + 0.06);
  };

  const update = (deltaTimeSeconds, movement = {}) => {
    if (!unlocked) {
      return;
    }

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
  };

  return {
    resume,
    playGunshot,
    update,
  };
}
