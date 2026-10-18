import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const models = {
  'hand_landmarker.task': 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  'pose_landmarker_lite.task': 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
};
await mkdir('public/models', { recursive: true });
let locked = {};
try { locked = JSON.parse(await readFile('public/models/manifest.json', 'utf8')); } catch {}
const manifest = {};
for (const [name, url] of Object.entries(models)) {
  let bytes;
  try { bytes = await readFile(`public/models/${name}`); } catch {
    console.log(`Downloading ${name} (model revision 1)…`);
    const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`${response.status}: ${name}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (locked[name]?.sha256 && locked[name].sha256 !== sha256) throw new Error(`Model integrity mismatch: ${name}`);
  await writeFile(`public/models/${name}`, bytes);
  manifest[name] = { url, revision: 1, sha256, bytes: bytes.length };
  console.log(`${name}: ${bytes.length} bytes; SHA256 ${sha256}`);
}
await writeFile('public/models/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
