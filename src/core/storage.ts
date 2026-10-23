import type { Character, Settings } from './types';
import { defaults } from './types';
import { deleteSharedCharacter, saveSharedCharacter, sharedCharacters } from './shared-characters';
export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem('motion-settings') ?? '{}');
    const result = { ...defaults };
    // Ignore obsolete gesture fields and invalid persisted values when upgrading.
    for (const key of Object.keys(defaults) as (keyof Settings)[]) {
      if (typeof saved[key] === typeof defaults[key] && (typeof saved[key] !== 'number' || Number.isFinite(saved[key]))) Object.assign(result, { [key]: saved[key] });
    }
    result.fistHoldMs = Math.max(100, Math.min(600, result.fistHoldMs));
    result.fistFrames = Math.max(2, Math.min(6, Math.round(result.fistFrames)));
    result.openFrames = Math.max(2, Math.min(6, Math.round(result.openFrames)));
    result.smoothing = Math.max(.1, Math.min(.9, result.smoothing));
    result.frequency = [10, 20, 30].includes(result.frequency) ? result.frequency : defaults.frequency;
    result.hand = result.hand === 'Left' ? 'Left' : 'Right';
    if ((saved.version ?? 0) < 2) {
      if (result.dinoSpeed === 300) result.dinoSpeed = defaults.dinoSpeed;
      if (result.obstacleGap === 1.75) result.obstacleGap = defaults.obstacleGap;
    }
    if ((saved.version ?? 0) < 3 && result.frequency === 20) result.frequency = defaults.frequency;
    result.dinoMode = result.dinoMode === 'seated' ? 'seated' : 'body';
    result.dinoSpeed = Math.max(220, Math.min(380, result.dinoSpeed));
    result.obstacleGap = Math.max(1.3, Math.min(5, result.obstacleGap));
    return result;
  } catch { return { ...defaults }; }
}
export function persistSettings(s: Settings) { try { localStorage.setItem('motion-settings', JSON.stringify({ ...s, version: 3 })); } catch {} }
export function bestScore(id: string) { try { return Number(localStorage.getItem(`motion-best-${id}`)) || 0; } catch { return 0; } }
export function recordScore(id: string, score: number) { try { localStorage.setItem(`motion-best-${id}`, String(Math.max(bestScore(id), score))); } catch {} }
let database: Promise<IDBDatabase> | null = null;
function db() {
  return database ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('motion-arcade', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('characters', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { database = null; reject(req.error); };
  });
}
export async function characters(): Promise<Character[]> {
  const shared=await sharedCharacters();
  const legacy=await db().then(database=>new Promise<Character[]>((resolve,reject)=>{const req=database.transaction('characters').objectStore('characters').getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);})).catch(()=>[]);
  return [...shared,...legacy.filter(c=>!shared.some(s=>s.id===c.id))];
}
export async function saveCharacter(character: Character) {
  await saveSharedCharacter(character);
}
export async function deleteCharacter(id: string) {
  await deleteSharedCharacter(id);
  await db().then(database=>new Promise<void>((resolve,reject)=>{const tx=database.transaction('characters','readwrite');tx.objectStore('characters').delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);})).catch(()=>{});
}
