/**
 * Procedural Web Audio synthesizer for the PrismForge 3D introduction animation.
 * Zero external audio assets required — works 100% offline on iOS, Android, and desktop.
 */

export interface IntroAudioController {
  isMuted: () => boolean;
  isSuspended: () => boolean;
  setMuted: (muted: boolean) => void;
  unlock: () => Promise<boolean>;
  playScene1: () => Promise<boolean>;
  playTransitionWhoosh: () => Promise<boolean>;
  playScene2: () => Promise<boolean>;
  playFinish: () => Promise<boolean>;
  dispose: () => void;
}

type WebAudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): WebAudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const win = window as Window & {
    AudioContext?: WebAudioContextCtor;
    webkitAudioContext?: WebAudioContextCtor;
  };
  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

export function createIntroAudio(): IntroAudioController {
  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let echoInput: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let muted = false;
  let disposed = false;

  const ensureGraph = (): AudioContext | null => {
    if (disposed) return null;
    if (ctx) return ctx;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;

    try {
      ctx = new Ctor();
    } catch {
      return null;
    }

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-14, ctx.currentTime);
    compressor.knee.setValueAtTime(16, ctx.currentTime);
    compressor.ratio.setValueAtTime(4, ctx.currentTime);
    compressor.attack.setValueAtTime(0.005, ctx.currentTime);
    compressor.release.setValueAtTime(0.18, ctx.currentTime);

    masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(muted ? 0 : 0.72, ctx.currentTime);

    masterGain.connect(compressor);
    compressor.connect(ctx.destination);

    // Subtle stereo-like dual feedback delay bus for crystalline prism shimmer
    echoInput = ctx.createGain();
    echoInput.gain.setValueAtTime(0.32, ctx.currentTime);

    const delayA = ctx.createDelay(1.0);
    delayA.delayTime.setValueAtTime(0.19, ctx.currentTime);
    const delayB = ctx.createDelay(1.0);
    delayB.delayTime.setValueAtTime(0.31, ctx.currentTime);

    const feedbackA = ctx.createGain();
    feedbackA.gain.setValueAtTime(0.34, ctx.currentTime);
    const feedbackB = ctx.createGain();
    feedbackB.gain.setValueAtTime(0.28, ctx.currentTime);

    const echoFilter = ctx.createBiquadFilter();
    echoFilter.type = 'lowpass';
    echoFilter.frequency.setValueAtTime(3400, ctx.currentTime);

    echoInput.connect(delayA);
    echoInput.connect(delayB);
    delayA.connect(echoFilter);
    delayB.connect(echoFilter);
    delayA.connect(feedbackA);
    feedbackA.connect(delayB);
    delayB.connect(feedbackB);
    feedbackB.connect(delayA);
    echoFilter.connect(masterGain);

    // Pre-build 1.2s soft pink-ish noise buffer for transition whooshes
    const len = Math.floor(ctx.sampleRate * 1.2);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      data[i] = (b0 + b1 + b2 + white * 0.12) * 0.65;
    }

    return ctx;
  };

  const tryResume = async (): Promise<boolean> => {
    const audio = ensureGraph();
    if (!audio || disposed) return false;
    if (audio.state === 'suspended') {
      try {
        await audio.resume();
      } catch {
        return false;
      }
    }
    return audio.state === 'running';
  };

  const playTone = (
    freq: number,
    startOffset: number,
    duration: number,
    peakGain: number,
    type: OscillatorType = 'sine',
    sendEcho = 0.35
  ) => {
    if (!ctx || !masterGain || !echoInput || muted || ctx.state !== 'running') return;
    const t0 = ctx.currentTime + startOffset;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.022);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(gain);
    gain.connect(masterGain);

    if (sendEcho > 0) {
      const echoSend = ctx.createGain();
      echoSend.gain.setValueAtTime(sendEcho, t0);
      gain.connect(echoSend);
      echoSend.connect(echoInput);
    }

    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  };

  return {
    isMuted: () => muted,
    isSuspended: () => {
      const audio = ensureGraph();
      if (!audio) return false;
      return audio.state !== 'running';
    },
    setMuted: (nextMuted: boolean) => {
      muted = nextMuted;
      if (ctx && masterGain) {
        masterGain.gain.setTargetAtTime(nextMuted ? 0 : 0.72, ctx.currentTime, 0.03);
      }
    },
    unlock: async () => tryResume(),
    playScene1: async () => {
      const ok = await tryResume();
      if (!ok || !ctx || !masterGain || muted) return false;

      const t = ctx.currentTime;

      // 1) Deep cinema sub swell
      const subOsc = ctx.createOscillator();
      const subHarmonic = ctx.createOscillator();
      const subFilter = ctx.createBiquadFilter();
      const subGain = ctx.createGain();

      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(55, t);
      subOsc.frequency.exponentialRampToValueAtTime(65.4, t + 1.1);

      subHarmonic.type = 'triangle';
      subHarmonic.frequency.setValueAtTime(110, t);
      subHarmonic.frequency.exponentialRampToValueAtTime(130.8, t + 1.1);

      subFilter.type = 'lowpass';
      subFilter.Q.setValueAtTime(2.6, t);
      subFilter.frequency.setValueAtTime(95, t);
      subFilter.frequency.exponentialRampToValueAtTime(520, t + 0.72);
      subFilter.frequency.exponentialRampToValueAtTime(140, t + 1.45);

      subGain.gain.setValueAtTime(0.0001, t);
      subGain.gain.linearRampToValueAtTime(0.28, t + 0.35);
      subGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.55);

      subOsc.connect(subFilter);
      subHarmonic.connect(subFilter);
      subFilter.connect(subGain);
      subGain.connect(masterGain);

      subOsc.start(t);
      subHarmonic.start(t);
      subOsc.stop(t + 1.6);
      subHarmonic.stop(t + 1.6);

      // 2) Crystalline PrismForge 3D harmonic arpeggio (C5 - G5 - B5 - D6 - E6)
      const prismNotes = [
        { f: 523.25, at: 0.06, dur: 0.9, vol: 0.13 },
        { f: 783.99, at: 0.18, dur: 0.95, vol: 0.11 },
        { f: 987.77, at: 0.31, dur: 1.0, vol: 0.1 },
        { f: 1174.66, at: 0.44, dur: 1.05, vol: 0.085 },
        { f: 1318.51, at: 0.58, dur: 1.15, vol: 0.075 },
      ];
      for (const n of prismNotes) {
        playTone(n.f, n.at, n.dur, n.vol, 'sine', 0.45);
        playTone(n.f * 2, n.at + 0.01, n.dur * 0.65, n.vol * 0.25, 'triangle', 0.35);
      }

      return true;
    },
    playTransitionWhoosh: async () => {
      const ok = await tryResume();
      if (!ok || !ctx || !masterGain || !noiseBuffer || muted) return false;

      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.setValueAtTime(2.4, t);
      filter.frequency.setValueAtTime(170, t);
      filter.frequency.exponentialRampToValueAtTime(1650, t + 0.22);
      filter.frequency.exponentialRampToValueAtTime(230, t + 0.52);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.28, t + 0.18);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.54);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      if (echoInput) {
        const echoSend = ctx.createGain();
        echoSend.gain.setValueAtTime(0.2, t);
        gain.connect(echoSend);
        echoSend.connect(echoInput);
      }

      src.start(t);
      src.stop(t + 0.58);
      return true;
    },
    playScene2: async () => {
      const ok = await tryResume();
      if (!ok || !ctx || !masterGain || muted) return false;

      const t = ctx.currentTime;

      // 1) Warm low impact hit for "Gift's Chuwi"
      const impactOsc = ctx.createOscillator();
      const impactGain = ctx.createGain();
      impactOsc.type = 'sine';
      impactOsc.frequency.setValueAtTime(92, t + 0.08);
      impactOsc.frequency.exponentialRampToValueAtTime(42, t + 0.65);

      impactGain.gain.setValueAtTime(0.0001, t + 0.08);
      impactGain.gain.linearRampToValueAtTime(0.32, t + 0.1);
      impactGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);

      impactOsc.connect(impactGain);
      impactGain.connect(masterGain);
      impactOsc.start(t + 0.08);
      impactOsc.stop(t + 0.85);

      // 2) Resonant Dmaj9 signature chord (D4 - A4 - E5 - F#5) + sparkling accent
      const chord = [
        { f: 293.66, at: 0.12, dur: 1.55, vol: 0.14, type: 'triangle' as OscillatorType },
        { f: 440.0, at: 0.16, dur: 1.5, vol: 0.12, type: 'sine' as OscillatorType },
        { f: 659.25, at: 0.22, dur: 1.45, vol: 0.1, type: 'sine' as OscillatorType },
        { f: 739.99, at: 0.28, dur: 1.4, vol: 0.09, type: 'sine' as OscillatorType },
        { f: 880.0, at: 0.44, dur: 1.1, vol: 0.08, type: 'sine' as OscillatorType },
        { f: 1318.51, at: 0.52, dur: 1.0, vol: 0.06, type: 'sine' as OscillatorType },
      ];
      for (const n of chord) {
        playTone(n.f, n.at, n.dur, n.vol, n.type, 0.42);
      }

      return true;
    },
    playFinish: async () => {
      const ok = await tryResume();
      if (!ok || !ctx || muted) return false;
      playTone(659.25, 0, 0.42, 0.09, 'sine', 0.28);
      playTone(987.77, 0.08, 0.58, 0.08, 'sine', 0.32);
      return true;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (ctx) {
        ctx.close().catch(() => {
          /* ignore */
        });
        ctx = null;
      }
      masterGain = null;
      echoInput = null;
      noiseBuffer = null;
    },
  };
}
