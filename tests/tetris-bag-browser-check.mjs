import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173');
  await page.locator('.game-card.tetris').click();
  await page.waitForFunction(() => !!document.querySelector('iframe.source-game')?.contentWindow?.motionGame);
  const result = await page.locator('iframe.source-game').evaluate(frame => frame.contentWindow.eval(`(() => {
    game.pieceBag=[]; game.feverActive=false;
    const first=Array.from({length:7},()=>game.generateRandomPiece().type);
    const second=Array.from({length:7},()=>game.generateRandomPiece().type);
    game.pieceBag=[];
    const before=game.generateRandomPiece().type;
    const remaining=[...game.pieceBag];
    game.feverActive=true;
    const fever=Array.from({length:4},()=>game.generateRandomPiece().type);
    const afterFever=[...game.pieceBag];
    game.feverActive=false;
    const rest=Array.from({length:6},()=>game.generateRandomPiece().type);
    return {first,second,before,remaining,fever,afterFever,rest};
  })()`));
  const types = [1,2,3,4,5,6,7];
  assert.deepEqual([...result.first].sort(), types);
  assert.deepEqual([...result.second].sort(), types);
  assert.deepEqual(result.fever, [1,1,1,1]);
  assert.deepEqual(result.afterFever, result.remaining, 'fever leaves the normal bag intact');
  assert.deepEqual([result.before,...result.rest].sort(), types);
  assert.deepEqual(errors, []);
  console.log('PASS: tetris consecutive 7-bags and fever preserve the normal bag');
} finally { await browser.close(); }
