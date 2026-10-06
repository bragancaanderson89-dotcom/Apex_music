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
