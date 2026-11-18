// Vice Shores — all sound is synthesized with WebAudio. No audio files, no
// network: oscillators and filtered noise, shaped by envelopes, make the engine
// hum, the siren wail, gunshots, pickup blips and UI clicks.

export function createAudio() {
  let ctx = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let master = null;

  // The AudioContext may only start after a user gesture; ensure() is called
  // from the first click / keypress and is cheap to call again afterwards.
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
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      startEngineLoop();
      startSirenLoop();
      return true;
    } catch {
      return false;
    }
  }

  function startEngineLoop() {
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
  }

  function startSirenLoop() {
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 700;
    sirenLfo = ctx.createOscillator();
    sirenLfo.type = 'square';
    sirenLfo.frequency.value = 0.6;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    sirenLfo.connect(lfoGain);
    lfoGain.connect(sirenOsc.frequency);
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    sirenLfo.start();
  }

  // A short burst of white noise through a bandpass filter: a gunshot.
  function gunshot() {
    if (!ctx || muted) return;
    const dur = 0.14;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  // A two-note blip for pickups, mission updates and cash.
  function blip(freqA, freqB, dur) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(freqA, now);
    osc.frequency.setValueAtTime(freqB, now + dur / 2);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + dur);
  }

  function thud() {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  return {
    ensure,
    gunshot,
    thud,
    click() { blip(880, 660, 0.07); },
    pickup() { blip(660, 990, 0.16); },
    cash() { blip(523, 784, 0.22); },
    fail() { blip(220, 147, 0.35); },
    punch() { thud(); },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() { return muted; },
    // Called every frame: engine pitch follows speed, siren fades with wanted.
    update(speed, wanted) {
      if (!ctx) return;
      const target = speed > 0.5 ? 0.05 + Math.min(0.16, speed * 0.004) : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(50 + speed * 4.5, ctx.currentTime, 0.1);
      sirenGain.gain.setTargetAtTime(wanted > 0 ? 0.045 : 0, ctx.currentTime, 0.3);
    },
  };
}
