local cache, order, limits = {}, {}, {}
local function clean(value, length)
    if type(value) ~= 'string' then return '' end
    return value:gsub('[%z\1-\31\127]', ' '):sub(1, length)
end
local function encode(value)
    return value:gsub('[^%w%-_%.~]', function(char) return string.format('%%%02X', string.byte(char)) end)
end
local function validThumb(value)
    if type(value) ~= 'string' or #value > 2048 then return nil end
    local host = value:match('^https://([^/]+)')
    if host == 'i.ytimg.com' or host == 'img.youtube.com' or host == 'i.scdn.co'
        or host == 'image-cdn-ak.spotifycdn.com' or host == 'mosaic.scdn.co' then return value end
end
RegisterNetEvent('APEX_music:metadata', function(token, provider, id, kind)
    local player = source
    if type(token) ~= 'string' or #token > 64 or type(id) ~= 'string' then return end
    local function reply(result) TriggerClientEvent('APEX_music:metadataResult', player, token, result) end
    local valid = provider == 'youtube' and MusicConfig.allowYouTube and #id == 11 and id:match('^[%w_-]+$')
        or provider == 'spotify' and MusicConfig.allowSpotify and #id == 22 and id:match('^%w+$') and (kind == 'track' or kind == 'episode')
    if not valid then reply({ ok = false }); return end
    local now, key = os.time(), provider .. ':' .. tostring(kind or '') .. ':' .. id
    local limit = limits[player] or { since = now, count = 0, active = 0 }; limits[player] = limit
    if now - limit.since >= 10 then limit.since = now; limit.count = 0 end
    if limit.count >= 12 or limit.active >= 2 then reply({ ok = false, error = 'rate_limit' }); return end
    limit.count = limit.count + 1
    if cache[key] and cache[key].expires > now then reply(cache[key].result); return end
    local canonical = provider == 'youtube' and ('https://www.youtube.com/watch?v=' .. id)
        or ('https://open.spotify.com/' .. kind .. '/' .. id)
    local endpoint = provider == 'youtube' and 'https://www.youtube.com/oembed?format=json&url='
        or 'https://open.spotify.com/oembed?url='
    local finished = false
    limit.active = limit.active + 1
    local function finish(result)
        if finished then return end
        finished = true; limit.active = math.max(0, limit.active - 1)
        reply(result)
    end
    SetTimeout(MusicConfig.metadataTimeout, function() finish({ ok = false, error = 'metadata_timeout' }) end)
    -- Only fixed official oEmbed endpoints are fetched, never an arbitrary submitted URL.
    PerformHttpRequest(endpoint .. encode(canonical), function(status, body)
        if finished then return end
        if status ~= 200 or type(body) ~= 'string' or #body > 65536 then finish({ ok = false }); return end
        local ok, data = pcall(json.decode, body)
        if not ok or type(data) ~= 'table' then finish({ ok = false }); return end
        local result = { ok = true, title = clean(data.title, 180), artist = clean(data.author_name, 120), cover = validThumb(data.thumbnail_url) }
        if not cache[key] then order[#order + 1] = key end
        cache[key] = { expires = now + 21600, result = result }
        while #order > 256 do cache[table.remove(order, 1)] = nil end
        finish(result)
    end, 'GET', '', { ['Accept'] = 'application/json' }, { followLocation = false })
end)
AddEventHandler('playerDropped', function() limits[source] = nil end)
local resolveLimits = {}
local resolverHosts = { 'youtube.com', 'youtube-nocookie.com', 'youtu.be', 'soundcloud.com', 'vimeo.com',
    'dailymotion.com', 'dai.ly', 'bandcamp.com', 'mixcloud.com', 'tiktok.com', 'twitch.tv' }
local function allowedSource(url)
    if type(url) ~= 'string' or #url > 2048 then return false end
    local host = url:match('^https://([^/%?#]+)')
    if not host or host:find('[:@%s]') then return false end
    host = host:lower()
    for _, domain in ipairs(resolverHosts) do
        if host == domain or host:sub(-#domain - 1) == '.' .. domain then
            if (domain == 'youtube.com' or domain == 'youtu.be' or domain == 'youtube-nocookie.com') and not MusicConfig.allowYouTube then return false end
            return true
        end
    end
    return false
end
RegisterNetEvent('APEX_music:resolve', function(token, url)
    local player, config = source, MusicConfig.resolver
    if type(token) ~= 'string' or #token > 64 then return end
    local function reply(result) TriggerClientEvent('APEX_music:resolveResult', player, token, result) end
    if not config or not config.enabled or not allowedSource(url) then reply({ ok = false, error = 'Origem de áudio original não suportada.' }); return end
    local now = os.time()
    local limit = resolveLimits[player] or { since = now, count = 0, active = 0 }; resolveLimits[player] = limit
    if now - limit.since >= 20 then limit.since = now; limit.count = 0 end
    if limit.count >= 6 or limit.active >= 1 then reply({ ok = false, error = 'Aguarde alguns segundos antes de carregar outra música.' }); return end
    limit.count = limit.count + 1
    local raw = LoadResourceFile(GetCurrentResourceName(), 'resolver/local.json')
    local ok, settings = pcall(json.decode, raw or '')
    if not ok or type(settings) ~= 'table' or type(settings.apiKey) ~= 'string' or #settings.apiKey ~= 64 then
        reply({ ok = false, error = 'Inicie START_MUSIC.cmd no computador do servidor e tente novamente.' }); return
    end
    limit.active = limit.active + 1
    local finished = false
    local function finish(result)
        if finished then return end
        finished = true; limit.active = math.max(0, limit.active - 1); reply(result)
    end
    SetTimeout(config.timeout, function() finish({ ok = false, error = 'O resolvedor de áudio original demorou para responder.' }) end)
    PerformHttpRequest(config.api, function(status, body)
        if finished then return end
        if status == 0 or type(body) ~= 'string' or #body > 65536 then finish({ ok = false, error = 'Inicie START_MUSIC.cmd no computador do servidor.' }); return end
        local decoded, data = pcall(json.decode, body)
        if not decoded or type(data) ~= 'table' then finish({ ok = false, error = 'O resolvedor de áudio original não respondeu.' }); return end
        if status ~= 200 or not data.ok then finish({ ok = false, error = clean(data.error, 240) }); return end
        local mediaToken = type(data.audioPath) == 'string' and data.audioPath:match('^/media/(%x+)$')
        if not mediaToken or #mediaToken ~= 48 or data.original ~= true then finish({ ok = false, error = 'Resposta inválida da origem original.' }); return end
        local cover = type(data.cover) == 'string' and #data.cover <= 2048 and data.cover:match('^https://[^/@%s]+/') and data.cover or nil
        finish({ ok = true, original = true, id = clean(data.id, 120), audioUrl = config.streamBase:gsub('/+$', '') .. '/media/' .. mediaToken,
            title = clean(data.title, 180), artist = clean(data.artist, 120), cover = cover, source = clean(data.source, 80), duration = tonumber(data.duration) or 0 })
    end, 'POST', json.encode({ url = url }), { ['Content-Type'] = 'application/json', ['X-APEX-Key'] = settings.apiKey }, { followLocation = false })
end)
AddEventHandler('playerDropped', function() resolveLimits[source] = nil end)
