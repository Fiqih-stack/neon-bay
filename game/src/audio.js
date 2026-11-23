// Neon Bay audio: everything is synthesized with WebAudio — no audio files.
// Gunshots and crashes are filtered noise, the siren is two alternating tones,
// the engine is a sawtooth that follows the car, and the music is a small
// synthwave loop (bass, hats and a pad) scheduled a bar ahead.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let musicTimer = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenStep = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBuffer(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  }

  function noiseHit(dur, filterFreq, vol) {
    if (!ctx || muted) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur + 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
    src.stop(ctx.currentTime + dur + 0.05);
  }

  // Bass line over Am – F – C – G, one bar each, 8th notes at 100 BPM.
  const BASS = [55, 55, 65.41, 55, 55, 65.41, 55, 82.41, 43.65, 43.65, 52, 43.65, 43.65, 52, 43.65, 65.41, 65.41, 65.41, 78.46, 65.41, 65.41, 78.46, 65.41, 82.41, 49, 49, 58.27, 49, 49, 58.27, 49, 73.42];
  // Track two: the same groove over Dm – Bb – F – C, for the radio key (T).
  const BASS2 = [73.42, 73.42, 87.31, 73.42, 73.42, 87.31, 73.42, 110, 58.27, 58.27, 69.3, 58.27, 58.27, 69.3, 58.27, 87.31, 87.31, 87.31, 104.65, 87.31, 87.31, 104.65, 87.31, 110, 65.41, 65.41, 77.78, 65.41, 65.41, 77.78, 65.41, 98];
  const PADS = [[220, 261.63, 329.63], [146.83, 174.61, 220]];
  const STEP_SEC = 0.3;
  let musicStep = 0;
  let musicTrack = 0;
  let nextTime = 0;

  function scheduleMusic() {
    if (!ctx || muted) return;
    while (nextTime < ctx.currentTime + 0.4) {
      const step = musicStep % 32;
      const when = Math.max(nextTime, ctx.currentTime);
      const bass = (musicTrack === 0 ? BASS : BASS2)[step];
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = bass;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(0.055, when + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, when + STEP_SEC * 0.95);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 700;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      osc.start(when);
      osc.stop(when + STEP_SEC);
      if (step % 2 === 0) {
        const hat = ctx.createBufferSource();
        hat.buffer = noiseBuffer(0.05);
        const hFilter = ctx.createBiquadFilter();
        hFilter.type = 'highpass';
        hFilter.frequency.value = 6000;
        const hGain = ctx.createGain();
        hGain.gain.setValueAtTime(step % 8 === 4 ? 0.05 : 0.025, when);
        hGain.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
        hat.connect(hFilter);
        hFilter.connect(hGain);
        hGain.connect(master);
        hat.start(when);
      }
      if (step === 0 || step === 8 || step === 16 || step === 24) {
        const padNotes = PADS[musicTrack];
        for (let i = 0; i < padNotes.length; i += 1) {
          const pad = ctx.createOscillator();
          pad.type = 'sawtooth';
          pad.frequency.value = padNotes[i] * (step === 8 ? 0.89 : step === 16 ? 1.19 : step === 24 ? 1.5 : 1);
          const pGain = ctx.createGain();
          pGain.gain.setValueAtTime(0.0001, when);
          pGain.gain.linearRampToValueAtTime(0.014, when + 0.4);
          pGain.gain.linearRampToValueAtTime(0.0001, when + STEP_SEC * 8);
          const pFilter = ctx.createBiquadFilter();
          pFilter.type = 'lowpass';
          pFilter.frequency.value = 900;
          pad.connect(pFilter);
          pFilter.connect(pGain);
          pGain.connect(master);
          pad.start(when);
          pad.stop(when + STEP_SEC * 8);
        }
      }
      musicStep += 1;
      nextTime += STEP_SEC;
    }
  }

  return {
    unlock() {
      if (ensure() && !musicTimer) {
        nextTime = ctx.currentTime + 0.1;
        musicTimer = window.setInterval(scheduleMusic, 120);
      }
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    shot() {
      if (!ensure()) return;
      noiseHit(0.14, 2600, 0.5);
      blip(220, 0.08, 'square', 0.2, 70);
    },
    enemyShot() {
      if (!ensure()) return;
      noiseHit(0.12, 1800, 0.22);
    },
    punch() {
      if (!ensure()) return;
      noiseHit(0.09, 500, 0.4);
      blip(140, 0.09, 'sine', 0.3, 60);
    },
    crash(strength) {
      if (!ensure()) return;
      noiseHit(0.25, 900, 0.25 + 0.35 * Math.min(1, strength));
    },
    pickup() {
      if (!ensure()) return;
      blip(660, 0.09, 'sine', 0.25);
      window.setTimeout(() => blip(990, 0.12, 'sine', 0.25), 90);
    },
    missionDone() {
      if (!ensure()) return;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => window.setTimeout(() => blip(f, 0.22, 'triangle', 0.22), i * 110));
    },
    wantedUp() {
      if (!ensure()) return;
      blip(330, 0.16, 'sawtooth', 0.16, 220);
      window.setTimeout(() => blip(220, 0.2, 'sawtooth', 0.16, 165), 160);
    },
    click() {
      if (!ensure()) return;
      blip(880, 0.05, 'sine', 0.15);
    },
    /** Car horn: two short blasts that scatter nearby pedestrians. */
    horn() {
      if (!ensure()) return;
      blip(370, 0.16, 'square', 0.2);
      window.setTimeout(() => blip(370, 0.14, 'square', 0.18), 170);
    },
    /** Neon token pickup: a bright two-note chime. */
    token() {
      if (!ensure()) return;
      blip(880, 0.08, 'sine', 0.22);
      window.setTimeout(() => blip(1318, 0.14, 'sine', 0.22), 80);
    },
    /** Switch the radio between the two synthwave tracks. */
    nextTrack() {
      musicTrack = 1 - musicTrack;
      musicStep = 0;
      if (!ensure()) return;
      blip(660, 0.07, 'sine', 0.15);
    },
    reload() {
      if (!ensure()) return;
      blip(440, 0.05, 'square', 0.12);
      window.setTimeout(() => blip(550, 0.05, 'square', 0.12), 120);
    },
    engine(on, speedRatio) {
      if (!ensure()) return;
      if (!on) {
        if (engineGain) engineGain.gain.value = 0;
        return;
      }
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineFilter = ctx.createBiquadFilter();
        engineFilter.type = 'lowpass';
        engineFilter.frequency.value = 600;
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        engineOsc.connect(engineFilter);
        engineFilter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      engineOsc.frequency.value = 55 + speedRatio * 130;
      engineGain.gain.value = muted ? 0 : 0.05 + speedRatio * 0.05;
    },
    siren(on) {
      if (!ensure()) return;
      if (!on) {
        if (sirenGain) sirenGain.gain.value = 0;
        return;
      }
      if (!sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'triangle';
        sirenOsc.frequency.value = 750;
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
        window.setInterval(() => {
          if (sirenOsc && !muted) {
            sirenStep = 1 - sirenStep;
            sirenOsc.frequency.value = sirenStep ? 950 : 700;
          }
        }, 450);
      }
      sirenGain.gain.value = muted ? 0 : 0.045;
    },
  };
}
