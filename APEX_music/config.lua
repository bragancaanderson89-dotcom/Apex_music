MusicConfig = {
    command = 'music',
    aliases = { 'Music', 'musica' },
    keybind = '', -- Ex.: 'F7'; vazio deixa somente os comandos.
    defaultVolume = 45,
    cinema = { enabled = true, intensity = 65 },
    hud = { top = 34, left = 32, detailSeconds = 5, opacity = 0.78, size = 72 },
    hideHudDuringPause = true,
    allowYouTube = true,
    allowSpotify = true,
    allowDirectAudio = true,
    maxQueue = 30,
    metadataTimeout = 10000,
    resolver = {
        enabled = true,
        api = 'http://127.0.0.1:39876/resolve',
        streamBase = 'http://127.0.0.1:39876', -- Teste neste PC. Para outros jogadores: origem HTTPS pública.
        timeout = 40000
    }
}
