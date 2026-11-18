export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  private volume = 0.55;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private laserOsc: OscillatorNode | null = null;
  private laserGain: GainNode | null = null;
  private lastStepTime = 0;

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
      this.masterGain.connect(this.ctx.destination);
      this.initContinuousLoops();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private initContinuousLoops(): void {
    if (!this.ctx || !this.masterGain) return;
    // Continuous ship/jetpack thruster hum
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 210;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);
    this.engineOsc.start();

    // Continuous mining beam harmonic
    this.laserOsc = this.ctx.createOscillator();
    this.laserOsc.type = 'triangle';
    this.laserOsc.frequency.value = 180;
    this.laserGain = this.ctx.createGain();
    this.laserGain.gain.value = 0;
    this.laserOsc.connect(this.laserGain);
    this.laserGain.connect(this.masterGain);
    this.laserOsc.start();
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.04);
    }
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx && !this.muted) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.04);
    }
  }

  public silenceLoops(): void {
    if (!this.ctx) return;
    if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    if (this.laserGain) this.laserGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }

  public updateThruster(intensity: number, pitchBoost = 0): void {
    if (!this.ctx || !this.engineGain || !this.engineOsc) return;
    const clamped = Math.max(0, Math.min(1, intensity));
    this.engineGain.gain.setTargetAtTime(clamped * 0.14, this.ctx.currentTime, 0.06);
    this.engineOsc.frequency.setTargetAtTime(52 + clamped * 68 + pitchBoost * 40, this.ctx.currentTime, 0.06);
  }

  public updateMiningBeam(active: boolean): void {
    if (!this.ctx || !this.laserGain || !this.laserOsc) return;
    this.laserGain.gain.setTargetAtTime(active ? 0.11 : 0, this.ctx.currentTime, 0.04);
    if (active) {
      const wobble = Math.sin(this.ctx.currentTime * 22) * 18;
      this.laserOsc.frequency.setTargetAtTime(195 + wobble, this.ctx.currentTime, 0.03);
    }
  }

  public playFootstep(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - this.lastStepTime < 0.28) return;
    this.lastStepTime = now;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    const pitch = 95 + (Math.random() - 0.5) * 16;
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.08);
    g.gain.setValueAtTime(0.08, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playTone(
    freq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType = 'sine',
    gainVal = 0.14
  ): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    g.gain.setValueAtTime(gainVal, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playScanPulse(): void {
    this.playTone(420, 1280, 0.38, 'sine', 0.13);
    setTimeout(() => this.playTone(680, 1560, 0.25, 'triangle', 0.07), 90);
  }

  public playDiscovery(): void {
    this.playTone(523.25, 523.25, 0.18, 'triangle', 0.14);
    setTimeout(() => this.playTone(659.25, 659.25, 0.2, 'triangle', 0.14), 110);
    setTimeout(() => this.playTone(783.99, 1046.5, 0.35, 'sine', 0.16), 220);
  }

  public playLaserBolt(): void {
    const jitter = 0.92 + Math.random() * 0.16;
    this.playTone(920 * jitter, 210 * jitter, 0.14, 'sawtooth', 0.11);
  }

  public playImpact(heavy = false): void {
    if (heavy) {
      this.playTone(130, 32, 0.28, 'sawtooth', 0.22);
    } else {
      this.playTone(240, 75, 0.12, 'square', 0.11);
    }
  }

  public playBuildPlace(): void {
    this.playTone(240, 480, 0.11, 'triangle', 0.15);
    setTimeout(() => this.playTone(620, 620, 0.08, 'sine', 0.1), 70);
  }

  public playWarpTransition(): void {
    this.playTone(110, 880, 1.4, 'sawtooth', 0.18);
    setTimeout(() => this.playTone(880, 140, 0.9, 'sine', 0.16), 1400);
  }

  public playUiClick(): void {
    this.playTone(640, 820, 0.05, 'sine', 0.08);
  }

  public dispose(): void {
    this.silenceLoops();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
