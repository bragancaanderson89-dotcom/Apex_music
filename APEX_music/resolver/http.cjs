// Local UI and original-media resolver. The FiveM resource never spawns executables.
const http=require('http'),fs=require('fs/promises'),path=require('path'),crypto=require('crypto');
const {createService,localConfig}=require('./service.cjs');
const root=path.resolve(__dirname,'..'),mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.ttf':'font/ttf'};
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))}
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>4096)throw Error('Solicitação inválida.')}return JSON.parse(text)}
function start(options={}){
 const service=options.service||createService(),settings=localConfig();
 const server=http.createServer(async(req,res)=>{
  try{
   const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
   if(pathname==='/health'&&req.method==='GET')return json(res,200,{app:'APEX_music',version:'1.2.0',original:true});
   const media=/^\/media\/([a-f0-9]{48})$/.exec(pathname);
   if(media&&['GET','HEAD'].includes(req.method))return service.stream(media[1],req,res);
   if(pathname==='/shutdown'&&req.method==='POST'){
    const key=String(req.headers['x-apex-key']||'');
    if(key.length!==settings.apiKey.length||!crypto.timingSafeEqual(Buffer.from(key),Buffer.from(settings.apiKey)))return json(res,403,{ok:false});
    json(res,200,{ok:true});setImmediate(()=>{service.close();server.close();server.closeAllConnections()});return;
   }
   if(pathname==='/resolve'||pathname==='/_music/resolve'){
    if(req.method!=='POST'||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return json(res,405,{ok:false,error:'Solicitação inválida.'});
    const expected='http://127.0.0.1:'+server.address().port;
    const key=String(req.headers['x-apex-key']||'');
    const authorized=pathname==='/resolve'?key.length===settings.apiKey.length&&crypto.timingSafeEqual(Buffer.from(key),Buffer.from(settings.apiKey)):req.headers.origin===expected&&req.headers['x-apex-preview']==='1';
    if(!authorized)return json(res,403,{ok:false,error:'Acesso recusado.'});
    try{const data=await body(req),result=await service.resolve(data.url);return json(res,200,result)}catch(error){return json(res,400,{ok:false,error:error.message})}
   }
   if(pathname==='/favicon.ico'){res.writeHead(204);return res.end()}
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end()}
   const file=path.resolve(root,'.'+(pathname==='/'?'/DEV.html':pathname)),relative=path.relative(root,file);
   if(relative.startsWith('..')||path.isAbsolute(relative)||(relative!=='DEV.html'&&!relative.startsWith('web'+path.sep))){res.writeHead(403);return res.end()}
   const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:bytes);
  }catch{if(!res.headersSent)res.writeHead(404);res.end()}
 });
 server.on('close',()=>service.close());
 server.listen(options.port||0,'127.0.0.1',()=>{
  const url='http://127.0.0.1:'+server.address().port+'/DEV.html';
  console.log('APEX Music DEV: '+url+'\nÁudio original ativo. Mantenha este terminal aberto. Ctrl+C encerra.');
  if(options.open&&process.platform==='win32'){
   const child=require('child_process').spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,detached:true,stdio:'ignore'});
   child.on('error',()=>console.log('Abra o endereço acima no navegador.'));child.unref();
  }
 });
 server.on('error',error=>{
  service.close();if(error.code==='EADDRINUSE'&&options.port===39876){console.log('O resolvedor já está usando a porta 39876. Abra http://127.0.0.1:39876/DEV.html.')}else console.error('Não foi possível abrir o servidor local:',error.message);
 });
 return server;
}
module.exports={start};
