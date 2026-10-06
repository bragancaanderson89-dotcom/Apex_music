(function (root) {
  'use strict';
  function text(value, limit) { return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, limit || 180) : ''; }
  function safeUrl(raw, allowHttp) {
    var url; try { url = new URL(String(raw).trim()); } catch (_) { return null; }
    if (url.username || url.password || url.href.length > 2048) return null;
    if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(url.hostname))) return null;
    return url;
  }
  function parseLink(raw, options) {
    options = options || {};
    raw = typeof raw === 'string' ? raw.trim() : '';
    if (!raw) throw new Error('Cole o link de uma música primeiro.');
    var uri = /^spotify:(track|episode):([a-zA-Z0-9]{22})$/.exec(raw);
    if (uri) raw = 'https://open.spotify.com/' + uri[1] + '/' + uri[2];
    var url = safeUrl(raw, options.allowHttp);
    if (!url) throw new Error('Use um link HTTPS válido, sem usuário ou senha na URL.');
    var host = url.hostname.toLowerCase(), parts = url.pathname.split('/').filter(Boolean);
    var provider = 'direct', id = '', kind = '', canonical = url.href, title, artist, cover = 'assets/default-cover.svg';
    if (/^(www\.|m\.|music\.)?youtube\.com$/.test(host) || /^(www\.)?youtube-nocookie\.com$/.test(host) || host === 'youtu.be') {
      if (options.allowYouTube === false) throw new Error('YouTube está desativado neste servidor.');
      id = host === 'youtu.be' ? parts[0] : url.searchParams.get('v') || (/^(shorts|embed|live)$/.test(parts[0]) ? parts[1] : '');
      if (!/^[a-zA-Z0-9_-]{11}$/.test(id || '')) throw new Error('Cole o link de um vídeo do YouTube, como youtube.com/watch?v=…');
      provider = 'youtube'; canonical = 'https://www.youtube.com/watch?v=' + id;
      title = 'Vídeo do YouTube'; artist = 'YouTube'; cover = 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg';
    } else if (host === 'open.spotify.com') {
      if (options.allowSpotify === false) throw new Error('Spotify está desativado neste servidor.');
      if (/^intl-[a-z-]+$/i.test(parts[0] || '')) parts.shift();
      kind = parts[0]; id = parts[1];
      if (!/^(track|episode)$/.test(kind || '') || !/^[a-zA-Z0-9]{22}$/.test(id || '')) throw new Error('No Spotify, cole o link de uma faixa ou episódio individual.');
      provider = 'spotify'; canonical = 'https://open.spotify.com/' + kind + '/' + id;
      title = kind === 'episode' ? 'Episódio do Spotify' : 'Faixa do Spotify'; artist = 'Spotify';
    } else if (/(^|\.)(soundcloud\.com|vimeo\.com|dailymotion\.com|dai\.ly|bandcamp\.com|mixcloud\.com|tiktok\.com|twitch\.tv)$/.test(host)) {
      if (options.allowResolver === false) throw new Error('O resolvedor de áudio original está desativado neste servidor.');
      provider = 'external';
      var names = { 'soundcloud.com': 'SoundCloud', 'vimeo.com': 'Vimeo', 'dailymotion.com': 'Dailymotion', 'dai.ly': 'Dailymotion', 'bandcamp.com': 'Bandcamp', 'mixcloud.com': 'Mixcloud', 'tiktok.com': 'TikTok', 'twitch.tv': 'Twitch' };
      artist = Object.keys(names).reduce(function (name, domain) { return host === domain || host.endsWith('.' + domain) ? names[domain] : name; }, host);
      title = 'Áudio original · ' + artist;
    } else {
      if (/(^|\.)(spotify\.com|spotify\.link)$/.test(host)) throw new Error('Use o link completo de open.spotify.com, em Compartilhar → Copiar link.');
      if (options.allowDirectAudio === false) throw new Error('Links diretos de áudio estão desativados neste servidor.');
      if (/\.(jpg|jpeg|png|gif|webp|svg|html?|pdf|zip)(?:$)/i.test(url.pathname)) throw new Error('Esse link não é uma música. Use YouTube, Spotify ou um arquivo de áudio.');
      var basename = parts[parts.length - 1] || '';
      try { basename = decodeURIComponent(basename); } catch (_) {}
      title = text(basename.replace(/\.(mp3|wav|ogg|m4a|aac|opus|flac)$/i, '').replace(/[_-]+/g, ' '), 180) || 'Áudio por URL'; artist = host;
    }
    return { uid: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), provider: provider, id: id, kind: kind,
      url: canonical, title: title, artist: artist, cover: cover, source: provider === 'external' ? artist : '' };
  }
  function restoreTracks(value, limit, options) {
    if (!Array.isArray(value)) return [];
    var seen = {};
    return value.slice(0, limit).reduce(function (result, item) {
      try {
        var track = parseLink(item.url, options);
        if (seen[track.url]) return result; seen[track.url] = true;
        track.title = text(item.title, 180) || track.title; track.artist = text(item.artist, 120) || track.artist;
        if (safeUrl(item.cover, options && options.allowHttp)) track.cover = item.cover;
        track.manualTitle = item.manualTitle === true; track.manualCover = item.manualCover === true;
        result.push(track);
      } catch (_) {} return result;
    }, []);
  }
  function clock(seconds) { seconds = Number(seconds); if (!isFinite(seconds) || seconds < 0) return '0:00'; seconds = Math.floor(seconds); return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'); }
  var api = { parseLink: parseLink, safeUrl: safeUrl, text: text, restoreTracks: restoreTracks, clock: clock };
  root.MusicCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
