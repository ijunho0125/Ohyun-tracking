import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createCharacterApi } from '../server/character-api';

describe('shared character server',()=>{
  let directory:string,base:string,server:Server,api:ReturnType<typeof createCharacterApi>;
  const png=readFile(new URL('./fixtures/character.png',import.meta.url));
  const metadata=(id:string)=>({id,name:'서버 저장 '+id,flip:false,size:1,footX:.5,footY:1});
  async function save(id:string,overrides={}){
    const image=new Blob([new Uint8Array(await png)],{type:'image/png'}),form=new FormData();
    form.append('character',JSON.stringify({...metadata(id),...overrides}));form.append('original',image,'original.png');form.append('processed',image,'processed.png');
    return fetch(base+'/api/characters',{method:'POST',body:form});
  }
  async function start(){
    api=createCharacterApi(directory);server=createServer((req,res)=>{void api.handle(req,res).then(handled=>{if(!handled){res.writeHead(404);res.end();}});});
    await new Promise<void>(ready=>server.listen(0,'127.0.0.1',ready));
    const address=server.address();if(!address||typeof address==='string')throw new Error('server address');base=`http://127.0.0.1:${address.port}`;
  }
  async function stop(){api.close();server.closeAllConnections();await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()));}
  beforeAll(async()=>{directory=await mkdtemp(join(tmpdir(),'motion-character-test-'));await start();});
  afterAll(async()=>{await stop();
    const target=resolve(directory),parent=resolve(tmpdir());
    if(dirname(target)!==parent || !basename(target).startsWith('motion-character-test-'))throw new Error('unexpected test directory');
    await rm(target,{recursive:true,force:true});
  });
  it('rejects invalid metadata and unrelated origins without changing the selection',async()=>{
    expect((await save('invalid',{footY:0})).status).toBe(400);
    const response=await fetch(base+'/api/characters/active',{method:'POST',headers:{Origin:'https://unrelated.example','Content-Type':'application/json'},body:JSON.stringify({id:null})});
    expect(response.status).toBe(403);expect(await(await fetch(base+'/api/characters')).json()).toEqual({selectedId:null,characters:[]});
  });
  it('stores both images, selects on save, and keeps concurrent saves',async()=>{
    const responses=await Promise.all([save('first'),save('second')]);expect(responses.map(response=>response.status)).toEqual([201,201]);
    const catalog=await(await fetch(base+'/api/characters')).json();expect(catalog.characters).toHaveLength(2);expect(['first','second']).toContain(catalog.selectedId);
    for(const kind of ['original','processed']){const response=await fetch(base+`/api/characters/first/${kind}`);expect(response.headers.get('content-type')).toBe('image/png');expect(Buffer.from(await response.arrayBuffer())).toEqual(await png);}
    expect((await save('first')).status).toBe(409);
  });
  it('notifies other devices after committing and restores selection after a restart',async()=>{
    const controller=new AbortController(),stream=await fetch(base+'/api/characters/events',{signal:controller.signal}),reader=stream.body!.getReader();
    const first=await reader.read();expect(new TextDecoder().decode(first.value)).toContain('data:');
    const response=await fetch(base+'/api/characters/active',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'first'})});expect(response.status).toBe(200);
    const next=await reader.read();expect(new TextDecoder().decode(next.value)).toContain('"id":"first"');controller.abort();
    await stop();await start();
    expect((await(await fetch(base+'/api/characters')).json()).selectedId).toBe('first');
    expect((await fetch(base+'/api/characters/first/processed')).status).toBe(200);
  });
  it('deleting the active character restores the default and does not delete other drawings',async()=>{
    expect((await fetch(base+'/api/characters/first',{method:'DELETE'})).status).toBe(200);
    const catalog=await(await fetch(base+'/api/characters')).json();expect(catalog.selectedId).toBeNull();expect(catalog.characters.map((c:{id:string})=>c.id)).toEqual(['second']);
    expect((await fetch(base+'/api/characters/first/processed')).status).toBe(404);
  });
});
