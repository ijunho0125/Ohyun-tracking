import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.TEST_URL||'http://127.0.0.1:5173')+'/tests/worker-smoke.html');
  await page.locator('#run').click();
  await page.waitForFunction(()=>!document.querySelector('#run').disabled,{},{timeout:60000});
  const checks=await page.locator('#results li').allTextContents();
  assert.equal(checks.length,11);assert(!checks.some(check=>check.startsWith('FAIL')),checks.join('\n'));assert.deepEqual(errors,[]);
  console.log(checks.join('\n'));
} finally {await browser.close();}
