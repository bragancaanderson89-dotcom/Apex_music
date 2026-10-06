const {start}=require('./resolver/http.cjs');
const i=process.argv.indexOf('--port');
start({port:i>=0?Number(process.argv[i+1]):0,open:process.argv.includes('--open')});
