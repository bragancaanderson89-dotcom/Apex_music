# Áudio original

No computador do servidor, execute **START_MUSIC.cmd** e mantenha o terminal aberto. Node.js 22+ é necessário. **START_DEV.cmd** inicia o mesmo serviço e abre a página de teste. Se ele já estiver ativo na porta 39876, use `http://127.0.0.1:39876/DEV.html`.

**STOP_MUSIC.cmd** encerra o resolvedor local, inclusive quando ele foi iniciado em segundo plano. Reinicie com START_MUSIC.cmd quando necessário.

O resolvedor usa a URL original, sem pesquisar por título ou substituir uma gravação. YouTube é reproduzido como áudio original, mantendo ID, título, autor, thumbnail e símbolo do YouTube. O player oficial pode ser usado novamente com `MusicConfig.resolver.enabled = false`.

Links individuais reconhecidos: YouTube, SoundCloud, Vimeo, Dailymotion, Bandcamp, Mixcloud, TikTok e Twitch. A origem precisa disponibilizar áudio público em formato HTTPS direto compatível. Sites sem esse formato, playlists, conteúdo privado, conteúdo removido, exigência de login e mídia protegida podem falhar. Nenhum navegador, cookie de sessão ou conta é lido.

Spotify permanece no embed oficial. O resolvedor não troca Spotify por uma gravação encontrada em outro site. Reprodução integral e prévias dependem das condições do serviço e do navegador. A proposta não garante reprodução universal de qualquer página da internet.

## Teste local e outros jogadores

A instalação está configurada para FiveM e player neste mesmo computador: API e mídia em `127.0.0.1:39876`. Isso não entrega áudio aos jogadores em outros PCs. Para eles, publique somente `/media/*` por um proxy HTTPS apontando para o serviço local e ajuste `MusicConfig.resolver.streamBase` para essa origem. O proxy precisa preservar os cabeçalhos Range/Content-Range. A API `/resolve` deve permanecer local e autenticada. O endereço da API não é alterado pelo navegador.

`resolver/local.json` contém a chave gerada localmente para a comunicação com o servidor Lua. Não é incluído no manifest NUI, não é servido pelo DEV e não deve ser distribuído publicamente. Uma nova instalação gera sua própria chave.

O áudio passa pelo proxy com suporte a Range e controle de fluxo; não é gravado em disco nem convertido inteiro em MP3. O cache guarda metadados e tokens limitados. O processo de extração é acionado apenas ao carregar a URL, com no máximo duas extrações simultâneas e timeout. A NUI usa um AudioElement e as animações CSS existentes. O executável fica somente no servidor, fora dos arquivos baixados pelos jogadores.

## Dependência

Incluído para Windows x64: **yt-dlp 2026.08.19**, baixado da distribuição oficial e conferido com o SHA256 publicado em `bin/SHA2-256SUMS`. Código-fonte e documentação: https://github.com/yt-dlp/yt-dlp. O binário combinado usa GPLv3+; veja `LICENSE.yt-dlp`, `LICENSE.GPL-3.0` e `THIRD_PARTY_LICENSES.txt`.

Para Linux, instale a distribuição oficial correspondente como `resolver/bin/yt-dlp`, marque como executável e inicie `node DEV_SERVER.cjs --port 39876` com Node 22+. Para atualização, substitua o binário por uma versão oficial adequada e confira seu checksum. Mudanças dos sites podem exigir atualização.

Verificação: `http://127.0.0.1:39876/health`. A integração no CEF/FiveM deve ser confirmada no jogo; os testes automatizados usam Chromium e simulação das callbacks NUI.
