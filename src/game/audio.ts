export type AmbientMode = 'menu' | 'space' | 'planet_calm' | 'planet_storm' | 'underwater';
export type AmbientMood = 'bright' | 'mystic' | 'tense';
export type FootstepSurface = 'rock' | 'sand' | 'snow' | 'water' | 'metal';

export interface AmbientContext {
  mode: AmbientMode;
  mood: AmbientMood;
}

/**
 * Pure helper mapping current phase, atmosphere, water immersion, and planetary weather
 * to an ambient music & soundscape profile.
 */
export function resolveAmbientContext(
  phase: 'title' | 'playing' | 'paused' | 'gameover',
  inAtmosphere: boolean,
  underwater: boolean,
  weather: string,
  hazardType: string
): AmbientContext {
  if (phase === 'title') {
    return { mode: 'menu', mood: 'mystic' };
  }
  if (phase !== 'playing') {
    return { mode: 'space', mood: 'tense' };
  }
  if (underwater) {
    return { mode: 'underwater', mood: 'mystic' };
  }
  if (!inAtmosphere) {
    return { mode: 'space', mood: hazardType === 'void' ? 'tense' : 'mystic' };
  }

  const w = weather.toLowerCase();
  const isStorm =
    w.includes('storm') ||
    w.includes('blizzard') ||
    w.includes('tempest') ||
    w.includes('acid') ||
    w.includes('ash') ||
    w.includes('superheated');

  if (isStorm) {
    return { mode: 'planet_storm', mood: 'tense' };
  }

  const isBright =
    hazardType === 'none' &&
    (w.includes('clear') || w.includes('balmy') || w.includes('breeze'));

  return {
    mode: 'planet_calm',
    mood: isBright ? 'bright' : hazardType === 'radiation' || hazardType === 'toxic' ? 'tense' : 'mystic',
  };
}

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  private muted = false;
  private volume = 0.55;

  // Continuous engine & mining beam loops
  private engineOsc: OscillatorNode | null = null;
  private engineSubOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private laserOsc: OscillatorNode | null = null;
  private laserGain: GainNode | null = null;

  // Continuous ambient drone + filtered wind/water bed
  private droneOscA: OscillatorNode | null = null;
  private droneOscB: OscillatorNode | null = null;
  private droneOscC: OscillatorNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private droneGain: GainNode | null = null;

  private windSource: AudioBufferSourceNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  // Generative ambient music sequencer state
  private noteTimer = 1.2;
  private stepIdx = 0;
  private lastStepTime = 0;
  private lastScanTickTime = 0;
  private lastAlertTime = 0;
  private gestureBound = false;
  private onGestureUnlock: (() => void) | null = null;

  constructor() {
    this.bindGestureUnlock();
  }

  public bindGestureUnlock(): void {
    if (typeof window === 'undefined' || this.gestureBound || this.ctx) return;
    this.gestureBound = true;
    const onFirstGesture = () => {
      if (this.onGestureUnlock) {
        window.removeEventListener('pointerdown', this.onGestureUnlock, true);
        window.removeEventListener('keydown', this.onGestureUnlock, true);
        window.removeEventListener('touchstart', this.onGestureUnlock, true);
        this.onGestureUnlock = null;
      }
      this.unlock(true);
    };
    this.onGestureUnlock = onFirstGesture;
    window.addEventListener('pointerdown', onFirstGesture, { capture: true, passive: true });
    window.addEventListener('keydown', onFirstGesture, { capture: true, passive: true });
    window.addEventListener('touchstart', onFirstGesture, { capture: true, passive: true });
  }

  public unlock(fromUserGesture = false): void {
    if (typeof window === 'undefined') return;
    const userAct = (navigator as unknown as { userActivation?: { hasBeenActive?: boolean; isActive?: boolean } }).userActivation;
    const hasActivation = fromUserGesture || Boolean(userAct?.isActive || userAct?.hasBeenActive);

    if (!this.ctx) {
      if (!hasActivation) {
        this.bindGestureUnlock();
        return;
      }
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
      this.masterGain.connect(this.ctx.destination);

      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.value = 0.72;
      this.ambientGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 1.0;
      this.sfxGain.connect(this.masterGain);

      this.noiseBuffer = this.createNoiseBuffer(this.ctx, 3.0);
      this.initContinuousLoops();
    }
    if (this.ctx.state === 'suspended' && hasActivation) {
      this.ctx.resume().catch(() => {});
    }
  }

  private createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Pink-ish smoothed noise for warm atmospheric wind & explosions
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.950 * b2 + white * 0.048;
      data[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + white * 0.18) * 1.4));
    }
    return buffer;
  }

  private initContinuousLoops(): void {
    if (!this.ctx || !this.sfxGain || !this.ambientGain) return;

    // 1. Ship / Jetpack thruster hum + sub-harmonic rumble
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;

    this.engineSubOsc = this.ctx.createOscillator();
    this.engineSubOsc.type = 'sine';
    this.engineSubOsc.frequency.value = 34;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;

    this.engineOsc.connect(filter);
    this.engineSubOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.sfxGain);
    this.engineOsc.start();
    this.engineSubOsc.start();

    // 2. Continuous mining laser beam harmonic
    this.laserOsc = this.ctx.createOscillator();
    this.laserOsc.type = 'triangle';
    this.laserOsc.frequency.value = 185;
    this.laserGain = this.ctx.createGain();
    this.laserGain.gain.value = 0;
    this.laserOsc.connect(this.laserGain);
    this.laserGain.connect(this.sfxGain);
    this.laserOsc.start();

    // 3. Ambient Space & Planetary Cosmic Pad Drone (3 detuned warm oscillators)
    this.droneFilter = this.ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 240;
    this.droneFilter.Q.value = 1.2;

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0.045;

    this.droneOscA = this.ctx.createOscillator();
    this.droneOscA.type = 'sine';
    this.droneOscA.frequency.value = 55; // A1

    this.droneOscB = this.ctx.createOscillator();
    this.droneOscB.type = 'triangle';
    this.droneOscB.frequency.value = 82.41; // E2 fifth

    this.droneOscC = this.ctx.createOscillator();
    this.droneOscC.type = 'sine';
    this.droneOscC.frequency.value = 110.35; // A2 slightly detuned shimmer

    this.droneOscA.connect(this.droneFilter);
    this.droneOscB.connect(this.droneFilter);
    this.droneOscC.connect(this.droneFilter);
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.ambientGain);

    this.droneOscA.start();
    this.droneOscB.start();
    this.droneOscC.start();

    // 4. Atmospheric Wind / Underwater Current Loop
    if (this.noiseBuffer) {
      this.windSource = this.ctx.createBufferSource();
      this.windSource.buffer = this.noiseBuffer;
      this.windSource.loop = true;

      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.frequency.value = 340;
      this.windFilter.Q.value = 1.4;

      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0.0;

      this.windSource.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.ambientGain);
      this.windSource.start();
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx && !this.muted) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  public silenceLoops(): void {
    if (!this.ctx) return;
    if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    if (this.laserGain) this.laserGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }

  /**
   * Updates continuous cosmic drone, planetary wind/water bed, and generative ambient chimes.
   */
  public updateAmbient(context: AmbientContext, dt: number): void {
    if (!this.ctx || !this.droneGain || !this.droneFilter || !this.windGain || !this.windFilter) return;
    const now = this.ctx.currentTime;
    const lfo = 0.5 + 0.5 * Math.sin(now * 0.28);
    const windLfo = 0.5 + 0.5 * Math.sin(now * 0.45 + 1.4);

    let targetDroneGain = 0.045;
    let targetDroneCutoff = 220 + lfo * 140;
    let targetWindGain = 0.012;
    let targetWindCutoff = 320 + windLfo * 240;
    let baseFreq = 55; // A1

    if (context.mode === 'menu') {
      targetDroneGain = 0.065;
      targetDroneCutoff = 280 + lfo * 180;
      targetWindGain = 0.015;
      targetWindCutoff = 280;
      baseFreq = 55;
    } else if (context.mode === 'space') {
      targetDroneGain = 0.055;
      targetDroneCutoff = 190 + lfo * 120;
      targetWindGain = 0.008;
      targetWindCutoff = 160;
      baseFreq = 48.99; // G1 deeper void resonance
    } else if (context.mode === 'underwater') {
      targetDroneGain = 0.05;
      targetDroneCutoff = 140 + lfo * 60;
      targetWindGain = 0.055;
      targetWindCutoff = 180 + windLfo * 90;
      baseFreq = 61.74; // B1
    } else if (context.mode === 'planet_storm') {
      targetDroneGain = 0.04;
      targetDroneCutoff = 200 + lfo * 110;
      targetWindGain = 0.085;
      targetWindCutoff = 420 + windLfo * 520;
      baseFreq = 51.91; // G#1 tense
    } else {
      // planet_calm
      targetDroneGain = 0.042;
      targetDroneCutoff = 260 + lfo * 160;
      targetWindGain = 0.026;
      targetWindCutoff = 360 + windLfo * 220;
      baseFreq = context.mood === 'bright' ? 65.41 : 55; // C2 or A1
    }

    if (this.droneOscA && this.droneOscB && this.droneOscC) {
      this.droneOscA.frequency.setTargetAtTime(baseFreq, now, 0.8);
      this.droneOscB.frequency.setTargetAtTime(baseFreq * 1.498, now, 0.8);
      this.droneOscC.frequency.setTargetAtTime(baseFreq * 2.004, now, 0.8);
    }

    this.droneGain.gain.setTargetAtTime(targetDroneGain, now, 0.45);
    this.droneFilter.frequency.setTargetAtTime(targetDroneCutoff, now, 0.45);
    this.windGain.gain.setTargetAtTime(targetWindGain, now, 0.45);
    this.windFilter.frequency.setTargetAtTime(targetWindCutoff, now, 0.35);

    // Generative Space Chimes / Melodic Plucks
    this.noteTimer -= dt;
    if (this.noteTimer <= 0 && !this.muted && this.ctx.state === 'running') {
      this.playAmbientMusicNote(context);
      this.noteTimer =
        context.mode === 'planet_storm'
          ? 3.8 + Math.random() * 3.0
          : context.mode === 'menu'
            ? 2.2 + Math.random() * 1.8
            : 2.6 + Math.random() * 2.8;
    }
  }

  private playAmbientMusicNote(context: AmbientContext): void {
    if (!this.ctx || !this.ambientGain || this.muted) return;
    const scales: Record<AmbientMood, number[]> = {
      bright: [261.63, 293.66, 329.63, 392.0, 440.0, 493.88, 523.25, 659.25], // C major Lydian-pentatonic
      mystic: [220.0, 246.94, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33], // A minor 9 ambient
      tense: [196.0, 207.65, 246.94, 293.66, 311.13, 392.0, 415.3], // Dark Phrygian/suspended
    };
    const pool = scales[context.mood];
    this.stepIdx = (this.stepIdx + 1 + Math.floor(Math.random() * 3)) % pool.length;
    const freq = pool[this.stepIdx];
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const oscHar = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    oscHar.type = 'triangle';
    oscHar.frequency.setValueAtTime(freq * 2.0, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(context.mode === 'underwater' ? 420 : 1400, now);
    filter.frequency.exponentialRampToValueAtTime(360, now + 2.4);

    const peak = context.mode === 'menu' ? 0.06 : 0.045;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.14);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 2.8);

    const harGain = this.ctx.createGain();
    harGain.gain.value = 0.22;

    osc.connect(filter);
    oscHar.connect(harGain);
    harGain.connect(filter);
    filter.connect(g);
    g.connect(this.ambientGain);

    osc.start(now);
    oscHar.start(now);
    osc.stop(now + 2.9);
    oscHar.stop(now + 2.9);
  }

  public updateThruster(intensity: number, pitchBoost = 0): void {
    if (!this.ctx || !this.engineGain || !this.engineOsc || !this.engineSubOsc) return;
    const clamped = Math.max(0, Math.min(1, intensity));
    this.engineGain.gain.setTargetAtTime(clamped * 0.14, this.ctx.currentTime, 0.06);
    this.engineOsc.frequency.setTargetAtTime(52 + clamped * 68 + pitchBoost * 42, this.ctx.currentTime, 0.06);
    this.engineSubOsc.frequency.setTargetAtTime(32 + clamped * 28 + pitchBoost * 16, this.ctx.currentTime, 0.06);
  }

  public updateMiningBeam(active: boolean): void {
    if (!this.ctx || !this.laserGain || !this.laserOsc) return;
    this.laserGain.gain.setTargetAtTime(active ? 0.1 : 0, this.ctx.currentTime, 0.04);
    if (active) {
      const wobble = Math.sin(this.ctx.currentTime * 22) * 18;
      this.laserOsc.frequency.setTargetAtTime(195 + wobble, this.ctx.currentTime, 0.03);
    }
  }

  private playFilteredNoise(
    duration: number,
    filterType: BiquadFilterType,
    startFreq: number,
    endFreq: number,
    gainVal: number
  ): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(startFreq, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + duration);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gainVal, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start(now, Math.random() * 1.2, duration + 0.03);
  }

  public playFootstep(surface: FootstepSurface = 'rock'): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - this.lastStepTime < 0.27) return;
    this.lastStepTime = now;

    if (surface === 'water') {
      this.playTone(170, 95, 0.09, 'sine', 0.07);
      this.playFilteredNoise(0.14, 'bandpass', 1200, 480, 0.08);
    } else if (surface === 'snow' || surface === 'sand') {
      this.playTone(82, 44, 0.06, 'sine', 0.05);
      this.playFilteredNoise(0.08, 'highpass', 1800, 950, 0.06);
    } else if (surface === 'metal') {
      this.playTone(290, 140, 0.07, 'triangle', 0.08);
      this.playFilteredNoise(0.04, 'bandpass', 2200, 1400, 0.04);
    } else {
      const pitch = 98 + (Math.random() - 0.5) * 18;
      this.playTone(pitch, 42, 0.08, 'sine', 0.08);
      this.playFilteredNoise(0.05, 'lowpass', 720, 260, 0.045);
    }
  }

  public playJump(): void {
    this.playTone(180, 360, 0.13, 'sine', 0.11);
    this.playFilteredNoise(0.12, 'bandpass', 600, 1800, 0.06);
  }

  public playLand(heavy = false): void {
    if (heavy) {
      this.playTone(135, 36, 0.2, 'triangle', 0.16);
      this.playFilteredNoise(0.18, 'lowpass', 680, 140, 0.11);
    } else {
      this.playTone(150, 58, 0.1, 'sine', 0.1);
      this.playFilteredNoise(0.08, 'lowpass', 540, 180, 0.06);
    }
  }

  public playBoardOrExit(enteringShip: boolean): void {
    // Pneumatic airlock seal + telemetry chime
    this.playFilteredNoise(0.22, 'bandpass', enteringShip ? 900 : 1400, enteringShip ? 2200 : 600, 0.09);
    if (enteringShip) {
      this.playTone(340, 560, 0.14, 'triangle', 0.1);
      setTimeout(() => this.playTone(580, 760, 0.12, 'sine', 0.09), 90);
    } else {
      this.playTone(560, 310, 0.16, 'triangle', 0.1);
    }
  }

  public playShipTakeoff(): void {
    this.playTone(75, 280, 0.52, 'sawtooth', 0.17);
    this.playFilteredNoise(0.55, 'lowpass', 320, 1400, 0.14);
  }

  public playShipLanding(): void {
    this.playFilteredNoise(0.32, 'bandpass', 1100, 240, 0.12);
    this.playTone(145, 48, 0.28, 'triangle', 0.18);
    setTimeout(() => this.playTone(260, 190, 0.12, 'sine', 0.08), 160);
  }

  public playTone(
    freq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType = 'sine',
    gainVal = 0.14
  ): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    g.gain.setValueAtTime(gainVal, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playScanPulse(): void {
    this.playTone(440, 1320, 0.36, 'sine', 0.12);
    setTimeout(() => this.playTone(720, 1680, 0.22, 'triangle', 0.07), 85);
  }

  public playScanTick(progress: number): void {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - this.lastScanTickTime < 0.16) return;
    this.lastScanTickTime = now;
    const f = 540 + Math.min(1, Math.max(0, progress)) * 620;
    this.playTone(f, f * 1.06, 0.05, 'sine', 0.05);
  }

  public playDiscovery(): void {
    this.playTone(523.25, 523.25, 0.18, 'triangle', 0.13);
    setTimeout(() => this.playTone(659.25, 659.25, 0.2, 'triangle', 0.13), 105);
    setTimeout(() => this.playTone(783.99, 783.99, 0.22, 'sine', 0.14), 210);
    setTimeout(() => this.playTone(1046.5, 1046.5, 0.42, 'sine', 0.15), 315);
  }

  public playPickupResource(): void {
    this.playTone(680, 980, 0.09, 'sine', 0.1);
    setTimeout(() => this.playTone(980, 1320, 0.1, 'triangle', 0.08), 55);
  }

  public playCraftSuccess(): void {
    this.playTone(280, 420, 0.1, 'triangle', 0.12);
    setTimeout(() => this.playTone(420, 630, 0.12, 'triangle', 0.12), 85);
    setTimeout(() => this.playTone(840, 840, 0.18, 'sine', 0.12), 170);
  }

  public playConsumable(effect?: string): void {
    if (effect === 'oxygen' || effect === 'heal') {
      this.playFilteredNoise(0.24, 'bandpass', 1400, 2600, 0.08);
      this.playTone(480, 760, 0.18, 'sine', 0.1);
    } else if (effect === 'hazard' || effect === 'shield') {
      this.playTone(320, 880, 0.2, 'triangle', 0.11);
    } else {
      this.playTone(180, 440, 0.22, 'sawtooth', 0.1);
    }
  }

  public playCreatureCall(temperament: string): void {
    if (temperament === 'predator') {
      this.playTone(165, 92, 0.34, 'sawtooth', 0.11);
      this.playFilteredNoise(0.26, 'bandpass', 420, 180, 0.08);
    } else {
      const f = 540 + Math.random() * 240;
      this.playTone(f, f * 1.35, 0.12, 'sine', 0.06);
      setTimeout(() => this.playTone(f * 1.25, f * 0.9, 0.14, 'triangle', 0.05), 110);
    }
  }

  public playAlertWarning(critical = false): void {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - this.lastAlertTime < 2.2) return;
    this.lastAlertTime = now;
    if (critical) {
      this.playTone(740, 540, 0.14, 'square', 0.08);
      setTimeout(() => this.playTone(740, 540, 0.16, 'square', 0.08), 180);
    } else {
      this.playTone(620, 620, 0.06, 'sine', 0.045);
    }
  }

  public playLaserBolt(enemy = false): void {
    const jitter = 0.92 + Math.random() * 0.16;
    if (enemy) {
      this.playTone(620 * jitter, 140 * jitter, 0.16, 'square', 0.09);
    } else {
      this.playTone(940 * jitter, 210 * jitter, 0.14, 'sawtooth', 0.11);
    }
  }

  public playShieldHit(): void {
    this.playTone(540, 180, 0.18, 'triangle', 0.14);
    this.playFilteredNoise(0.16, 'bandpass', 1800, 420, 0.11);
  }

  public playImpact(heavy = false): void {
    if (heavy) {
      this.playTone(130, 32, 0.28, 'sawtooth', 0.2);
      this.playFilteredNoise(0.26, 'lowpass', 780, 120, 0.16);
    } else {
      this.playTone(240, 75, 0.12, 'square', 0.11);
      this.playFilteredNoise(0.1, 'bandpass', 900, 250, 0.08);
    }
  }

  public playExplosion(): void {
    this.playTone(140, 26, 0.55, 'sawtooth', 0.24);
    this.playFilteredNoise(0.65, 'lowpass', 1400, 90, 0.22);
  }

  public playBuildPlace(): void {
    this.playTone(240, 480, 0.11, 'triangle', 0.14);
    setTimeout(() => this.playTone(620, 620, 0.08, 'sine', 0.1), 70);
  }

  public playWarpTransition(): void {
    this.playTone(110, 920, 1.35, 'sawtooth', 0.17);
    this.playFilteredNoise(1.4, 'bandpass', 240, 2400, 0.14);
    setTimeout(() => {
      this.playTone(880, 120, 0.9, 'sine', 0.16);
      this.playFilteredNoise(0.85, 'lowpass', 1800, 120, 0.15);
    }, 1350);
  }

  public playUiClick(): void {
    this.playTone(640, 820, 0.05, 'sine', 0.075);
  }

  public dispose(): void {
    this.silenceLoops();
    if (typeof window !== 'undefined' && this.onGestureUnlock) {
      window.removeEventListener('pointerdown', this.onGestureUnlock, true);
      window.removeEventListener('keydown', this.onGestureUnlock, true);
      window.removeEventListener('touchstart', this.onGestureUnlock, true);
      this.onGestureUnlock = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
