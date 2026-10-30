import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173');
  await page.locator('.game-card.cat').click();
  await page.getByRole('button', { name: '조작 준비하기', exact: true }).click();
  const result = await page.locator('iframe.source-game').evaluate(frame => {
    const w = frame.contentWindow, api = w.motionGame;
    const run = code => w.eval(code);
    const edge = () => {
      run('hostAccumulator=0; hostClearCoyote(); cameraX=0; gameSpeed=4.3; rooftops=[{x:0,width:138,y:300}]; wirePoles=[]; coins=[]; cat.reset(); cat.y=258; cat.isGrounded=true; gameState="PLAYING"');
      // Register ground on one frame, then run off the roof on the next.
      run('rooftops[0].width=500'); api.advance(1/60);
      run('rooftops[0].width=138'); api.advance(1/60);
    };
    edge(); const leftRoof = !api.snapshot().grounded;
    const late = api.motionJump(); const lateState = api.snapshot();
    const repeat = api.motionJump();
    edge(); for (let i=0; i<10; i++) api.advance(1/60);
    const expired = api.motionJump();
    edge(); api.pause(); api.resume(); const paused = api.motionJump();
    edge(); run('wirePoles=[{x:300,y:80}]'); api.command({type:'jump'});
    const keyboardWire = api.snapshot().wire;
    const motionOnWire = api.motionJump(); const wirePreserved = api.snapshot().wire;
    api.command({type:'jump'}); const keyboardRelease = !api.snapshot().wire;
    return { leftRoof, late, lateState, repeat, expired, paused, keyboardWire, motionOnWire, wirePreserved, keyboardRelease };
  });
  assert(result.leftRoof, 'fixture leaves the roof before the input');
  assert(result.late && result.lateState.cat.vy < 0, 'motion jump works just after the roof edge');
  assert.equal(result.repeat, false, 'a coyote jump cannot repeat in the air');
  assert.equal(result.expired, false, 'a stale jump cannot fire after 150 ms');
  assert.equal(result.paused, false, 'pause discards the grace period');
  assert.equal(result.motionOnWire, false, 'motion jump does not detach the wire');
  assert(result.wirePreserved, 'wire stays attached after a motion jump');
  assert(result.keyboardWire && result.keyboardRelease, 'airborne keyboard jump still attaches and releases the wire');
  console.log('PASS: cat motion coyote time, expiry, lifecycle and keyboard wire');
} finally { await browser.close(); }
