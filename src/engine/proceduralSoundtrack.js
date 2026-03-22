export class ProceduralSoundtrack {
  constructor(audioContext) {
    this.ctx = audioContext;
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.5; // Default volume

    // Params
    this.bassDrive = 0.8;
    this.tempo = 120; // BPM

    this.isPlaying = false;
    this.isMoving = false;
    this.nextNoteTime = 0;
    this.currentNote = 0;

    // A doom-like bassline sequence (minor pentatonic/blues scale feeling)
    this.sequence = [
      36, 36, 39, 36, 41, 36, 43, 41, // E2...
      36, 36, 39, 36, 41, 36, 34, 34  // E2... D2
    ];

    this.scheduleTimer = null;
  }

  connect(destination) {
    this.masterGain.connect(destination);
  }

  setVolume(val) {
    this.masterGain.gain.value = val;
  }

  setBassDrive(val) {
    this.bassDrive = val;
  }

  setTempo(val) {
    this.tempo = val;
  }

  setMoving(state) {
    this.isMoving = state;
  }

  start() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.currentNote = 0;
    this.schedule();
  }

  stop() {
    this.isPlaying = false;
    if (this.scheduleTimer) {
      clearTimeout(this.scheduleTimer);
    }
  }

  midiToFreq(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  schedule() {
    if (!this.isPlaying) return;

    const secondsPerBeat = 60.0 / this.tempo;
    const timeAhead = 0.1; // schedule 100ms ahead

    while (this.nextNoteTime < this.ctx.currentTime + timeAhead) {
      this.playNote(this.nextNoteTime);
      // 16th notes
      this.nextNoteTime += secondsPerBeat * 0.25;
      this.currentNote = (this.currentNote + 1) % this.sequence.length;
    }

    this.scheduleTimer = setTimeout(() => this.schedule(), 25);
  }

  playNote(time) {
    const note = this.sequence[this.currentNote];
    const freq = this.midiToFreq(note);

    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();

    // Doom bass type sound
    osc.type = 'sawtooth';
    osc.frequency.value = freq;

    // Distortion/Drive via wave shaper
    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this.makeDistortionCurve(this.bassDrive * 100); // 0 to 100
    shaper.oversample = '4x';

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    // Envelope for filter
    filter.frequency.setValueAtTime(500 + (this.bassDrive * 1000), time);
    filter.frequency.exponentialRampToValueAtTime(100, time + 0.15);

    // Amplitude envelope
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(0.8, time + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    osc.connect(shaper);
    shaper.connect(filter);
    filter.connect(env);
    env.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.2);

    if (this.isMoving) {
      // Very simple heavy kick drum on every beat (16th note index % 4 == 0)
      if (this.currentNote % 4 === 0) {
        const kickOsc = this.ctx.createOscillator();
        const kickEnv = this.ctx.createGain();

        kickOsc.frequency.setValueAtTime(150, time);
        kickOsc.frequency.exponentialRampToValueAtTime(0.01, time + 0.2);

        kickEnv.gain.setValueAtTime(0, time);
        kickEnv.gain.linearRampToValueAtTime(1.0, time + 0.01);
        kickEnv.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

        kickOsc.connect(kickEnv);
        kickEnv.connect(this.masterGain);

        kickOsc.start(time);
        kickOsc.stop(time + 0.2);
      }
      
      // Simple noise snare on off-beats (16th note index % 4 == 2)
      if (this.currentNote % 4 === 2) {
        const bufferSize = this.ctx.sampleRate * 0.1; // 100ms
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }

        const noiseSrc = this.ctx.createBufferSource();
        noiseSrc.buffer = buffer;

        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = 1000;

        const noiseEnv = this.ctx.createGain();
        noiseEnv.gain.setValueAtTime(0, time);
        noiseEnv.gain.linearRampToValueAtTime(0.5, time + 0.01);
        noiseEnv.gain.exponentialRampToValueAtTime(0.01, time + 0.1);

        noiseSrc.connect(noiseFilter);
        noiseFilter.connect(noiseEnv);
        noiseEnv.connect(this.masterGain);

        noiseSrc.start(time);
      }
    }
  }

  triggerShootStab() {
    if (!this.isPlaying || !this.ctx) return;
    
    const time = this.ctx.currentTime;
    
    // Play a punchy detuned minor/diminished chord depending on next note tone, but we can just use static frequencies for effect:
    const freqs = [150, 150 * 1.02, 150 * 1.18, 150 * 1.49]; 
    
    freqs.forEach(freq => {
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      
      // Filter sweep for punch
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(4000, time);
      filter.frequency.exponentialRampToValueAtTime(100, time + 0.15);
      
      // Fast explosive envelope
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(0.6, time + 0.01);
      env.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

      osc.connect(filter);
      filter.connect(env);
      env.connect(this.masterGain);

      osc.start(time);
      osc.stop(time + 0.25);
    });
  }

  makeDistortionCurve(amount) {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = i * 2 / n_samples - 1;
      curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }
}
