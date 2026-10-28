import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

type CharacterInfo = { id:string; name:string; flip:boolean; size:number; footX:number; footY:number; originalType:string; createdAt:number };
type Catalog = { selectedId:string|null; characters:CharacterInfo[] };
const MAX_IMAGE = 15 * 1024 * 1024, MAX_BODY = 24 * 1024 * 1024;
const idPattern = /^[a-zA-Z0-9_-]{1,80}$/;
class HttpError extends Error { constructor(public status:number, message:string) { super(message); } }
function json(response:ServerResponse, status:number, data:unknown) {
  const payload=JSON.stringify(data);
  response.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Content-Length':Buffer.byteLength(payload), 'Cache-Control':'no-store' });
  response.end(payload);
}
async function body(request:IncomingMessage) {
  if (Number(request.headers['content-length']) > MAX_BODY) throw new HttpError(413, '그림 파일이 너무 커요.');
  const chunks:Buffer[] = []; let length = 0;
  for await (const chunk of request) {
    const value = Buffer.from(chunk); length += value.length;
    if (length > MAX_BODY) throw new HttpError(413, '그림 파일이 너무 커요.');
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
async function imageBytes(file:FormDataEntryValue|null, processed=false) {
  if (!(file instanceof File) || !file.size || file.size > (processed ? 8*1024*1024 : MAX_IMAGE)) throw new HttpError(400, '올바른 그림 파일을 선택해주세요.');
  const bytes = Buffer.from(await file.arrayBuffer());
  const png = bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
  const webp = bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP';
  const type = png ? 'image/png' : jpeg ? 'image/jpeg' : webp ? 'image/webp' : '';
  if (!type || (processed && !png)) throw new HttpError(400, 'PNG, JPG, WebP 그림만 저장할 수 있어요.');
  return { bytes, type };
}

// One shared catalog for the tablet and game computers, persisted before notifying clients.
export function createCharacterApi(directory=resolve(process.env.CHARACTER_DATA_DIR || '.character-data')) {
  const clients = new Set<ServerResponse>();
  let catalog:Promise<Catalog>|null = null, queue:Promise<unknown> = Promise.resolve();
  const load = () => catalog ??= (async () => {
    await mkdir(directory,{recursive:true});
    try { return JSON.parse(await readFile(resolve(directory,'catalog.json'),'utf8')) as Catalog; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; return {selectedId:null,characters:[]}; }
  })().catch(error=>{catalog=null;throw error;});
  const selected = (data:Catalog) => data.characters.find(c=>c.id===data.selectedId) ?? null;
  const notify = (data:Catalog) => {
    const message = `data: ${JSON.stringify(selected(data))}\n\n`;
    for (const client of clients) client.write(message);
  };
  const commit = async (data:Catalog) => {
    const temporary = resolve(directory,`catalog-${randomUUID()}.tmp`);
    await writeFile(temporary,JSON.stringify(data));
    await rename(temporary,resolve(directory,'catalog.json'));
    catalog=Promise.resolve(data); notify(data);
  };
  const mutate = (work:()=>Promise<void>) => { const result=queue.then(work);queue=result.catch(()=>{});return result; };
  const keepalive = setInterval(()=>{for(const client of clients)client.write(': keepalive\n\n');},20000);
  keepalive.unref();

  const handle = async (request:IncomingMessage,response:ServerResponse):Promise<boolean> => {
    try {
      const path = new URL(request.url || '/', 'http://localhost').pathname;
      if (!path.startsWith('/api/characters')) return false;
      if (!['GET','HEAD'].includes(request.method || '')) {
        const origin=request.headers.origin;
        if (origin && new URL(origin).host !== request.headers.host) throw new HttpError(403,'같은 사이트에서 저장해주세요.');
      }
      if (request.method==='GET' && path==='/api/characters/events') {
        // Register and read without yielding between the snapshot and subscription.
        const snapshot = await load();
        response.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
        clients.add(response);
        response.write(`retry: 1000\ndata: ${JSON.stringify(selected(snapshot))}\n\n`);
        response.on('close',()=>clients.delete(response));
        return true;
      }
      if (request.method==='GET' && path==='/api/characters') {
        json(response,200,await load()); return true;
      }
      if (request.method==='POST' && path==='/api/characters') {
        const bytes = await body(request);
        let form:FormData, input:Record<string,unknown>;
        try {
          form=await new Request('http://localhost',{method:'POST',headers:{'Content-Type':request.headers['content-type'] || ''},body:new Uint8Array(bytes)}).formData();
          input=JSON.parse(String(form.get('character')));
        } catch { throw new HttpError(400,'저장할 그림 정보를 읽지 못했어요.'); }
        if (!input || typeof input!=='object' || typeof input.id!=='string' || !idPattern.test(input.id) || typeof input.name!=='string' || !input.name.trim() || input.name.length>40 || typeof input.flip!=='boolean') throw new HttpError(400,'캐릭터 정보가 올바르지 않아요.');
        for (const [key,min,max] of [['size',.5,1.5],['footX',0,1],['footY',.3,1]] as const) {
          if (typeof input[key]!=='number' || !Number.isFinite(input[key]) || input[key]<min || input[key]>max) throw new HttpError(400,'캐릭터 크기나 발 위치를 확인해주세요.');
        }
        const original=await imageBytes(form.get('original')), processed=await imageBytes(form.get('processed'),true);
        const info:CharacterInfo={id:input.id,name:input.name.trim(),flip:input.flip,size:input.size as number,footX:input.footX as number,footY:input.footY as number,originalType:original.type,createdAt:Date.now()};
        await mutate(async()=>{
          const data=await load();
          if (data.characters.some(c=>c.id===info.id)) throw new HttpError(409,'이미 저장한 그림이에요. 다시 저장해주세요.');
          const folder=resolve(directory,info.id);await mkdir(folder,{recursive:true});
          await Promise.all([writeFile(resolve(folder,'original'),original.bytes),writeFile(resolve(folder,'processed.png'),processed.bytes)]);
          await commit({selectedId:info.id,characters:[info,...data.characters]});
        });
        json(response,201,info);return true;
      }
      if (request.method==='POST' && path==='/api/characters/active') {
        let input:{id:unknown};
        try { input=JSON.parse((await body(request)).toString('utf8')); }
        catch(error) { if(error instanceof HttpError)throw error;throw new HttpError(400,'캐릭터 선택 정보가 올바르지 않아요.'); }
        if (!input || (input.id!==null && typeof input.id!=='string')) throw new HttpError(400,'캐릭터 선택 정보가 올바르지 않아요.');
        await mutate(async()=>{
          const data=await load();
          if (input.id!==null && !data.characters.some(c=>c.id===input.id)) throw new HttpError(404,'저장된 캐릭터를 찾지 못했어요.');
          await commit({...data,selectedId:input.id as string|null});
        });
        json(response,200,{ok:true});return true;
      }
      const match=path.match(/^\/api\/characters\/([a-zA-Z0-9_-]{1,80})(?:\/(original|processed))?$/);
      if (match) {
        const [,id,kind]=match;
        if (request.method==='GET' && kind) {
          const info=(await load()).characters.find(c=>c.id===id);
          if (!info) throw new HttpError(404,'그림을 찾지 못했어요.');
          const bytes=await readFile(resolve(directory,id,kind==='original'?'original':'processed.png'));
          response.writeHead(200,{'Content-Type':kind==='original'?info.originalType:'image/png','Content-Length':bytes.length,'Cache-Control':'private, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});response.end(bytes);return true;
        }
        if (request.method==='DELETE' && !kind) {
          await mutate(async()=>{
            const data=await load();
            await commit({selectedId:data.selectedId===id?null:data.selectedId,characters:data.characters.filter(c=>c.id!==id)});
            // The validated ID is a single directory name inside the configured data directory.
            await rm(resolve(directory,id),{recursive:true,force:true});
          });
          json(response,200,{ok:true});return true;
        }
      }
      throw new HttpError(404,'요청한 기능을 찾지 못했어요.');
    } catch(error) {
      if (!response.headersSent) json(response,error instanceof HttpError?error.status:500,{error:error instanceof HttpError?error.message:'그림 저장 서버에 문제가 생겼어요. 잠시 후 다시 시도해주세요.'});
      else response.end();
      return true;
    }
  };
  return { handle, close:()=>{clearInterval(keepalive);for(const client of clients)client.end();clients.clear();} };
}
