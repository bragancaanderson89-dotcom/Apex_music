(function () {
  'use strict';
  var C = window.MusicCore, $ = function (id) { return document.getElementById(id); };
  // Audio effects are optional; a missing module must never prevent menu startup.
  var fallbackCinema = { enabled: true, intensity: 65, supported: false, processing: false };
  var noCinema = { getState: function () { return Object.assign({}, fallbackCinema); }, configure: function (data) {
    if (typeof data.enabled === 'boolean') fallbackCinema.enabled = data.enabled;
    if (data.intensity !== undefined && isFinite(Number(data.intensity))) fallbackCinema.intensity = Math.max(0, Math.min(100, Number(data.intensity)));
  } };
  function cinemaEngine() { return window.MusicCinema || noCinema; }
  var inGame = typeof GetParentResourceName === 'function', preview = !inGame && new URLSearchParams(location.search).has('preview');
  var options = { volume: 45, hudEnabled: true, maxQueue: 30, allowYouTube: true, allowSpotify: true, allowDirectAudio: true, allowHttp: preview, allowResolver: true, resolverEnabled: preview && location.protocol !== 'file:' };
  var panel = $('panel'), hud = $('hud'), container = $('provider-container');
  var menuOpen = false, current = null, engine = null, generation = 0, status = 'idle', elapsed = 0, duration = 0;
  var volume = 45, previousVolume = 45, repeat = false, tab = 'queue', queue = [], favorites = [], recent = [], history = [];
  var hudEnabled = true, hudSuppressed = false, hudTimer, hudHideTimer, hudOpenTimer, hudFrame, noticeTimer, preferenceTimer;
  var caps = { volume: true, seek: false }, starting = false;
  function readStore() { try { return JSON.parse(localStorage.getItem('APEX_music:library:v1') || localStorage.getItem('zsx_music:library:v1') || '{}') || {}; } catch (_) { return {}; } }
  function saveStore() { try { localStorage.setItem('APEX_music:library:v1', JSON.stringify({ favorites: favorites, recent: recent, volume: volume, hud: hudEnabled, cinema: cinemaEngine().getState() })); } catch (_) {} }
  var stored = readStore(); favorites = C.restoreTracks(stored.favorites, 40, options); recent = C.restoreTracks(stored.recent, 30, options);
  if (!inGame) { if (isFinite(stored.volume)) volume = Math.max(0, Math.min(100, Number(stored.volume))); hudEnabled = stored.hud !== false; }
  if (!inGame && stored.cinema) cinemaEngine().configure(stored.cinema);
  function nui(name, data) {
    if (!inGame) {
      if (name !== 'resolve') return Promise.resolve({ ok: true });
      if (location.protocol === 'file:') return Promise.resolve({ ok: false, error: 'Abra START_DEV.cmd para testar áudio original.' });
      var controller = new AbortController(), timeout = setTimeout(function () { controller.abort(); }, 40000);
      return fetch('/_music/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-APEX-Preview': '1' }, body: JSON.stringify(data || {}), signal: controller.signal })
        .then(function (response) { return response.json(); }).then(function (result) { if (result.audioPath) result.audioUrl = new URL(result.audioPath, location.origin).href; return result; })
        .catch(function () { return { ok: false, error: 'Não foi possível conectar ao resolvedor. Abra START_DEV.cmd e tente novamente.' }; }).finally(function () { clearTimeout(timeout); });
    }
    return fetch('https://' + GetParentResourceName() + '/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(data || {}) }).then(function (response) { return response.json(); }).catch(function () { return { ok: false }; });
  }
  function persistPreferences(immediate) {
    clearTimeout(preferenceTimer); saveStore();
    var save = function () { var cinema = cinemaEngine().getState(); nui('preferences', { volume: volume, hud: hudEnabled, cinemaEnabled: cinema.enabled, cinemaIntensity: cinema.intensity }); };
    if (immediate) save(); else preferenceTimer = setTimeout(save, 250);
  }
  function notice(message, kind, timeout) {
    clearTimeout(noticeTimer); $('notice').hidden = !message; $('notice').textContent = message || ''; $('notice').dataset.kind = kind || 'info';
    if (message && timeout) noticeTimer = setTimeout(function () { $('notice').hidden = true; placeEmbed(); }, timeout);
    requestAnimationFrame(placeEmbed);
  }
  function configure(data) {
    if (!data || typeof data !== 'object') return;
    Object.keys(options).forEach(function (key) { if (data[key] !== undefined) options[key] = data[key]; });
    if (isFinite(data.volume)) setVolume(Number(data.volume), false);
    cinemaEngine().configure({ enabled: data.cinemaEnabled, intensity: data.cinemaIntensity });
    if (typeof data.hudEnabled === 'boolean') { hudEnabled = data.hudEnabled; $('hud-toggle').checked = hudEnabled; }
    options.maxQueue = Math.max(1, Math.min(60, Number(options.maxQueue) || 30));
    var style = data.hud || {};
    document.documentElement.style.setProperty('--hud-size', Math.max(52, Math.min(100, Number(style.size) || 72)) + 'px');
    document.documentElement.style.setProperty('--hud-opacity', Math.max(0.2, Math.min(1, Number(style.opacity) || 0.78)));
    hud.style.top = Math.max(0, Math.min(innerHeight - 110, Number(style.top) || 34)) + 'px';
    hud.style.left = Math.max(0, Math.min(innerWidth - 350, Number(style.left) || 32)) + 'px';
    hud.style.setProperty('--hud-left', hud.style.left);
    options.detailSeconds = Math.max(1, Math.min(15, Number(style.detailSeconds) || 5));
    if (!hudEnabled) hideHud(true);
  }
  function cancelHudTimers() { clearTimeout(hudTimer); clearTimeout(hudHideTimer); clearTimeout(hudOpenTimer); cancelAnimationFrame(hudFrame); }
  function hideHud(immediate) {
    cancelHudTimers(); hud.dataset.phase = 'hidden';
    if (immediate) hud.hidden = true; else hudHideTimer = setTimeout(function () { hud.hidden = true; }, 700);
    window.MusicReactive.wake();
  }
  function expandHud() {
    if (!current || menuOpen || !hudEnabled || hudSuppressed) return;
    var needsEntry = hud.hidden || hud.dataset.phase === 'hidden';
    cancelHudTimers(); hud.hidden = false;
    function openDetails() {
      if (!current || menuOpen || !hudEnabled || hudSuppressed) return;
      hud.dataset.phase = 'expanded';
      window.MusicReactive.wake();
      hudTimer = setTimeout(function () { hud.dataset.phase = 'compact'; }, (options.detailSeconds || 5) * 1000 + 700);
    }
    if (needsEntry) {
      hud.dataset.phase = 'hidden'; void hud.offsetWidth;
      hudFrame = requestAnimationFrame(function () { hud.dataset.phase = 'entering'; window.MusicReactive.wake(); hudOpenTimer = setTimeout(openDetails, 650); });
    } else openDetails();
  }
  function setMenu(open) {
    if (menuOpen === open) return;
    menuOpen = open; panel.hidden = !open; document.body.dataset.menu = open ? 'open' : 'closed';
    if (open) { hideHud(true); renderLibrary(); requestAnimationFrame(function () { placeEmbed(); $('url').focus(); }); }
    else { persistPreferences(true); expandHud(); }
  }
  function closeMenu() { setMenu(false); nui('close'); }
  function setService(provider) {
    panel.dataset.provider = provider || '';
    $('service-slot').hidden = !provider || provider === 'direct';
    $('service-name').textContent = provider === 'spotify' ? 'Spotify · player oficial' : 'YouTube · player oficial';
    requestAnimationFrame(placeEmbed);
  }
  function placeEmbed() {
    if (!menuOpen || $('service-slot').hidden) { $('service-layer').style.left = '-10000px'; return; }
    var rect = $('service-space').getBoundingClientRect();
    Object.assign($('service-layer').style, { left: rect.left + 'px', top: rect.top + 'px', width: Math.max(200, rect.width) + 'px', height: Math.max(current && current.provider === 'spotify' ? 152 : 200, rect.height) + 'px' });
  }
  function iconUse(id) { var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); var use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', '#' + id); svg.appendChild(use); return svg; }
  function coverImage(image, url) { image.onerror = function () { image.onerror = null; image.src = 'assets/default-cover.svg'; }; image.src = url || 'assets/default-cover.svg'; }
  function trackDisplay() {
    $('track-title').textContent = current ? current.title : 'Sua próxima favorita.';
    $('track-title').title = current ? current.title : '';
    $('track-artist').textContent = current ? current.artist : 'Cole um link e deixe o resto com a música.';
    $('source-badge').textContent = current ? current.provider === 'external' ? current.source || 'Áudio original' : { youtube: 'YouTube', spotify: 'Spotify', direct: 'Áudio direto' }[current.provider] : 'Seu espaço';
    $('hud-title').textContent = current ? current.title : ''; $('hud-artist').textContent = current ? current.artist : '';
    var provider = current ? current.provider : 'direct';
    hud.dataset.provider = provider;
    document.querySelectorAll('.provider-symbol use').forEach(function (icon) { icon.setAttribute('href', '#i-source-' + (provider === 'external' ? 'direct' : provider)); });
    document.querySelectorAll('img.cover').forEach(function (image) { if (image.getAttribute('src') !== (current ? current.cover : 'assets/default-cover.svg')) coverImage(image, current && current.cover); });
    $('favorite').disabled = !current; $('favorite').setAttribute('aria-pressed', String(!!current && favorites.some(function (track) { return track.url === current.url; })));
    $('stop').disabled = !current; $('previous').disabled = !history.length;
    $('next').disabled = !queue.length; $('toggle-play').disabled = !current && !queue.length;
    updateTransport();
  }
  function updateTransport() {
    var playing = status === 'playing' || status === 'buffering';
    document.body.dataset.playing = String(playing); document.body.dataset.status = status;
    var labels = { idle: 'Pronto para ouvir', loading: 'Preparando sua música…', playing: 'Tocando agora', paused: 'Música pausada', buffering: 'Carregando áudio…', ended: 'Faixa concluída', error: 'Não foi possível tocar' };
    var statusNode = $('playback-status'); statusNode.lastChild.textContent = labels[status] || labels.idle;
    $('hud-eyebrow').textContent = (status === 'paused' ? 'EM PAUSA' : status === 'loading' || status === 'buffering' ? 'CARREGANDO' : status === 'error' ? 'FAIXA INDISPONÍVEL' : 'AGORA TOCANDO');
    $('transport-label').textContent = current ? current.audioMode === 'original' ? 'Áudio original' : { youtube: 'YouTube', spotify: 'Player Spotify', direct: 'Áudio direto', external: 'Áudio original' }[current.provider] : 'Nada tocando';
    $('toggle-play').replaceChildren(iconUse(playing ? 'i-pause' : 'i-play')); $('toggle-play').setAttribute('aria-label', playing ? 'Pausar' : 'Reproduzir');
    $('volume').disabled = !caps.volume; $('mute').disabled = !caps.volume;
    $('volume').title = caps.volume ? 'Volume' : 'O Spotify não oferece controle externo de volume. Use o player do serviço.';
    $('volume-value').textContent = caps.volume ? volume + '%' : '—';
    $('seek').disabled = !engine || !caps.seek || duration <= 0;
    updateCinema();
  }
  function updateCinema() {
    var cinema = cinemaEngine().getState(), unavailable = !window.MusicCinema || !!current && !starting && !cinema.supported;
    $('cinema-settings').hidden = unavailable;
    $('cinema-toggle').checked = cinema.enabled; $('cinema-toggle').disabled = unavailable;
    $('cinema-intensity').value = cinema.intensity; $('cinema-intensity').disabled = unavailable || !cinema.enabled;
    $('cinema-value').textContent = cinema.intensity + '%';
    $('cinema-intensity').style.setProperty('--range-fill', cinema.intensity + '%');
    $('cinema-status').textContent = unavailable ? 'Efeito indisponível neste player' : cinema.enabled && cinema.intensity > 0 ? 'Graves e ambiência estéreo' : 'Som original';
    $('cinema-settings').dataset.active = String(cinema.enabled && cinema.intensity > 0 && !unavailable);
  }
  function setState(next) {
    if (status === next) return;
    status = next; updateTransport();
    nui('state', { status: status, title: current && current.title, provider: current && current.provider });
    if (!menuOpen && current && next === 'playing' && (hud.hidden || hud.dataset.phase === 'compact')) expandHud();
  }
  function setTime(position, length) {
    elapsed = Math.max(0, Number(position) || 0); duration = Math.max(0, Number(length) || 0);
    $('elapsed').textContent = C.clock(elapsed); $('duration').textContent = duration ? C.clock(duration) : current && status === 'playing' && current.provider === 'direct' ? 'AO VIVO' : '0:00';
    if (document.activeElement !== $('seek')) $('seek').value = duration ? Math.min(1000, elapsed / duration * 1000) : 0;
    $('seek').style.setProperty('--range-fill', Math.min(100, Number($('seek').value) / 10) + '%');
    $('seek').disabled = !engine || !caps.seek || duration <= 0;
  }
  function setVolume(value, persist) {
    volume = Math.round(Math.max(0, Math.min(100, Number(value) || 0))); $('volume').value = volume;
    $('volume').style.setProperty('--range-fill', volume + '%');
    if (volume) previousVolume = volume;
    if (engine && caps.volume) engine.volume(volume);
    $('mute').setAttribute('aria-label', volume === 0 ? 'Ativar som' : 'Silenciar'); $('mute').style.opacity = volume === 0 ? '.45' : '1';
    updateTransport(); if (persist !== false) persistPreferences();
  }
  function mergeMetadata(track, data) {
    if (!data || typeof data !== 'object') return;
    if (!track.manualTitle && data.title) track.title = C.text(data.title, 180);
    if (data.artist) track.artist = C.text(data.artist, 120);
    if (!track.manualCover && C.safeUrl(data.cover, options.allowHttp)) track.cover = data.cover;
    if (data.source) track.source = C.text(data.source, 80);
    [favorites, recent].forEach(function (items) { items.forEach(function (item) { if (item.url === track.url) { if (!item.manualTitle) item.title = track.title; item.artist = track.artist; if (!item.manualCover) item.cover = track.cover; } }); });
    if (current === track) { trackDisplay(); nui('state', { status: status, title: track.title, provider: track.provider }); }
    saveStore(); renderLibrary();
  }
  function fetchMetadata(track) {
    if (track.provider !== 'youtube' && track.provider !== 'spotify') return;
    nui('metadata', { provider: track.provider, id: track.id, kind: track.kind }).then(function (data) { if (data.ok) mergeMetadata(track, data); });
  }
  function destroyEngine() { if (engine) { engine.destroy(); engine = null; } container.replaceChildren(); }
  function fail(message, token) {
    if (token !== generation) return;
    starting = false; destroyEngine(); caps.seek = false; setService(null); setState('error'); notice(message, 'error'); trackDisplay();
    var actions = document.createElement('div'); actions.className = 'notice-actions';
    var change = document.createElement('button'); change.type = 'button'; change.className = 'notice-action'; change.textContent = 'Trocar link';
    change.addEventListener('click', function () { setMenu(true); $('url').value = current ? current.url : ''; $('url').focus(); $('url').select(); });
    actions.appendChild(change);
    if (queue.length) {
      var skip = document.createElement('button'); skip.type = 'button'; skip.className = 'notice-action'; skip.textContent = 'Próxima da fila'; skip.addEventListener('click', nextTrack); actions.appendChild(skip);
    }
    $('notice').appendChild(actions); requestAnimationFrame(placeEmbed);
  }
  function loadTrack(track, remember) {
    try { C.parseLink(track.url, options); } catch (error) { notice(error.message, 'error'); return; }
    if (track.provider === 'direct' || track.provider === 'external' || track.provider === 'youtube' && options.resolverEnabled) window.MusicReactive.prepare();
    var token = ++generation;
    if (remember !== false && current && current.url !== track.url) { history.push(current); if (history.length > 30) history.shift(); }
    destroyEngine(); current = track; starting = true; caps = { volume: track.provider !== 'spotify', seek: false };
    delete track.audioMode;
    setTime(0, 0); setService(track.provider === 'external' || track.provider === 'youtube' && options.resolverEnabled || preview && track.url === 'https://demo.apex.local/midnight-drive.mp3' ? null : track.provider); setState('loading'); trackDisplay();
    recent = recent.filter(function (item) { return item.url !== track.url; }); recent.unshift(Object.assign({}, track)); recent = recent.slice(0, 30); saveStore(); renderLibrary();
    notice(track.provider === 'spotify' ? 'Spotify pode tocar apenas uma prévia no FiveM. A reprodução completa depende do player e da sessão do serviço.' : '', 'info');
    var ownContainer = document.createElement('div'); ownContainer.style.height = '100%'; container.appendChild(ownContainer);
    var hooks = {
      volume: volume, current: function () { return token === generation; },
      state: function (next) { if (token === generation) setState(next); },
      time: function (position, length) { if (token === generation) setTime(position, length); },
      metadata: function (data) { if (token === generation) mergeMetadata(track, data); },
      notice: function (message) { if (token === generation) notice(message); },
      error: function (message) { fail(message, token); },
      ended: function () { if (token === generation) onEnded(); }
    };
    hooks.resolverEnabled = options.resolverEnabled;
    hooks.resolve = function (url) { return nui('resolve', { url: url }); };
    hooks.resolved = function () { if (token === generation) { track.audioMode = 'original'; setService(null); updateTransport(); } };
    var adapterPromise = preview && track.url === 'https://demo.apex.local/midnight-drive.mp3'
      ? Promise.resolve(previewEngine(hooks)) : window.MusicProviders.create(track, hooks, ownContainer);
    adapterPromise.then(function (adapter) {
      if (token !== generation) { adapter.destroy(); return; }
      engine = adapter; caps = adapter.capabilities; starting = false; updateTransport(); placeEmbed();
      return Promise.resolve(engine.play()).catch(function (error) {
        if (token !== generation) return;
        if (error.name === 'NotAllowedError') { setState('paused'); notice('Clique em reproduzir para autorizar o áudio.'); }
        else fail('Não foi possível iniciar o áudio. Confira o link e tente novamente.', token);
      });
    }).catch(function (error) { fail(error.message || 'O serviço não respondeu.', token); });
    if (!menuOpen) expandHud();
  }
  function previewEngine(hooks) {
    var position = 0, active = false, timer = setInterval(function () {
      if (!active) return;
      position = Math.min(180, position + 0.25); hooks.time(position, 180);
      if (position >= 180) { active = false; hooks.ended(); }
    }, 250);
    return { capabilities: { volume: true, seek: true },
      play: function () { active = true; hooks.time(position, 180); hooks.state('playing'); },
      pause: function () { active = false; hooks.state('paused'); },
      seek: function (value) { position = Math.max(0, Math.min(180, value)); hooks.time(position, 180); },
      volume: function () {}, destroy: function () { active = false; clearInterval(timer); } };
  }
  function previewDemo(provider) {
    if (!preview) return;
    var track = C.parseLink('https://demo.apex.local/midnight-drive.mp3', options);
    track.provider = /^(youtube|spotify)$/.test(provider) ? provider : 'direct';
    track.title = 'Midnight Drive'; track.artist = 'Demonstração visual · sem áudio'; track.manualTitle = true;
    loadTrack(track);
    notice('Demonstração sem áudio. Cole uma URL para testar reprodução real.', 'info');
  }
  function nextTrack() { if (!queue.length) return; var track = queue.shift(); loadTrack(track); }
  function previousTrack() {
    if (!history.length) return;
    var previous = history.pop(); if (current && queue.length < options.maxQueue) queue.unshift(current); loadTrack(previous, false);
  }
  function onEnded() {
    if (status === 'ended') return;
    setState('ended');
    if (repeat && engine && caps.seek) { setState('buffering'); engine.seek(0); Promise.resolve(engine.play()).catch(function () { fail('Não foi possível repetir essa faixa.', generation); }); }
    else if (repeat && current) loadTrack(current, false);
    else if (queue.length) nextTrack();
  }
  function togglePlay() {
    if (starting) { notice('O serviço está carregando. Aguarde ou escolha outra música.', 'info', 3500); return; }
    if (!current) { nextTrack(); return; }
    if (!engine) { loadTrack(current, false); return; }
    if (status === 'ended' && !caps.seek) { loadTrack(current, false); return; }
    if (status === 'playing' || status === 'buffering') engine.pause();
    else { if (status === 'ended' && caps.seek) engine.seek(0); Promise.resolve(engine.play()).catch(function () { notice('Clique no play do serviço para iniciar o áudio.'); setState('paused'); }); }
  }
  function stop() { generation++; starting = false; destroyEngine(); current = null; caps = { volume: true, seek: false }; setService(null); setState('idle'); setTime(0, 0); hideHud(false); notice(''); trackDisplay(); renderLibrary(); }
  function inputTrack() {
    var track = C.parseLink($('url').value, options), title = C.text($('custom-title').value.trim(), 180), cover = $('custom-cover').value.trim();
    if (title) { track.title = title; track.manualTitle = true; }
    if (cover) { var safe = C.safeUrl(cover, options.allowHttp); if (!safe) throw new Error('A capa precisa de uma URL HTTPS válida.'); track.cover = safe.href; track.manualCover = true; }
    return track;
  }
  function submit(enqueue) {
    try {
      var track = inputTrack();
      if (enqueue) {
        if (queue.length >= options.maxQueue) throw new Error('A fila está cheia. Remova uma faixa antes de adicionar outra.');
        queue.push(track); notice('Música adicionada à fila.', 'info', 3500); renderLibrary(); trackDisplay();
      } else loadTrack(track);
      fetchMetadata(track); $('url').value = ''; $('custom-title').value = ''; $('custom-cover').value = '';
    } catch (error) { notice(error.message, 'error', 7000); $('url').focus(); }
  }
  function renderLibrary() {
    $('queue-count').textContent = queue.length; $('clear-queue').hidden = tab !== 'queue' || !queue.length;
    var list = tab === 'queue' ? queue : tab === 'favorites' ? favorites : recent, target = $('library'); target.replaceChildren();
    if (!list.length) {
      var empty = document.createElement('div'); empty.className = 'empty'; empty.appendChild(iconUse(tab === 'favorites' ? 'i-heart' : 'i-disc'));
      var title = document.createElement('strong'); title.textContent = tab === 'favorites' ? 'Suas favoritas, sempre por perto.' : tab === 'recent' ? 'Toda trilha começa com um play.' : 'Um link. Um novo momento.';
      var subtitle = document.createElement('p'); subtitle.textContent = tab === 'favorites' ? 'Toque no coração para guardar uma música.' : tab === 'recent' ? 'As últimas faixas aparecem aqui.' : 'Adicione músicas e monte sua sequência.';
      empty.append(title, subtitle); target.appendChild(empty); return;
    }
    list.forEach(function (track, index) {
      var row = document.createElement('div'); row.className = 'track-row';
      var position = document.createElement('span'); position.className = 'row-position'; position.textContent = String(index + 1).padStart(2, '0'); row.appendChild(position);
      var play = document.createElement('button'); play.className = 'row-cover'; play.setAttribute('aria-label', 'Ouvir ' + track.title);
      var image = document.createElement('img'); image.alt = ''; coverImage(image, track.cover); play.append(image, iconUse('i-play'));
      play.addEventListener('click', function () { if (tab === 'queue') queue.splice(queue.indexOf(track), 1); loadTrack(Object.assign({}, track)); fetchMetadata(current); }); row.appendChild(play);
      var details = document.createElement('div'); details.className = 'row-text'; var title = document.createElement('strong'); title.textContent = track.title; title.title = track.title;
      var artist = document.createElement('span'); artist.textContent = track.artist; details.append(title, artist); row.appendChild(details);
      if (tab !== 'queue') {
        var add = document.createElement('button'); add.className = 'icon-button'; add.setAttribute('aria-label', 'Adicionar à fila'); add.appendChild(iconUse('i-plus'));
        add.addEventListener('click', function () { if (queue.length >= options.maxQueue) { notice('A fila está cheia.', 'error'); return; } queue.push(Object.assign({}, track, { uid: Date.now().toString(36) + Math.random().toString(36).slice(2, 7) })); renderLibrary(); trackDisplay(); notice('Música adicionada à fila.', 'info', 3000); }); row.appendChild(add);
      }
      if (tab !== 'recent') {
        var remove = document.createElement('button'); remove.className = 'icon-button'; remove.setAttribute('aria-label', tab === 'favorites' ? 'Remover favorita' : 'Remover da fila'); remove.appendChild(iconUse('i-close'));
        remove.addEventListener('click', function () { var items = tab === 'queue' ? queue : favorites; items.splice(items.indexOf(track), 1); saveStore(); renderLibrary(); trackDisplay(); }); row.appendChild(remove);
      }
      target.appendChild(row);
    });
    requestAnimationFrame(placeEmbed);
  }
  function selectTab(next) {
    tab = next; document.querySelectorAll('[data-tab]').forEach(function (button) { var selected = button.dataset.tab === tab; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; });
    $('library').setAttribute('aria-labelledby', 'tab-' + tab); renderLibrary();
  }
  $('link-form').addEventListener('submit', function (event) { event.preventDefault(); submit(false); });
  $('enqueue').addEventListener('click', function () { submit(true); }); $('close').addEventListener('click', closeMenu);
  $('clear-url').addEventListener('click', function () { $('url').value = ''; $('url').focus(); });
  $('favorite').addEventListener('click', function () {
    if (!current) return;
    var index = favorites.findIndex(function (track) { return track.url === current.url; });
    if (index >= 0) favorites.splice(index, 1); else { favorites.unshift(Object.assign({}, current)); favorites = favorites.slice(0, 40); }
    saveStore(); trackDisplay(); renderLibrary();
  });
  $('clear-queue').addEventListener('click', function () { queue = []; renderLibrary(); trackDisplay(); });
  document.querySelectorAll('[data-tab]').forEach(function (button) {
    button.addEventListener('click', function () { selectTab(button.dataset.tab); });
    button.addEventListener('keydown', function (event) { if (!/^(ArrowLeft|ArrowRight)$/.test(event.key)) return; event.preventDefault(); var tabs = ['queue', 'favorites', 'recent']; selectTab(tabs[(tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : 2)) % 3]); $('tab-' + tab).focus(); });
  });
  $('toggle-play').addEventListener('click', togglePlay); $('stop').addEventListener('click', stop); $('next').addEventListener('click', nextTrack); $('previous').addEventListener('click', previousTrack);
  $('repeat').addEventListener('click', function () { repeat = !repeat; $('repeat').setAttribute('aria-pressed', String(repeat)); });
  $('volume').addEventListener('input', function () { setVolume(this.value); }); $('mute').addEventListener('click', function () { setVolume(volume === 0 ? previousVolume || 45 : 0); });
  $('cinema-toggle').addEventListener('change', function () { cinemaEngine().configure({ enabled: this.checked }); persistPreferences(); });
  $('cinema-intensity').addEventListener('input', function () { cinemaEngine().configure({ intensity: this.value }); persistPreferences(); });
  window.addEventListener('music:cinema', updateCinema);
  $('seek').addEventListener('input', function () { this.style.setProperty('--range-fill', Number(this.value) / 10 + '%'); $('elapsed').textContent = C.clock(duration * Number(this.value) / 1000); });
  $('seek').addEventListener('change', function () { if (engine && caps.seek && duration) engine.seek(duration * Number(this.value) / 1000); });
  $('hud-toggle').addEventListener('change', function () { hudEnabled = this.checked; persistPreferences(); if (!hudEnabled) hideHud(true); });
  $('custom-details').addEventListener('toggle', placeEmbed);
  document.addEventListener('keydown', function (event) {
    if (!menuOpen) return;
    if (event.key === 'Escape') { event.preventDefault(); closeMenu(); }
    else if (event.code === 'Space' && !/^(INPUT|TEXTAREA|BUTTON|SUMMARY)$/.test(event.target.tagName)) { event.preventDefault(); togglePlay(); }
  });
  window.addEventListener('resize', placeEmbed);
  panel.addEventListener('animationend', placeEmbed);
  if (window.ResizeObserver) new ResizeObserver(placeEmbed).observe($('service-space'));
  window.addEventListener('message', function (event) {
    // FiveM forwards SendNUIMessage from the root window into this resource iframe.
    // Accept that direct parent, while rejecting messages from provider/other frames.
    var gameParent = inGame && event.source === window.parent;
    var previewParent = preview && event.source === window.parent &&
      (event.origin === location.origin || location.protocol === 'file:' && event.origin === 'null');
    if (event.source && event.source !== window && !gameParent && !previewParent) return;
    var data = event.data; if (!data || typeof data !== 'object') return;
    if (data.action === 'open') { configure(data.options); setMenu(true); }
    else if (data.action === 'close') setMenu(false);
    else if (data.action === 'configure') configure(data.options);
    else if (preview && data.action === 'devDemo') previewDemo(data.provider);
    else if (preview && data.action === 'devHud') {
      if (!current) previewDemo(data.provider);
      configure({ hudEnabled: true }); setMenu(false); expandHud();
    }
    else if (data.action === 'hudVisibility') { hudSuppressed = !!data.hidden; hud.classList.toggle('suppressed', hudSuppressed); if (!hudSuppressed && !menuOpen && current && hudEnabled && hud.hidden) expandHud(); window.MusicReactive.wake(); }
    else if (data.action === 'control') { if (data.control === 'stop') stop(); else if (data.control === 'pause') togglePlay(); else if (data.control === 'next') nextTrack(); else if (data.control === 'previous') previousTrack(); }
  });
  window.addEventListener('beforeunload', function () { generation++; destroyEngine(); });
  window.MusicApp = { getState: function () { return { menuOpen: menuOpen, current: current && Object.assign({}, current), status: status, starting: starting, volume: volume, elapsed: elapsed, duration: duration, queue: queue.map(function (t) { return Object.assign({}, t); }), favorites: favorites.length, recent: recent.length, history: history.length, repeat: repeat, hud: { enabled: hudEnabled, phase: hud.dataset.phase, hidden: hud.hidden, suppressed: hudSuppressed }, capabilities: caps, cinema: cinemaEngine().getState() }; } };
  $('hud-toggle').checked = hudEnabled; setVolume(volume, false); trackDisplay(); selectTab('queue');
  nui('ready').then(function (data) { if (data.options) configure(data.options); });
  if (preview) setMenu(true);
})();
