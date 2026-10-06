const http=require('http'),fs=require('fs'),path=require('path');
let data;try{data=JSON.parse(fs.readFileSync(path.join(__dirname,'local.json'),'utf8'))}catch{console.log('O resolvedor não foi iniciado.');process.exit(0)}
const req=http.request('http://127.0.0.1:39876/shutdown',{method:'POST',headers:{'X-APEX-Key':data.apiKey}},res=>{res.resume();console.log(res.statusCode===200?'Resolvedor encerrado.':'Não foi possível encerrar este serviço.')});
req.setTimeout(3000,()=>req.destroy());req.on('error',()=>console.log('O resolvedor local já está desligado.'));req.end();
