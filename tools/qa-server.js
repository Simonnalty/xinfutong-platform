'use strict';
// Explicitly disposable QA workspace: never connects to the application's business database.
if(!process.argv.includes('--isolated'))throw new Error('Requires --isolated');
const http=require('node:http'),path=require('node:path');
(async()=>{
 const fixture=await require('../tests/helpers/isolated-db')();
 await require('../db/seed')(fixture.db);
 await require('../db/catalog')(fixture.db);
 const router=require('../src/router').createRouter();
 for(const name of ['auth','workspace','evidence','sync','admin','collaboration','compliance','shares'])require('../src/routes/'+name)(router);
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname.startsWith('/api/')){if(!await router.dispatch(req,res,url))require('../src/http').fail(res,404,'接口不存在');}
  else require('../src/http').serveStatic(path.join(__dirname,'../web/dist'),url.pathname,res);
 }catch(e){console.error(e);if(!res.headersSent)require('../src/http').fail(res,500,'QA server error')}});
 await new Promise(resolve=>server.listen(8791,'127.0.0.1',resolve));
 require('../src/config').publicBaseUrl='http://127.0.0.1:8791';
 console.log('Disposable QA ready: http://127.0.0.1:8791 (seed demo accounts only)');
 async function stop(){await new Promise(resolve=>server.close(resolve));await fixture.close();process.exit(0)}
 process.on('SIGTERM',stop);process.on('SIGINT',stop);
})().catch(e=>{console.error(e);process.exitCode=1});
