import type { Character } from './types';

type CharacterInfo = Omit<Character,'original'|'processed'> & { originalType:string; createdAt:number };
const endpoint = `${import.meta.env.BASE_URL}api/characters`;
const cache=new Map<string,Promise<Character>>();
export function newCharacterId(){return crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');}

async function checked(response:Response) {
  if(!response.ok){
    const data=await response.json().catch(()=>null);
    throw new Error(data?.error || '그림 저장 서버에 연결하지 못했어요. 연결을 확인하고 다시 시도해주세요.');
  }
  return response;
}
async function request(path='', options?:RequestInit) {
  try { return await checked(await fetch(endpoint+path,{cache:'no-store',...options})); }
  catch(error){if(error instanceof TypeError)throw new Error('그림 저장 서버에 연결하지 못했어요. 연결을 확인하고 다시 시도해주세요.');throw error;}
}
function hydrate(info:CharacterInfo):Promise<Character> {
  const existing=cache.get(info.id);if(existing)return existing;
  const pending=Promise.all(['original','processed'].map(async kind=>(await request(`/${encodeURIComponent(info.id)}/${kind}`)).blob()))
    .then(([original,processed])=>({...info,original,processed})).catch(error=>{cache.delete(info.id);throw error;});
  cache.set(info.id,pending);return pending;
}
export async function sharedCharacters() {
  const data=await (await request()).json() as {characters:CharacterInfo[]};
  return Promise.all(data.characters.map(hydrate));
}
export async function saveSharedCharacter(character:Character) {
  const form=new FormData();
  const {original,processed,...info}=character;
  form.append('character',JSON.stringify(info));form.append('original',original,'original');form.append('processed',processed,'character.png');
  await (await request('',{method:'POST',body:form})).json();cache.set(character.id,Promise.resolve(character));
}
export async function selectSharedCharacter(character:Character|null) {
  const response=await fetch(endpoint+'/active',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:character?.id??null})});
  // Import an older browser-only character when it is chosen from the library.
  if(response.status===404 && character){await saveSharedCharacter(character);return;}
  await (await checked(response)).json();
}
export async function deleteSharedCharacter(id:string) {
  await (await request('/'+encodeURIComponent(id),{method:'DELETE'})).json();cache.delete(id);
}
export function watchSelectedCharacter(change:(character:Character|null)=>void) {
  let disposed=false, version=0, selectedId:string|null|undefined, retry:ReturnType<typeof setTimeout>|undefined;
  const events=new EventSource(endpoint+'/events');
  const apply=async(info:CharacterInfo|null)=>{
    if(disposed)return;
    const token=++version;clearTimeout(retry);
    if((info?.id??null)===selectedId)return;
    try {
      const character=info?await hydrate(info):null;
      if(!disposed && version===token){selectedId=character?.id??null;change(character);}
    } catch {if(!disposed && version===token)retry=setTimeout(()=>void apply(info),1500);}
  };
  events.onmessage=event=>{try{void apply(JSON.parse(event.data) as CharacterInfo|null);}catch{/* Reconnect sends the latest selection. */}};
  return ()=>{disposed=true;version++;clearTimeout(retry);events.close();};
}
