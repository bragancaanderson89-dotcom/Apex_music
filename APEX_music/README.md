# APEX Music · 1.4.1

Player pessoal por URL para FiveM, independente de framework. Menu preto, branco e cinza com a fonte local `zsxMonTserrat` da base. Não reproduz áudio para outros jogadores e não cria entidades no mapa.

## Uso

1. Instale `APEX_music` em `resources/[addons]/[Scripts]`.
2. Adicione `ensure APEX_music` ao `server.cfg`.
3. No console do servidor: `refresh` e `ensure APEX_music`.
4. No computador do servidor, inicie `START_MUSIC.cmd` para ativar o resolvedor original.
5. No jogo: `/music` ou `/Music`. Cole um link e clique em **Ouvir agora**.
6. **Som Cinema** ativa a ambiência e o reforço de graves; **Intensidade** ajusta o efeito. Desative para comparar com o som original.

**Adicionar à fila** mantém a faixa atual. **Favoritas** guarda músicas no navegador NUI; **Recentes** lista as últimas URLs usadas. O coração salva/remove a faixa atual. O menu oferece pausa, anterior/próxima, repetição, posição e volume quando o serviço permite. Nome e capa podem ser personalizados na seção expansível abaixo do link.

ESC fecha o menu e libera o mouse sem parar o áudio. O disco entra pela esquerda no canto superior esquerdo, a metade esquerda fica parada e a direita desliza, puxando um retângulo preto translúcido com nome e capa entre as duas metades. Os detalhes permanecem por cinco segundos após a abertura completa; depois se recolhem e só o disco cinza translúcido continua girando. O centro mostra o símbolo de YouTube, Spotify ou áudio direto; a capa gira em um anel externo. Ao recolher, a metade direita retorna e forma novamente um disco inteiro. Pausar suspende a rotação. A opção **Disco na tela** desativa o HUD.

Comandos adicionais: `/music pause` alterna pausa/reprodução, `/music stop` para, `/music next` avança e `/music previous` retorna. As aliases `/Music` e `/musica` são configuráveis. Nenhuma tecla extra é ocupada por padrão; `keybind` permite definir uma.

O disco do HUD e o do menu pulsam conforme o áudio real: graves têm mais peso, trechos fortes aumentam bastante o tamanho e silêncio/pausa devolvem o tamanho original suavemente. A rotação e a abertura entre as metades continuam independentes. O crescimento é limitado a 65% no HUD e 35% no menu; o volume do player também afeta a resposta. A versão 1.3.1 aumenta a sensibilidade aos graves, usa compressão suave para preservar diferenças entre batidas fortes e responde mais rápido, com ataque de 45 ms e retorno de 190 ms. A análise usa um único AudioContext, buffers reutilizados e atualizações de aproximadamente 30 Hz apenas enquanto o disco está visível. Pausa, fim, HUD oculto e preferência por movimento reduzido suspendem a animação.

A pulsação funciona com o áudio original do resolvedor e links diretos que permitem análise pelo navegador (mesma origem ou CORS). Links sem CORS continuam tocando pelo caminho normal, sem pulsação. Os embeds oficiais de Spotify/YouTube não expõem o sinal de áudio; nesses players a rotação continua, sem simular batidas. A faixa demo é visual e não emite áudio, portanto não pulsa.

## Som Cinema

Ativado por padrão com intensidade de 65%. O processamento mantém a gravação original e aplica graves mais encorpados, redução suave de médios baixos, presença e brilho discretos, ambiência estéreo com pequenas reflexões e reverberação curta de sala. Compressão e limitação suave de picos controlam os aumentos de nível. A troca Cinema/Original e as alterações de intensidade usam transições de ganho para evitar estalos. Intensidade zero usa o mesmo caminho do som original.

O efeito é uma simulação de sala em estéreo, não uma conversão da música em Dolby Atmos ou 5.1. Funciona no áudio original do resolvedor e em links diretos com CORS/mesma origem; embeds oficiais e áudio sem CORS preservam o player original e ocultam os controles Cinema durante a faixa. A demo silenciosa não permite ouvir o efeito. Para comparar, teste uma música real no DEV servido por `START_DEV.cmd`.

Preferências ficam em KVP no FiveM e armazenamento local no DEV. `config.lua` define o padrão em `cinema = { enabled = true, intensity = 65 }`. O efeito compartilha o AudioContext do disco, cria a cadeia de processamento ao primeiro uso e reutiliza uma pequena resposta de sala gerada localmente. Não há downloads de efeitos, bibliotecas extras ou loops Lua por frame. Ao desativar, o caminho de efeitos é desconectado após a transição. Pausa e mute fecham a saída para impedir a cauda da reverberação continuar audível. A preferência de movimento reduzido desativa a animação do disco, mantendo o processamento de áudio.

## Links e players

| Origem | Links aceitos | Reprodução |
| --- | --- | --- |
| YouTube | `youtube.com/watch?v=…`, `youtu.be/…`, Music, Shorts, Live e embed | Resolvedor do áudio original por padrão; título, autor, thumbnail e ID preservados. IFrame API oficial disponível ao desativar o resolvedor. Conteúdo privado, removido, protegido ou sem áudio compatível mostra um aviso. |
| Spotify | `open.spotify.com/track/…`, `/episode/…`, prefixos `intl-…` e URIs de faixa/episódio | Embed oficial. A reprodução completa depende do serviço, sessão e suporte a mídia protegida do CEF; uma prévia de aproximadamente 30 segundos pode ser oferecida. |
| Outros sites | Links individuais de SoundCloud, Vimeo, Dailymotion, Bandcamp, Mixcloud, TikTok e Twitch | Resolvedor original quando a origem oferece áudio público HTTPS direto compatível. Sem troca por outra gravação. |
| Áudio direto | URL HTTPS de MP3, WAV, OGG, M4A, AAC, OPUS, FLAC ou stream compatível | HTMLAudioElement, limitado aos codecs e acesso disponíveis no navegador. Páginas de outros sites não são convertidas em áudio. Avançar depende do suporte a busca/trechos do servidor de áudio. |

Os players oficiais aparecem no menu, permitindo iniciar o áudio manualmente se houver bloqueio de autoplay. Spotify não expõe controle externo de volume; o slider do menu fica desabilitado para essa origem. A busca externa por posição é habilitada para episódios Spotify; faixas usam os controles do embed. O resolvedor de YouTube usa o áudio do mesmo vídeo. Spotify continua no player oficial, sem conversão para outra gravação, conta Premium embutida ou contorno de DRM. Os avisos identificam a disponibilidade real do serviço.

Os metadados de embed usam endpoints oficiais de oEmbed, com cache limitado, controle de solicitações e timeout. O áudio original usa o resolvedor local, com origens conhecidas, tokens de mídia e limites de concorrência. URLs arbitrárias de áudio não são acessadas pelo servidor. Nenhuma chave de API é necessária. Links encurtados `spotify.link` devem ser substituídos pelo link completo da faixa.

O navegador e o servidor precisam alcançar os serviços externos. Falhas de internet, restrições regionais, incorporação, codecs, autoplay ou mudanças dos serviços podem impedir um link específico. O player do YouTube recebe a origem real da NUI e política de referrer; o erro 153 é identificado no menu.

No player oficial, YouTube **101/150** significa bloqueio de incorporação. O resolvedor original evita depender desse embed quando o mesmo vídeo disponibiliza mídia pública compatível; não busca outra versão. O aviso mostra o código e oferece **Trocar link**, que seleciona a URL para substituição, e **Próxima da fila**, quando houver músicas aguardando. Erro **153** indica identificação do player recusada. No DEV aberto como arquivo, o YouTube é interrompido antes de carregar e orienta a abrir `START_DEV.cmd`, garantindo uma origem HTTP local real.

## Configuração e integração

### Prévia no navegador

Abra `DEV.html` na raiz do recurso para testar a interface sem FiveM. Selecione **Áudio direto**, **YouTube** ou **Spotify** ao lado de **Faixa demo** para testar os símbolos sem internet. **Faixa demo** simula uma música sem emitir áudio; **Testar disco** fecha o menu e demonstra a entrada, abertura e recolhimento do HUD. **Abrir menu**, **Play / pausa** e **Parar** controlam a mesma interface usada no jogo.

Para testar URLs reais de YouTube/Spotify, execute `START_DEV.cmd` (Node.js necessário, sem instalar pacotes). Ele serve somente os arquivos públicos da interface em `127.0.0.1`, escolhe uma porta livre e abre o navegador. Mantenha o terminal aberto; Ctrl+C encerra. Áudio direto e demonstração podem ser testados ao abrir o HTML diretamente, conforme as permissões do navegador. A demo existe apenas no modo de prévia e não é ativada pela NUI do FiveM. Os arquivos DEV não são incluídos no manifest do jogo.

Veja [resolver/README.md](resolver/README.md) para iniciar o áudio original, entender os limites e configurar outros jogadores. A configuração local atual usa `127.0.0.1:39876`, adequada ao servidor e player no mesmo PC.

`config.lua` define comando, aliases, tecla opcional, volume inicial, máximo da fila, serviços permitidos e posição/tamanho/transparência do HUD. `detailSeconds = 5` controla a duração dos detalhes; a entrada leva aproximadamente 0,7 segundo. Volume e preferência do disco são guardados em KVP local; favoritos e recentes ficam no armazenamento da NUI. Nenhuma música inicia automaticamente ao conectar/reiniciar.

Exports de cliente:

```lua
exports.APEX_music:Open()
exports.APEX_music:Close()
exports.APEX_music:Stop()
local state = exports.APEX_music:GetState()
```

O menu não toma foco de outra NUI. A parada do recurso libera o foco que ele detém; players e carregamentos antigos são descartados ao trocar/parar uma faixa. O HUD some durante pausa do jogo/tela apagada. Não há loop Lua por frame; a verificação de pausa ocorre a cada 300 ms. O movimento do disco usa CSS. As SDKs dos embeds carregam somente ao selecionar um serviço que as usa. O resolvedor roda fora do FXServer, evitando permissões para execução de processos dentro do recurso.

## Validação

Testes locais em Chromium: áudio WAV real com resposta HTTP por trechos, continuação com menu fechado, fila, anterior/próxima, fim automático, repetição, favoritos, volume/mute, busca, persistência, HUD dividido com recolhimento, transparência de pixels fora do HUD e layouts 900p/720p/estreito. As APIs simuladas verificaram troca/limpeza de providers, carregamento tardio, metadados/callbacks NUI, tamanho mínimo do player e erros explícitos. Lua 5.4 verificou sintaxe, foco, preferências, cache, limites, endpoints fixos e callbacks com timeout.

O YouTube real foi reproduzido no navegador local e continuou após fechar o menu. O embed real do Spotify ofereceu uma prévia de aproximadamente 30 segundos sem sessão autenticada. Esses testes não substituem a confirmação no CEF/FiveM da sua máquina e conexão.

Referências: [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference), [Spotify iFrame API](https://developer.spotify.com/documentation/embeds/references/iframe-api), [limitações do embed Spotify](https://developer.spotify.com/documentation/embeds/tutorials/troubleshooting), [callbacks NUI](https://docs.fivem.net/docs/scripting-manual/nui-development/nui-callbacks/).

Validação 1.2: o link enviado `F0fWWtkEJGE`, que retornava erro 150 no embed, reproduziu o áudio original com duração de 189,461 segundos, busca além do primeiro minuto, pausa e continuação com menu fechado. O proxy respondeu a Range com HTTP 206; origem HTTPS simulada da NUI e cancelamento de resposta tardia passaram. Spotify permanece dependente do player oficial.

Validação 1.3: WAV real com silêncio, graves e agudos confirmou resposta por intensidade e volume, peso maior dos graves, retorno suave, limites de escala, rotação e geometria das metades preservadas. Pausa, parada, movimento reduzido e HUD oculto interromperam o loop; áudio remoto sem CORS continuou reproduzindo sem analisador. O mesmo YouTube original apresentou 29 escalas diferentes em três segundos, entre 1,0006× e 1,0415× com volume de 45%, sem erros JavaScript.

Validação 1.3.1: no mesmo trecho da música original, com volume de 45%, o HUD variou entre 1,0023× e 1,4018×, com 30 escalas diferentes em três segundos. O WAV de graves atingiu 1,5365×, contra 1,3023× nos agudos; silêncio e pausa retornaram a 1×. A abertura das metades e a rotação passaram, sem erros JavaScript.

Correção 1.3.2: o FiveM envia mensagens da janela raiz `nui://game` para o iframe do recurso. O filtro agora aceita essa janela pai em modo de jogo, corrigindo `/music` liberar o mouse sem mostrar o menu. Mensagens de frames dos players continuam rejeitadas; o DEV mantém a validação de origem e modo de prévia.

Validação 1.4: renderização de áudio confirmou reforço de graves, variação por intensidade, ambiência estéreo real e bypass transparente ao desativar/zerar. Um sinal de graves forte atingiu pico de 0,8812, abaixo da saturação; o motor real do FiveM CEF também renderizou a reverberação estéreo. Controles, persistência, pausa, mute, cancelamento, movimento reduzido e layouts 720p/estreito foram verificados. O YouTube original de 189,461 segundos tocou com o efeito e manteve busca e continuação com o menu fechado. Testes de callbacks Lua e de abertura por mensagem da janela pai passaram.

Correção 1.4.1: o Cinema agora está incorporado ao arquivo NUI existente `web/reactive.js`, evitando depender de `cinema.js` em um pacote de recurso cuja lista de arquivos ainda esteja desatualizada. A página não solicita mais o arquivo separado. A inicialização do menu também tolera a ausência de efeitos: continua o handshake ready e permite abrir/fechar, ocultando controles indisponíveis. Testes reproduziram o 404 e a ausência completa do módulo sem interromper a interface. `web/cinema.js` permanece como referência do código original; a execução no jogo usa a versão incorporada em `reactive.js`.
