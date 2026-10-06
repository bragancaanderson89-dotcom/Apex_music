(function () {
  'use strict';
  var youtubeApi, spotifyApi;
  function scriptApi(name, url, callback, value) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script'), settled = false;
      var timeout = setTimeout(function () { finish(new Error('O serviço demorou para responder. Tente novamente.')); }, 18000);
      function finish(error, api) {
        if (settled) return; settled = true; clearTimeout(timeout);
        if (error) { script.remove(); reject(error); } else resolve(api);
      }
      window[callback] = function (api) { finish(null, value ? value() : api); };
      script.src = url; script.async = true; script.referrerPolicy = 'strict-origin-when-cross-origin';
      script.onerror = function () { finish(new Error('Não foi possível conectar ao ' + name + '.')); };
      document.head.appendChild(script);
    });
  }
  function youtube() {
    if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
    if (!youtubeApi) youtubeApi = scriptApi('YouTube', 'https://www.youtube.com/iframe_api', 'onYouTubeIframeAPIReady', function () { return window.YT; }).catch(function (error) { youtubeApi = null; throw error; });
    return youtubeApi;
  }
  function spotify() {
    if (!spotifyApi) spotifyApi = scriptApi('Spotify', 'https://open.spotify.com/embed/iframe-api/v1', 'onSpotifyIframeApiReady').catch(function (error) { spotifyApi = null; throw error; });
    return spotifyApi;
  }
  function direct(track, hooks) {
    var url = new URL(track.url, location.href), reactive = window.MusicReactive;
    var sameOrigin = url.origin === location.origin || location.protocol === 'file:' && url.protocol === 'file:';
    var policy;
    if (!reactive || !(window.AudioContext || window.webkitAudioContext)) policy = Promise.resolve(false);
    else if (sameOrigin || track.analysisSafe) policy = Promise.resolve(true);
    else {
      // A non-CORS MediaElementAudioSource is silenced by browsers; keep plain playback in that case.
      var controller = new AbortController(), timeout = setTimeout(function () { controller.abort(); }, 1200);
      policy = fetch(url.href, { method: 'HEAD', mode: 'cors', signal: controller.signal })
        .then(function (response) { return response.ok; }).catch(function () { return false; })
        .finally(function () { clearTimeout(timeout); });
    }
    return policy.then(function (safe) {
      return (safe ? reactive.ready() : Promise.resolve()).then(function () {
        if (!hooks.current()) throw new Error('Carregamento cancelado.');
        var audio = new Audio(), dead = false;
        if (safe && !sameOrigin) audio.crossOrigin = 'anonymous';
        audio.preload = 'metadata'; audio.volume = hooks.volume / 100; audio.src = track.url;
        var pulse = safe ? reactive.attach(audio) : null;
        audio.addEventListener('playing', function () { if (!dead) hooks.state('playing'); });
        audio.addEventListener('pause', function () { if (!dead && !audio.ended) hooks.state('paused'); });
        audio.addEventListener('waiting', function () { if (!dead) hooks.state('buffering'); });
        audio.addEventListener('ended', function () { if (!dead) hooks.ended(); });
        audio.addEventListener('error', function () { if (!dead) hooks.error('Não foi possível tocar esse áudio. Confira se a URL abre um arquivo de áudio HTTPS disponível.'); });
        ['timeupdate', 'loadedmetadata', 'durationchange'].forEach(function (event) {
          audio.addEventListener(event, function () { if (!dead) hooks.time(audio.currentTime || 0, isFinite(audio.duration) ? audio.duration : 0); });
        });
        return Promise.resolve({ capabilities: { volume: true, seek: true },
          play: function () { if (pulse) pulse.resume(); return audio.play(); }, pause: function () { audio.pause(); },
          seek: function (seconds) { if (isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(audio.duration, seconds)); },
          volume: function (value) { audio.volume = value / 100; },
          destroy: function () { dead = true; audio.pause(); if (pulse) pulse.dispose(); audio.removeAttribute('src'); audio.load(); } });
      });
    });
  }
  function ytPlayer(track, hooks, container) {
    if (location.protocol === 'file:') return Promise.reject(new Error('Para testar YouTube, abra START_DEV.cmd. O HTML aberto diretamente não envia a identificação exigida pelo player. A faixa demo continua funcionando aqui.'));
    return youtube().then(function (YT) {
      if (!hooks.current()) throw new Error('Carregamento cancelado.');
      return new Promise(function (resolve, reject) {
        var host = document.createElement('div'); container.replaceChildren(host);
        var player, dead = false, timer, settled = false;
        var timeout = setTimeout(function () { if (!settled) { settled = true; dead = true; if (player) player.destroy(); reject(new Error('O player do YouTube não respondeu. Verifique sua conexão.')); } }, 18000);
        var errors = { 2: 'O link do YouTube é inválido (erro 2).', 5: 'O navegador não conseguiu reproduzir este vídeo (erro 5).', 100: 'Vídeo removido ou privado (erro 100).', 101: 'Este vídeo bloqueia reprodução fora do YouTube (erro 101). Use outra versão da música ou um link direto de áudio.', 150: 'Este vídeo bloqueia reprodução fora do YouTube (erro 150). Use outra versão da música ou um link direto de áudio.', 153: 'YouTube recusou a identificação deste player (erro 153). Tente outro vídeo ou um link direto de áudio.' };
        player = new YT.Player(host, { width: '100%', height: '100%', videoId: track.id,
          playerVars: { autoplay: 0, controls: 1, playsinline: 1, rel: 0, origin: location.origin, enablejsapi: 1 },
          events: {
            onReady: function () {
              if (dead) return; settled = true; clearTimeout(timeout); player.setVolume(hooks.volume);
              var iframe = player.getIframe(); iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture'); iframe.referrerPolicy = 'strict-origin-when-cross-origin';
              timer = setInterval(function () { if (!dead) { try { hooks.time(player.getCurrentTime() || 0, player.getDuration() || 0); } catch (_) {} } }, 500);
              resolve({ capabilities: { volume: true, seek: true }, play: function () { player.playVideo(); }, pause: function () { player.pauseVideo(); }, seek: function (seconds) { player.seekTo(seconds, true); }, volume: function (value) { player.setVolume(value); }, destroy: function () { dead = true; clearInterval(timer); clearTimeout(timeout); player.destroy(); } });
            },
            onStateChange: function (event) {
              if (dead) return;
              if (event.data === 1) { hooks.state('playing'); var data = player.getVideoData(); if (data && data.title) hooks.metadata({ title: data.title, artist: data.author || 'YouTube' }); }
              else if (event.data === 2 || event.data === 5) hooks.state('paused');
              else if (event.data === 3) hooks.state('buffering');
              else if (event.data === 0) hooks.ended();
            },
            onAutoplayBlocked: function () { if (!dead) { hooks.state('paused'); hooks.notice('Clique no play do YouTube para autorizar o áudio neste navegador.'); } },
            onError: function (event) {
              if (dead) return; var message = errors[event.data] || 'O YouTube não conseguiu reproduzir essa faixa.';
              if (!settled) { settled = true; clearTimeout(timeout); dead = true; player.destroy(); reject(new Error(message)); } else hooks.error(message);
            }
          } });
      });
    });
  }
  function spotifyPlayer(track, hooks, container) {
    return spotify().then(function (API) {
      if (!hooks.current()) throw new Error('Carregamento cancelado.');
      return new Promise(function (resolve, reject) {
        var host = document.createElement('div'); container.replaceChildren(host);
        var controller, dead = false, settled = false, started = false, completed = false, manualPause = false;
        var timeout = setTimeout(function () { if (!settled) { settled = true; dead = true; if (controller) controller.destroy(); reject(new Error('O player do Spotify não respondeu. Tente um link do YouTube ou áudio direto.')); } }, 18000);
        API.createController(host, { uri: 'spotify:' + track.kind + ':' + track.id, width: '100%', height: 152 }, function (embed) {
          controller = embed;
          if (dead) { controller.destroy(); return; }
          function ready() {
            if (dead || settled) return; settled = true; clearTimeout(timeout);
            resolve({ capabilities: { volume: false, seek: track.kind === 'episode' }, play: function () { manualPause = false; controller.resume(); }, pause: function () { manualPause = true; controller.pause(); }, seek: function (seconds) { completed = false; controller.seek(seconds); }, volume: function () {}, destroy: function () { dead = true; clearTimeout(timeout); controller.destroy(); } });
          }
          controller.addListener('ready', ready);
          controller.addListener('playback_started', function () { if (!dead) { started = true; completed = false; ready(); hooks.state('playing'); } });
          controller.addListener('playback_update', function (event) {
            if (dead || !event.data) return; ready(); var data = event.data;
            hooks.time((data.position || 0) / 1000, (data.duration || 0) / 1000);
            hooks.state(data.isBuffering ? 'buffering' : data.isPaused ? 'paused' : 'playing');
            if (!data.isPaused && !data.isBuffering) started = true;
            if (!manualPause && !completed && started && !data.isBuffering && data.duration > 0 && data.position >= data.duration - 150) { completed = true; hooks.ended(); }
          });
        });
      });
    });
  }
  function original(track, hooks) {
    if (!hooks.resolve) return Promise.reject(new Error('Resolvedor de áudio original indisponível.'));
    return hooks.resolve(track.url).then(function (result) {
      if (!hooks.current()) throw new Error('Carregamento cancelado.');
      if (!result || !result.ok || !result.original) throw new Error(result && result.error || 'Inicie START_MUSIC.cmd no computador do servidor para ouvir o áudio original.');
      var media; try { media = new URL(result.audioUrl, location.href); } catch (_) { throw new Error('Origem de áudio inválida.'); }
      if (media.protocol !== 'https:' && !(media.protocol === 'http:' && /^(127\.0\.0\.1|localhost)$/.test(media.hostname))) throw new Error('O áudio original precisa de uma origem HTTPS ou local.');
      if (!/^\/media\/[a-f0-9]{48}$/.test(media.pathname)) throw new Error('O resolvedor retornou uma origem inválida.');
      hooks.metadata(result); hooks.resolved();
      return direct(Object.assign({}, track, { url: media.href, analysisSafe: true }), hooks);
    });
  }
  window.MusicProviders = { create: function (track, hooks, container) {
    if (track.provider === 'external' || track.provider === 'youtube' && hooks.resolverEnabled) return original(track, hooks);
    return track.provider === 'youtube' ? ytPlayer(track, hooks, container) : track.provider === 'spotify' ? spotifyPlayer(track, hooks, container) : direct(track, hooks);
  } };
})();
