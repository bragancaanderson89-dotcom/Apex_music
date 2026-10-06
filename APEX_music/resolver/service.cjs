// Original-media resolver. No title search, replacement recording or browser cookies.
const {spawn}=require('child_process'),crypto=require('crypto'),fs=require('fs'),path=require('path');
const https=require('https'),dns=require('dns').promises,net=require('net');
const ROOT=__dirname;
const PLATFORMS=[['youtube.com','YouTube'],['youtube-nocookie.com','YouTube'],['youtu.be','YouTube'],['soundcloud.com','SoundCloud'],['on.soundcloud.com','SoundCloud'],['vimeo.com','Vimeo'],['dailymotion.com','Dailymotion'],['dai.ly','Dailymotion'],['bandcamp.com','Bandcamp'],['mixcloud.com','Mixcloud'],['tiktok.com','TikTok'],['twitch.tv','Twitch']];
function sourceUrl(raw){
 let url;try{url=new URL(raw)}catch{throw Error('Cole uma URL HTTPS válida.')}
 if(typeof raw!=='string'||raw.length>2048||url.protocol!=='https:'||url.username||url.password||url.port)throw Error('Use uma URL HTTPS pública, sem credenciais ou porta personalizada.');
 const platform=PLATFORMS.find(([host])=>url.hostname===host||url.hostname.endsWith('.'+host));
 if(!platform)throw Error('Este site não oferece uma origem compatível com o resolvedor. Use um link individual do YouTube, SoundCloud, Vimeo, Dailymotion, Bandcamp, Mixcloud, TikTok ou Twitch.');
 return {url:url.href,platform:platform[1]};
}
const block=new net.BlockList();
for(const [ip,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.168.0.0',16],['198.18.0.0',15],['224.0.0.0',4],['240.0.0.0',4]])block.addSubnet(ip,prefix,'ipv4');
for(const [ip,prefix] of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8]])block.addSubnet(ip,prefix,'ipv6');
function publicIP(ip){
 if(ip.toLowerCase().startsWith('::ffff:')){
  const suffix=ip.slice(7);
  if(net.isIP(suffix)===4)ip=suffix;
  else{const parts=suffix.split(':');if(parts.length!==2||parts.some(p=>!/^\w{1,4}$/.test(p)))return false;const high=parseInt(parts[0],16),low=parseInt(parts[1],16);ip=[high>>8,high&255,low>>8,low&255].join('.')}
 }
 const family=net.isIP(ip);return !!family&&!block.check(ip,family===4?'ipv4':'ipv6');
}
async function publicAddress(url){
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')throw Error('Origem de áudio recusada.');
 const entries=await dns.lookup(url.hostname,{all:true});if(!entries.length||entries.some(e=>!publicIP(e.address)))throw Error('Origem de áudio privada recusada.');return entries.find(e=>e.family===4)||entries[0];
}
function clean(value,max){return typeof value==='string'?value.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,max):''}
function localConfig(){
 const file=path.join(ROOT,'local.json');
 if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify({apiKey:crypto.randomBytes(32).toString('hex')},null,2),{flag:'wx',mode:0o600});
 const data=JSON.parse(fs.readFileSync(file,'utf8'));if(!/^[a-f0-9]{64}$/.test(data.apiKey))throw Error('resolver/local.json inválido.');return data;
}
function createService(options={}){
 const binary=options.binary||path.join(ROOT,'bin',process.platform==='win32'?'yt-dlp.exe':'yt-dlp');
 const jobs=new Map(),cache=new Map(),media=new Map(),children=new Set();let active=0,streams=0,lastMediaError='';
 const extract=options.extract||((url)=>new Promise((resolve,reject)=>{
  if(!fs.existsSync(binary))return reject(Error('Resolvedor não instalado. Veja resolver/README.md.'));
  const args=['--ignore-config','--no-plugin-dirs','--no-playlist','--no-warnings','--skip-download','--dump-single-json','--force-ipv4','--socket-timeout','10','--retries','1','--extractor-retries','1','--js-runtimes','node:'+process.execPath,'--format','bestaudio[protocol=https][ext=webm]/bestaudio[protocol=https][ext=m4a]/bestaudio[protocol=https]/best[protocol=https]','--',url];
  const child=spawn(binary,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});children.add(child);let output='',errors='',finished=false;
  function finish(error,data){if(finished)return;finished=true;clearTimeout(timeout);children.delete(child);if(error)reject(error);else resolve(data)}
  const timeout=setTimeout(()=>{child.kill();finish(Error('A origem demorou para responder. Tente novamente.'))},35000);
  child.stdout.on('data',chunk=>{output+=chunk;if(output.length>4*1024*1024){child.kill();finish(Error('A origem retornou dados demais. Escolha uma faixa individual.'))}});
  child.stderr.on('data',chunk=>{errors=(errors+chunk).slice(-3000)});
  child.on('error',()=>finish(Error('Não foi possível iniciar o resolvedor. Veja resolver/README.md.')));
  child.on('close',code=>{
   if(code!==0){const auth=/sign in|login|private|members|premium|protected|DRM|unavailable/i.test(errors);return finish(Error(auth?'O conteúdo original exige acesso ou está indisponível. Outra gravação não será usada.':'Não foi possível obter um áudio original compatível desta URL.'))}
   try{finish(null,JSON.parse(output))}catch{finish(Error('Resposta inválida da origem.'))}
  });
 }));
 function remember(url,info,platform){
  if(!info||info._type==='playlist'||info.entries)throw Error('Cole o link de uma faixa ou vídeo individual.');
  if(info.has_drm)throw Error('O áudio original usa mídia protegida e não está disponível por este resolvedor.');
  const original=new URL(url);const expected=original.hostname==='youtu.be'?original.pathname.slice(1):original.searchParams.get('v')||(/^\/(?:shorts|live|embed)\//.test(original.pathname)?original.pathname.split('/')[2]:'');
  if(platform==='YouTube'&&expected&&info.id!==expected)throw Error('A origem retornou outro conteúdo. Reprodução cancelada.');
  let upstream;try{upstream=new URL(info.url)}catch{throw Error('A origem não disponibilizou o áudio original.')}
  if(upstream.protocol!=='https:'||info.protocol&&info.protocol!=='https'||info.acodec==='none')throw Error('Esta origem não oferece um formato de áudio direto compatível.');
  const token=crypto.randomBytes(24).toString('hex'),headers={};
  for(const [name,value] of Object.entries(info.http_headers||{}))if(/^(user-agent|referer|origin)$/i.test(name)&&typeof value==='string'&&!/[\r\n]/.test(value))headers[name]=value;
  const item={upstream:upstream.href,headers,expires:Date.now()+2*60*60*1000};media.set(token,item);
  for(const [key,item] of media)if(item.expires<Date.now())media.delete(key);
  while(media.size>256)media.delete(media.keys().next().value);
  const result={ok:true,audioPath:'/media/'+token,id:clean(info.id,120),title:clean(info.title,180),artist:clean(info.artist||info.uploader||info.channel,120),cover:typeof info.thumbnail==='string'&&info.thumbnail.startsWith('https://')?info.thumbnail.slice(0,2048):'',duration:Number(info.duration)||0,source:platform,original:true};
  cache.set(url,{result,expires:Date.now()+600000});while(cache.size>128)cache.delete(cache.keys().next().value);return result;
 }
 async function resolve(raw){
  const {url,platform}=sourceUrl(raw);const hit=cache.get(url);if(hit&&hit.expires>Date.now())return hit.result;
  if(jobs.has(url))return jobs.get(url);if(active>=2)throw Error('O resolvedor está ocupado. Tente novamente em alguns segundos.');
  active++;const job=Promise.resolve().then(()=>extract(url)).then(info=>remember(url,info,platform)).finally(()=>{active--;jobs.delete(url)});jobs.set(url,job);return job;
 }
 async function stream(token,req,res){
  const item=media.get(token);if(!item||item.expires<Date.now()){res.writeHead(404);return res.end()}
  if(streams>=12){res.writeHead(429);return res.end()}
  const range=req.headers.range;if(range&&!/^bytes=(?:\d+-\d*|-\d+)$/.test(range)||range&&range.length>70){res.writeHead(416);return res.end()}
  streams++;let upstreamRequest,done=false;
  function finish(){if(done)return;done=true;streams--}
  res.on('close',()=>{if(upstreamRequest)upstreamRequest.destroy();finish()});
  async function fetchMedia(raw,redirects){
   const url=new URL(raw),address=await publicAddress(url);if(done)return;
   const headers={...item.headers,'Accept-Encoding':'identity'};if(range)headers.Range=range;
   upstreamRequest=https.request(url,{method:req.method==='HEAD'?'HEAD':'GET',headers,lookup:(host,opts,cb)=>opts.all?cb(null,[address]):cb(null,address.address,address.family)},upstream=>{
    if([301,302,303,307,308].includes(upstream.statusCode)){
     upstream.resume();if(!upstream.headers.location||redirects>=3){res.writeHead(502);res.end();return}
     fetchMedia(new URL(upstream.headers.location,url).href,redirects+1).catch(fail);return;
    }
    if(![200,206,416].includes(upstream.statusCode)){lastMediaError='upstream_'+upstream.statusCode;upstream.resume();res.writeHead(502);return res.end()}
    const output={'Access-Control-Allow-Origin':'*','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
    for(const name of ['content-type','content-length','content-range','accept-ranges'])if(upstream.headers[name])output[name]=upstream.headers[name];
    res.writeHead(upstream.statusCode,output);upstream.on('error',fail);upstream.pipe(res);
   });
   upstreamRequest.setTimeout(20000,()=>upstreamRequest.destroy(Error('Media timeout')));upstreamRequest.on('error',fail);upstreamRequest.end();
  }
  function fail(error){lastMediaError=error&&(error.code||error.message.replace(/https?:\/\/\S+/g,'[URL]').slice(0,180))||'media_request_failed';if(!res.headersSent)res.writeHead(502);res.end();finish()}
  try{await fetchMedia(item.upstream,0)}catch(error){fail(error)}
 }
 return {resolve,stream,close:()=>{for(const child of children)child.kill();jobs.clear();cache.clear();media.clear()},stats:()=>({active,cache:cache.size,media:media.size,lastMediaError}),sourceUrl};
}
module.exports={createService,localConfig,sourceUrl,publicIP};
