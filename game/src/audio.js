// Neon Bay audio: everything is synthesized with WebAudio, no audio files.
// Gunshots and crashes are filtered noise, the siren is two alternating
// tones, the engine is a sawtooth that follows the car, and the music is a
// small synthwave loop (bass, hats and a pad) scheduled a bar ahead.

const TRACK_A = {
  tempo: 112,
  bass: [65.41, 65.41, 98.0, 77.78, 65.41, 65.41, 116.54, 98.0],
  pads: [
    [130.81, 155.56, 196.0],
    [103.83, 130.81, 155.56],
    [155.56, 196.0, 233.08],
    [116.54, 146.83, 174.61],
  ],
};
const TRACK_B = {
  tempo: 100,
  bass: [87.31, 87.31, 130.81, 103.83, 87.31, 87.31, 77.78, 130.81],
  pads: [
    [174.61, 207.65, 261.63],
    [138.59, 174.61, 207.65],
    [207.65, 261.63, 311.13],
    [155.56, 196.0, 233.08],
  ],
};

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let sfxBus = null;
  let noiseBuf = null;
  let muted = false;
  let trackIndex = 0;
  let barTimer = null;
  let nextBarAt = 0;
  let engineNodes = null;
  let sirenNodes = null;

  // --- Setup ---------------------------------------------------------------------
  function ensure() {
    if (ctx) return true;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.16;
      musicBus.connect(master);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.5;
      sfxBus.connect(master);
      const len = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  // --- One-shot voices -------------------------------------------------------------
  function noiseBurst(dur, filterFreq, type, gain, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(sfxBus);
    src.start(t);
    src.stop(t + dur);
  }

  function blip(freq, dur, type, gain, when = 0, slideTo = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(sfxBus);
    osc.start(t);
    osc.stop(t + dur);
  }

  // --- Music ------------------------------------------------------------------------
  function planBar(track, startAt) {
    const beat = 60 / track.tempo;
    const barDur = beat * 4;
    for (let i = 0; i < 8; i += 1) {
      const t = startAt + (i * barDur) / 8;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = track.bass[i];
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + barDur / 8);
      osc.connect(filter);
      filter.connect(g);
      g.connect(musicBus);
      osc.start(t);
      osc.stop(t + barDur / 8 + 0.05);
    }
    for (let i = 0; i < 4; i += 1) {
      const t = startAt + i * beat;
      for (const freq of track.pads[i]) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.08, t + 0.1);
        g.gain.exponentialRampToValueAtTime(0.001, t + beat * 1.1);
        osc.connect(g);
        g.connect(musicBus);
        osc.start(t);
        osc.stop(t + beat * 1.2);
      }
    }
    for (let i = 0; i < 8; i += 1) {
      const t = startAt + (i * barDur) / 8;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(i % 2 === 0 ? 0.06 : 0.03, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      src.connect(filter);
      filter.connect(g);
      g.connect(musicBus);
      src.start(t);
      src.stop(t + 0.06);
    }
  }

  function startMusic() {
    if (!ensure() || barTimer) return;
    nextBarAt = ctx.currentTime + 0.1;
    barTimer = setInterval(() => {
      if (!ctx) return;
      const track = trackIndex === 0 ? TRACK_A : TRACK_B;
      const barDur = (60 / track.tempo) * 4;
      while (nextBarAt < ctx.currentTime + 0.6) {
        planBar(track, Math.max(nextBarAt, ctx.currentTime));
        nextBarAt += barDur;
      }
    }, 200);
  }

  function stopMusic() {
    if (barTimer) {
      clearInterval(barTimer);
      barTimer = null;
    }
  }

  // --- Continuous voices ---------------------------------------------------------------
  function startEngine() {
    if (!ensure() || engineNodes) return;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 60;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(filter);
    filter.connect(g);
    g.connect(sfxBus);
    osc.start();
    engineNodes = { osc, filter, g };
  }

  function startSiren() {
    if (!ensure() || sirenNodes) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(g);
    g.connect(sfxBus);
    osc.start();
    sirenNodes = { osc, g, t: 0 };
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
      startMusic();
      startEngine();
      startSiren();
    },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    shot() {
      noiseBurst(0.12, 1800, 'highpass', 0.5);
      blip(220, 0.08, 'square', 0.15, 0, 60);
    },
    enemyShot() {
      noiseBurst(0.1, 1200, 'highpass', 0.25);
    },
    punch() {
      noiseBurst(0.08, 400, 'lowpass', 0.6);
    },
    crash() {
      noiseBurst(0.25, 500, 'lowpass', 0.7);
      blip(90, 0.2, 'sawtooth', 0.3, 0, 40);
    },
    pickup() {
      blip(660, 0.08, 'sine', 0.3);
      blip(990, 0.12, 'sine', 0.3, 0.07);
    },
    missionDone() {
      blip(523.25, 0.12, 'triangle', 0.3);
      blip(659.25, 0.12, 'triangle', 0.3, 0.1);
      blip(783.99, 0.25, 'triangle', 0.3, 0.2);
    },
    wantedUp() {
      blip(440, 0.15, 'square', 0.2);
      blip(415, 0.2, 'square', 0.2, 0.12);
    },
    click() {
      blip(800, 0.05, 'square', 0.15);
    },
    horn() {
      blip(370, 0.25, 'square', 0.2);
      blip(466, 0.25, 'square', 0.15);
    },
    token() {
      blip(880, 0.06, 'sine', 0.25);
      blip(1318, 0.1, 'sine', 0.25, 0.05);
    },
    nextTrack() {
      trackIndex = (trackIndex + 1) % 2;
      if (ctx) nextBarAt = ctx.currentTime + 0.1;
    },
    reload() {
      blip(300, 0.05, 'square', 0.15);
      blip(380, 0.05, 'square', 0.15, 0.1);
    },
    engine(speed, driving) {
      if (!engineNodes) return;
      const target = driving ? 0.05 + Math.min(0.12, Math.abs(speed) / 5000) : 0.0;
      engineNodes.g.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineNodes.osc.frequency.setTargetAtTime(50 + Math.abs(speed) * 0.25, ctx.currentTime, 0.1);
      engineNodes.filter.frequency.setTargetAtTime(200 + Math.abs(speed) * 0.8, ctx.currentTime, 0.1);
    },
    siren(on, dt) {
      if (!sirenNodes) return;
      const g = sirenNodes.g;
      const target = on ? 0.045 : 0;
      g.gain.setTargetAtTime(target, ctx.currentTime, 0.2);
      if (on) {
        sirenNodes.t += dt;
        const phase = Math.floor(sirenNodes.t * 2.2) % 2;
        sirenNodes.osc.frequency.setTargetAtTime(phase === 0 ? 700 : 950, ctx.currentTime, 0.05);
      }
    },
  };
}
