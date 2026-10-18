// UI checks target the viewport layout and the supplied games.
import './fullscreen-browser-check.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.TEST_URL||'http://127.0.0.1:5173')+'/tests/worker-smoke.html');
  await page.locator('#run').click();await page.waitForFunction(()=>!document.querySelector('#run').disabled,{},{timeout:60000});
  const modelResult=await page.locator('#results li').allTextContents();
  assert(modelResult.length===11&&!modelResult.some(t=>t.startsWith('FAIL')),modelResult.join('\n'));assert.deepEqual(errors,[]);
  const layout=JSON.parse(await readFile(new URL('../docs/fullscreen-check-results.json',import.meta.url),'utf8'));
  await writeFile(new URL('../docs/browser-check-results.json',import.meta.url),JSON.stringify({...layout,modelResult},null,2));
  console.log('PASS: real hand/pose WASM workers, blank-frame inference, retry, Canvas and IndexedDB');
}finally{await browser.close();}
