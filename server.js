import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('./',import.meta.url),port=Number(process.env.PORT||4186);
const allowed=new Set(['index.html','styles.css','app.js','core.js','state.js','favicon.svg']);
const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',svg:'image/svg+xml'};
createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(!allowed.has(path)){res.writeHead(404);res.end('Not found');return;}
  try {const bytes=await readFile(fileURLToPath(new URL(path,root)));res.writeHead(200,{'Content-Type':types[path.split('.').pop()],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);}
  catch {res.writeHead(500);res.end('Unable to read app file');}
}).listen(port,'127.0.0.1',()=>console.log(`PortionLab: http://127.0.0.1:${port}`));
