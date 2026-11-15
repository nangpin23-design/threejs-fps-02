// Procedural sound: every effect is synthesized with the Web Audio API, so
// the game ships no audio files. One shared context, created on the first
// user gesture; muted toggles with M. Distance attenuates by a simple
// 1/(1+d/18) falloff computed by the caller.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let stepAt = 0;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }
  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume();
  }
  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, Math.max(1, (seconds * ctx.sampleRate) | 0), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
  function noise({ duration, type = 'lowpass', frequency = 1200, q = 0.8, gain = 0.6, at = 0, slideTo = null }) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(duration + 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, t);
    if (slideTo !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + duration);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + duration + 0.05);
  }
  function tone({ frequency = 440, duration = 0.1, type = 'square', gain = 0.2, at = 0, slideTo = null }) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }
  function vol(distance) {
    return Math.max(0.08, 1 / (1 + distance / 18));
  }
  return {
    unlock,
    toggleMute() { muted = !muted; return muted; },
    get muted() { return muted; },
    shot(kind, distance = 0) {
      const v = vol(distance);
      if (kind === 'dmr') { noise({ duration: 0.16, frequency: 2600, q: 1.4, gain: 0.7 * v }); tone({ frequency: 180, duration: 0.09, type: 'sawtooth', gain: 0.25 * v, slideTo: 60 }); }
      else if (kind === 'shotgun') { noise({ duration: 0.28, frequency: 700, q: 0.6, gain: 0.85 * v, slideTo: 160 }); tone({ frequency: 110, duration: 0.2, type: 'sine', gain: 0.4 * v, slideTo: 40 }); }
      else noise({ duration: 0.11, frequency: 1500, q: 1, gain: 0.55 * v });
    },
    dryFire() { tone({ frequency: 1400, duration: 0.03, gain: 0.15 }); },
    reload() {
      tone({ frequency: 700, duration: 0.04, gain: 0.18 });
      tone({ frequency: 500, duration: 0.04, gain: 0.18, at: 0.18 });
      tone({ frequency: 900, duration: 0.05, gain: 0.2, at: 0.42 });
    },
    hit(kill) {
      tone({ frequency: kill ? 1320 : 990, duration: 0.06, gain: 0.22 });
      if (kill) tone({ frequency: 1760, duration: 0.09, gain: 0.18, at: 0.06 });
    },
    hurt() { tone({ frequency: 220, duration: 0.12, type: 'sawtooth', gain: 0.2, slideTo: 110 }); },
    explosion(distance = 0) {
      const v = vol(distance);
      noise({ duration: 0.9, frequency: 900, q: 0.5, gain: 0.9 * v, slideTo: 90 });
      tone({ frequency: 120, duration: 0.7, type: 'sine', gain: 0.5 * v, slideTo: 28 });
    },
    grenadePin() { tone({ frequency: 1800, duration: 0.03, gain: 0.14 }); },
    beep(final) {
      tone({ frequency: final ? 1500 : 1000, duration: 0.07, gain: 0.2 });
    },
    plantDone() {
      tone({ frequency: 880, duration: 0.1, gain: 0.22 });
      tone({ frequency: 1320, duration: 0.16, gain: 0.22, at: 0.1 });
    },
    step(distance = 0) {
      const now = performance.now();
      if (now - stepAt < 260) return;
      stepAt = now;
      noise({ duration: 0.05, frequency: 500, q: 0.7, gain: 0.12 * vol(distance) });
    },
    buy() { tone({ frequency: 660, duration: 0.06, gain: 0.18 }); tone({ frequency: 990, duration: 0.08, gain: 0.18, at: 0.06 }); },
    round(win) {
      const notes = win ? [523, 659, 784] : [392, 330, 262];
      notes.forEach((f, i) => tone({ frequency: f, duration: 0.16, gain: 0.2, at: i * 0.13 }));
    },
    tick() { tone({ frequency: 1200, duration: 0.04, gain: 0.14 }); },
  };
}
