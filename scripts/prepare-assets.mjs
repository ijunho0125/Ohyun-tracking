import { mkdir, cp, copyFile } from 'node:fs/promises';
import { build } from 'esbuild';
await mkdir('public/vision', { recursive: true });
await cp('node_modules/@mediapipe/tasks-vision/wasm', 'public/vision', { recursive: true });
await copyFile('node_modules/@mediapipe/tasks-vision/README.md', 'public/vision/README.md');
await mkdir('public/notices', { recursive: true });
await copyFile('THIRD_PARTY_NOTICES.md', 'public/notices/THIRD_PARTY_NOTICES.md');
for (const [source, name] of [['react/LICENSE','React-LICENSE.txt'],['react-dom/LICENSE','React-DOM-LICENSE.txt'],['lucide-react/LICENSE','Lucide-LICENSE.txt'],['typescript/LICENSE.txt','APACHE-2.0.txt']]) await copyFile(`node_modules/${source}`,`public/notices/${name}`);
// A classic Worker permits MediaPipe's WASM loader to use importScripts.
await build({ entryPoints: ['src/motion/vision.worker.ts'], bundle: true, minify: true, format: 'iife', platform: 'browser', target: 'es2022', outfile: 'public/vision.worker.js', logLevel: 'warning' });
