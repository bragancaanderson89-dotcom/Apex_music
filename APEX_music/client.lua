local C = MusicConfig
local open, ready, suppressed = false, false, false
local requestCounter, pending = 0, {}
local pendingResolve = {}
local playback = { status = 'idle' }
local prefs = { volume = C.defaultVolume, hud = true, cinemaEnabled = C.cinema.enabled, cinemaIntensity = C.cinema.intensity }
local raw = GetResourceKvpString('preferences:v1')
if raw then
    local ok, saved = pcall(json.decode, raw)
    if ok and type(saved) == 'table' then
        prefs.volume = math.max(0, math.min(100, tonumber(saved.volume) or C.defaultVolume))
        prefs.hud = saved.hud ~= false
        if type(saved.cinemaEnabled) == 'boolean' then prefs.cinemaEnabled = saved.cinemaEnabled end
        prefs.cinemaIntensity = math.max(0, math.min(100, tonumber(saved.cinemaIntensity) or C.cinema.intensity))
    end
end
local function options()
    return { volume = prefs.volume, hudEnabled = prefs.hud, hud = C.hud, maxQueue = C.maxQueue,
        cinemaEnabled = prefs.cinemaEnabled, cinemaIntensity = prefs.cinemaIntensity,
        allowYouTube = C.allowYouTube, allowSpotify = C.allowSpotify, allowDirectAudio = C.allowDirectAudio,
        allowResolver = C.resolver and C.resolver.enabled == true, resolverEnabled = C.resolver and C.resolver.enabled == true }
end
local function closeMenu()
    if open then SetNuiFocus(false, false) end
    open = false
    SendNUIMessage({ action = 'close' })
end
local function openMenu()
    if not ready or (IsNuiFocused() and not open) then return false end
    open = true
    SetNuiFocus(true, true)
    SendNUIMessage({ action = 'open', options = options() })
    return true
end
local function command(_, args)
    local control = tostring(args[1] or ''):lower()
    if control == 'pause' or control == 'stop' or control == 'next' or control == 'previous' then
        SendNUIMessage({ action = 'control', control = control })
    elseif open then closeMenu() else openMenu() end
end
RegisterCommand(C.command, command, false)
for _, alias in ipairs(C.aliases or {}) do if alias ~= C.command then RegisterCommand(alias, command, false) end end
if C.keybind and C.keybind ~= '' then RegisterKeyMapping(C.command, 'Abrir player de música', 'keyboard', C.keybind) end

RegisterNUICallback('ready', function(_, cb)
    ready = true; cb({ ok = true, options = options() })
    SendNUIMessage({ action = 'configure', options = options() })
end)
RegisterNUICallback('close', function(_, cb) closeMenu(); cb({ ok = true }) end)
RegisterNUICallback('preferences', function(data, cb)
    if type(data) ~= 'table' then cb({ ok = false }); return end
    local value = tonumber(data.volume)
    if value and value == value then prefs.volume = math.floor(math.max(0, math.min(100, value))) end
    if type(data.hud) == 'boolean' then prefs.hud = data.hud end
    if type(data.cinemaEnabled) == 'boolean' then prefs.cinemaEnabled = data.cinemaEnabled end
    local cinemaIntensity = tonumber(data.cinemaIntensity)
    if cinemaIntensity and cinemaIntensity == cinemaIntensity then prefs.cinemaIntensity = math.floor(math.max(0, math.min(100, cinemaIntensity))) end
    SetResourceKvp('preferences:v1', json.encode(prefs)); cb({ ok = true })
end)
RegisterNUICallback('state', function(data, cb)
    if type(data) == 'table' then
        local valid = { idle = true, loading = true, playing = true, paused = true, buffering = true, error = true, ended = true }
        playback.status = valid[data.status] and data.status or 'idle'
        playback.title = tostring(data.title or ''):sub(1, 240)
        playback.provider = tostring(data.provider or ''):sub(1, 20)
    end
    cb({ ok = true })
end)
RegisterNUICallback('metadata', function(data, cb)
    if not open or type(data) ~= 'table' then cb({ ok = false }); return end
    local provider, id = data.provider, tostring(data.id or '')
    local valid = provider == 'youtube' and C.allowYouTube and #id == 11 and id:match('^[%w_-]+$')
        or provider == 'spotify' and C.allowSpotify and #id == 22 and id:match('^%w+$')
    if not valid then cb({ ok = false }); return end
    requestCounter = requestCounter + 1
    local token = tostring(GetGameTimer()) .. ':' .. tostring(requestCounter)
    pending[token] = cb
    TriggerServerEvent('APEX_music:metadata', token, provider, id, data.kind)
    SetTimeout(C.metadataTimeout + 1000, function()
        local callback = pending[token]; pending[token] = nil
        if callback then callback({ ok = false, error = 'metadata_timeout' }) end
    end)
end)
RegisterNetEvent('APEX_music:metadataResult', function(token, result)
    local callback = pending[token]; pending[token] = nil
    if callback then callback(type(result) == 'table' and result or { ok = false }) end
end)
RegisterNUICallback('resolve', function(data, cb)
    if not ready or not C.resolver or not C.resolver.enabled or type(data) ~= 'table'
        or type(data.url) ~= 'string' or #data.url > 2048 or not data.url:match('^https://') then
        cb({ ok = false, error = 'Resolvedor de áudio original indisponível.' }); return
    end
    requestCounter = requestCounter + 1
    local token = tostring(GetGameTimer()) .. ':r:' .. tostring(requestCounter)
    pendingResolve[token] = cb
    TriggerServerEvent('APEX_music:resolve', token, data.url)
    SetTimeout(C.resolver.timeout + 1000, function()
        local callback = pendingResolve[token]; pendingResolve[token] = nil
        if callback then callback({ ok = false, error = 'O resolvedor demorou para responder. Confira START_MUSIC.cmd.' }) end
    end)
end)
RegisterNetEvent('APEX_music:resolveResult', function(token, result)
    local callback = pendingResolve[token]; pendingResolve[token] = nil
    if callback then callback(type(result) == 'table' and result or { ok = false }) end
end)
exports('Open', openMenu)
exports('Close', closeMenu)
exports('Stop', function() SendNUIMessage({ action = 'control', control = 'stop' }) end)
exports('GetState', function() return { status = playback.status, title = playback.title, provider = playback.provider, menuOpen = open } end)
AddEventHandler('onClientResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    if open then SetNuiFocus(false, false) end
    for token, callback in pairs(pending) do pending[token] = nil; callback({ ok = false }) end
    for token, callback in pairs(pendingResolve) do pendingResolve[token] = nil; callback({ ok = false }) end
end)
CreateThread(function()
    TriggerEvent('chat:addSuggestion', '/' .. C.command, 'Abrir seu player de música', { { name = 'ação', help = 'Opcional: pause, stop, next ou previous' } })
    while true do
        Wait(300)
        local hidden = C.hideHudDuringPause and (IsPauseMenuActive() or IsScreenFadedOut()) or false
        if hidden ~= suppressed then suppressed = hidden; SendNUIMessage({ action = 'hudVisibility', hidden = hidden }) end
    end
end)
