import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createCharacterApi } from './character-api';

const root=resolve('dist'), api=createCharacterApi();
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.wasm':'application/wasm','.task':'application/octet-stream','.txt':'text/plain; charset=utf-8'};
const server=createServer(async(request,response)=>{
  if(await api.handle(request,response))return;
  try {
    const path=decodeURIComponent(new URL(request.url || '/','http://localhost').pathname);
    const file=resolve(root,'.'+(path==='/' || path==='/draw' || path==='/draw/'?'/index.html':path));
    if(!file.startsWith(root+sep) || !['GET','HEAD'].includes(request.method || '')){response.writeHead(404);response.end();return;}
    const info=await stat(file);if(!info.isFile())throw new Error('not a file');
    response.writeHead(200,{'Content-Type':mime[extname(file)] || 'application/octet-stream','Content-Length':info.size,'X-Content-Type-Options':'nosniff'});
    response.end(request.method==='HEAD'?undefined:await readFile(file));
  } catch {response.writeHead(404);response.end('Not found');}
});
const port=Number(process.env.PORT || 5173),host=process.env.HOST || '0.0.0.0';
server.listen(port,host,()=>console.log(`Motion Arcade: http://localhost:${port} · Drawing pad: /draw`));
const stop=()=>{api.close();server.close();};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
