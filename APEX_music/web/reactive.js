// Cinema and reactive disc are bundled in this existing NUI asset.
(function () {
  'use strict';
  var enabled = true, intensity = 65, current, impulses = new WeakMap(), peakCurve;
  function notify() { window.dispatchEvent(new Event('music:cinema')); }
  function impulse(context) {
    if (impulses.has(context)) return impulses.get(context);
    var length = Math.ceil(context.sampleRate * 0.6), buffer = context.createBuffer(2, length, context.sampleRate), seed = 9187;
    for (var channel = 0; channel < 2; channel++) {
      var data = buffer.getChannelData(channel), sum = 0, smooth = 0;
      for (var i = 0; i < length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        smooth += ((seed / 4294967296 * 2 - 1) - smooth) * 0.38;
        data[i] = smooth * Math.exp(-i / context.sampleRate * 9) * Math.min(1, i / (context.sampleRate * 0.012));
      }
      [0.014 + channel * 0.003, 0.031 + channel * 0.004, 0.052 - channel * 0.005].forEach(function (time, index) {
        data[Math.floor(time * context.sampleRate)] += 0.9 / (index + 1);
      });
      for (var j = 0; j < length; j++) sum += data[j] * data[j];
      var gain = 0.65 / Math.sqrt(sum);
      for (var k = 0; k < length; k++) data[k] *= gain;
    }
    impulses.set(context, buffer); return buffer;
  }
  function attach(context, input, output) {
    var nodes = [], effects, offTimer, disposed = false, processing = false;
    function gain(value) { var node = context.createGain(); node.gain.value = value; nodes.push(node); return node; }
    function filter(type, hz, db, q) {
      var node = context.createBiquadFilter(); node.type = type; node.frequency.value = hz; node.gain.value = db || 0;
      if (q !== undefined) node.Q.value = q; nodes.push(node); return node;
    }
    function ramp(param, value, immediate) {
      var now = context.currentTime;
      if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
      else param.cancelScheduledValues(now);
      if (immediate) param.setValueAtTime(value, now); else param.setTargetAtTime(value, now, 0.025);
    }
    var dry = gain(1), cinema = gain(0), gate = gain(1);
    input.connect(dry); dry.connect(gate); cinema.connect(gate); gate.connect(output);
    function build() {
      if (effects) return;
      var sub = filter('highpass', 25, 0, 0.7), bass = filter('lowshelf', 105), mud = filter('peaking', 330, 0, 0.8);
      var voice = filter('peaking', 2400, 0, 0.8), air = filter('highshelf', 6200), mix = gain(1), direct = gain(1);
      var roomHigh = filter('highpass', 180, 0, 0.7), roomLow = filter('lowpass', 5800, 0, 0.7);
      var delay = context.createDelay(0.1); delay.delayTime.value = 0.022; nodes.push(delay);
      var reverb = context.createConvolver(); reverb.normalize = false; reverb.buffer = impulse(context); nodes.push(reverb);
      var wet = gain(0), compressor = context.createDynamicsCompressor(); nodes.push(compressor);
      var limiter = context.createWaveShaper(); nodes.push(limiter);
      if (!peakCurve) {
        peakCurve = new Float32Array(4097);
        for (var c = 0; c < peakCurve.length; c++) {
          var x = c / (peakCurve.length - 1) * 2 - 1, magnitude = Math.abs(x);
          peakCurve[c] = Math.sign(x) * (magnitude <= 0.7 ? magnitude : 0.7 + 0.27 * (1 - Math.exp(-(magnitude - 0.7) / 0.27)));
        }
      }
      limiter.curve = peakCurve; limiter.oversample = '2x';
      compressor.threshold.value = -10; compressor.knee.value = 12; compressor.ratio.value = 4;
      compressor.attack.value = 0.004; compressor.release.value = 0.16;
      sub.connect(bass); bass.connect(mud); mud.connect(voice); voice.connect(air);
      air.connect(direct); direct.connect(mix);
      air.connect(roomHigh); roomHigh.connect(roomLow); roomLow.connect(delay); delay.connect(reverb); reverb.connect(wet); wet.connect(mix);
      mix.connect(compressor); compressor.connect(limiter); limiter.connect(cinema);
      effects = { input: sub, bass: bass, mud: mud, voice: voice, air: air, direct: direct, wet: wet };
    }
    function apply(immediate) {
      if (disposed) return;
      clearTimeout(offTimer);
      var strength = intensity / 100, on = enabled && strength > 0;
      if (on) {
        build();
        if (!processing) { input.connect(effects.input); processing = true; }
        ramp(effects.bass.gain, 6.5 * strength, immediate); ramp(effects.mud.gain, -2.2 * strength, immediate);
        ramp(effects.voice.gain, 2 * strength, immediate); ramp(effects.air.gain, 1.6 * strength, immediate);
        ramp(effects.direct.gain, 1 - 0.18 * strength, immediate); ramp(effects.wet.gain, 0.16 * strength, immediate);
      }
      ramp(dry.gain, on ? 0 : 1, immediate); ramp(cinema.gain, on ? 1 : 0, immediate);
      if (!on && processing) offTimer = setTimeout(function () {
        if (!disposed && !(enabled && intensity > 0)) { input.disconnect(effects.input); processing = false; }
      }, 250);
    }
    var route = { update: apply, active: function (value) { ramp(gate.gain, value ? 1 : 0, false); },
      dispose: function () {
        if (disposed) return; disposed = true; clearTimeout(offTimer);
        input.disconnect(dry); if (processing) input.disconnect(effects.input);
        nodes.forEach(function (node) { node.disconnect(); });
        if (current === route) { current = null; notify(); }
      }, state: function () { return { processing: processing }; } };
    try { apply(true); } catch (error) { route.dispose(); input.connect(output); return null; }
    current = route; notify(); return route;
  }
  function configure(settings) {
    if (typeof settings.enabled === 'boolean') enabled = settings.enabled;
    if (settings.intensity !== undefined && isFinite(Number(settings.intensity))) intensity = Math.round(Math.max(0, Math.min(100, Number(settings.intensity))));
    if (current) current.update(false); notify();
  }
  window.MusicCinema = { configure: configure, attach: attach,
    getState: function () { return { enabled: enabled, intensity: intensity, supported: !!current, processing: !!current && current.state().processing }; } };
})();

(function () {
  'use strict';
  var context, resuming, probe, frame = 0, lastTick = 0, energy = 0, lastPaint = -1;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var narrow = window.matchMedia('(max-width: 560px)');
  var hud = document.getElementById('hud'), hero = document.querySelector('.record-pulse');
  var halves = document.querySelectorAll('.disc-pulse');
  function prepare() {
    var API = window.AudioContext || window.webkitAudioContext;
    if (!API) return Promise.resolve();
    try {
      if (!context) context = new API({ latencyHint: 'interactive' });
      if (context.state === 'suspended' && !resuming) {
        resuming = context.resume().catch(function () {}).finally(function () { resuming = null; });
      }
      return resuming || Promise.resolve();
    } catch (_) { return Promise.resolve(); }
  }
  function ready() {
    return Promise.race([prepare(), new Promise(function (resolve) { setTimeout(resolve, 200); })]);
  }
  function visible() {
    return !document.hidden && !reduced.matches &&
      (document.body.dataset.menu === 'open' && !narrow.matches || !hud.hidden && hud.dataset.phase !== 'hidden' && !hud.classList.contains('suppressed'));
  }
  function paint(value) {
    if (Math.abs(value - lastPaint) < 0.002 && value !== 0) return;
    lastPaint = value;
    var scale = (1 + value * 0.65).toFixed(4);
    halves.forEach(function (half) { half.style.setProperty('--pulse-scale', scale); });
    if (hero) hero.style.setProperty('--pulse-scale', (1 + value * 0.35).toFixed(4));
  }
  function reset() {
    cancelAnimationFrame(frame); frame = 0; lastTick = 0; energy = 0; paint(0);
  }
  function level() {
    if (!probe || !probe.active || probe.audio.paused || probe.audio.muted || probe.audio.volume <= 0 || context.state !== 'running') return 0;
    var analyser = probe.analyser, bins = probe.bins, wave = probe.wave;
    analyser.getFloatFrequencyData(bins); analyser.getByteTimeDomainData(wave);
    var rms = 0, bass = 0, highs = 0;
    for (var i = 0; i < wave.length; i++) { var sample = (wave[i] - 128) / 128; rms += sample * sample; }
    rms = Math.sqrt(rms / wave.length);
    for (var b = probe.bassStart; b <= probe.bassEnd; b++) bass = Math.max(bass, Math.pow(10, bins[b] / 20));
    for (var h = probe.highStart; h <= probe.highEnd; h += 3) highs = Math.max(highs, Math.pow(10, bins[h] / 20));
    // The media source already includes the player's volume; do not attenuate it a second time.
    var loudness = bass * 2.8 + rms * 0.45 + highs * 0.1;
    // Soft compression boosts quieter bass without flattening every strong beat at the maximum.
    var drive = Math.max(0, (loudness - 0.025) / 0.55);
    return 1 - Math.exp(-drive * 1.4);
  }
  function tick(now) {
    frame = 0;
    if (!visible()) { reset(); return; }
    var dt = lastTick ? now - lastTick : 34;
    if (dt >= 30) {
      lastTick = now;
      var target = level();
      energy += (target - energy) * (1 - Math.exp(-Math.min(dt, 100) / (target > energy ? 45 : 190)));
      if (energy < 0.002 && target === 0) energy = 0;
      paint(energy);
    }
    if (probe && probe.active || energy > 0) frame = requestAnimationFrame(tick);
    else lastTick = 0;
  }
  function wake() {
    if (!visible()) { reset(); return; }
    if (!frame && (probe && probe.active || energy > 0)) frame = requestAnimationFrame(tick);
  }
  function attach(audio) {
    if (!context || context.state !== 'running') return null;
    var source, analyser, cinema;
    try {
      analyser = context.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.35;
      source = context.createMediaElementSource(audio);
      if (window.MusicCinema) cinema = window.MusicCinema.attach(context, source, analyser);
      else source.connect(analyser);
      analyser.connect(context.destination);
    } catch (_) {
      if (source) { try { source.connect(context.destination); } catch (_) {} }
      return null;
    }
    var hz = context.sampleRate / analyser.fftSize;
    var own = { audio: audio, analyser: analyser, active: false, bins: new Float32Array(analyser.frequencyBinCount), wave: new Uint8Array(analyser.fftSize),
      bassStart: Math.max(1, Math.floor(35 / hz)), bassEnd: Math.ceil(210 / hz),
      highStart: Math.floor(2200 / hz), highEnd: Math.min(analyser.frequencyBinCount - 1, Math.ceil(7500 / hz)) };
    probe = own;
    function audible() { if (cinema) cinema.active(own.active && !audio.muted && audio.volume > 0); }
    function playing() { own.active = true; audible(); prepare(); wake(); }
    function paused() { own.active = false; audible(); wake(); }
    function seeked() { if (!audio.paused && audio.readyState >= 3) playing(); }
    audio.addEventListener('playing', playing); audio.addEventListener('pause', paused); audio.addEventListener('ended', paused); audio.addEventListener('waiting', paused);
    audio.addEventListener('volumechange', audible); audio.addEventListener('seeking', paused); audio.addEventListener('seeked', seeked);
    return { resume: prepare, dispose: function () {
      own.active = false;
      audio.removeEventListener('playing', playing); audio.removeEventListener('pause', paused); audio.removeEventListener('ended', paused); audio.removeEventListener('waiting', paused);
      audio.removeEventListener('volumechange', audible); audio.removeEventListener('seeking', paused); audio.removeEventListener('seeked', seeked);
      if (cinema) cinema.dispose();
      source.disconnect(); analyser.disconnect();
      if (probe === own) { probe = null; reset(); }
    } };
  }
  document.addEventListener('visibilitychange', wake);
  if (reduced.addEventListener) reduced.addEventListener('change', wake);
  if (narrow.addEventListener) narrow.addEventListener('change', wake);
  window.addEventListener('beforeunload', function () { reset(); if (context) context.close().catch(function () {}); });
  window.MusicReactive = { prepare: prepare, ready: ready, attach: attach, wake: wake, reset: reset,
    getState: function () { return { attached: !!probe, running: !!frame, energy: energy, context: context ? context.state : 'none' }; } };
})();
