import type { Character, Settings } from './types';
import { defaults } from './types';
export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem('motion-settings') ?? '{}');
    const result = { ...defaults };
    // Ignore obsolete gesture fields and invalid persisted values when upgrading.
    for (const key of Object.keys(defaults) as (keyof Settings)[]) {
      if (typeof saved[key] === typeof defaults[key]) Object.assign(result, { [key]: saved[key] });
    }
    result.fistHoldMs = Math.max(100, Math.min(600, result.fistHoldMs));
    result.fistFrames = Math.max(2, Math.min(6, Math.round(result.fistFrames)));
    result.openFrames = Math.max(2, Math.min(6, Math.round(result.openFrames)));
    result.smoothing = Math.max(.1, Math.min(.9, result.smoothing));
    result.frequency = [10, 20, 30].includes(result.frequency) ? result.frequency : defaults.frequency;
    result.hand = result.hand === 'Left' ? 'Left' : 'Right';
    return result;
  } catch { return { ...defaults }; }
}
export function persistSettings(s: Settings) { try { localStorage.setItem('motion-settings', JSON.stringify(s)); } catch {} }
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
  const database = await db(); return new Promise((resolve, reject) => { const req = database.transaction('characters').objectStore('characters').getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}
export async function saveCharacter(character: Character) {
  const database = await db(); return new Promise<void>((resolve, reject) => { const tx = database.transaction('characters','readwrite'); tx.objectStore('characters').put(character); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
}
export async function deleteCharacter(id: string) {
  const database = await db(); return new Promise<void>((resolve, reject) => { const tx = database.transaction('characters','readwrite'); tx.objectStore('characters').delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
}
