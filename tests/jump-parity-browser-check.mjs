import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const game of ['dino', 'cat']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => {
      window.__pose = []; window.__frames = 0;
      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
        const ctx = canvas.getContext('2d');
        const timer = setInterval(() => { ctx.fillStyle = '#49413c'; ctx.fillRect(0, 0, 640, 480); }, 33);
        const stream = canvas.captureStream(30); window.__stream = stream; window.__cameraTimer = timer;
        stream.getTracks()[0].addEventListener('ended', () => clearInterval(timer));
        return stream;
      };
      window.Worker = class {
        onmessage = null; dead = false; mode = 'hand';
        postMessage(data) {
          if (data.type === 'init') { this.mode = data.mode; setTimeout(() => { if (!this.dead) this.onmessage?.({ data: { type: 'ready' } }); }, 0); }
          if (data.type === 'frame') {
            window.__frames++;
            const width = data.bitmap.width, height = data.bitmap.height; data.bitmap.close();
            setTimeout(() => { if (!this.dead) this.onmessage?.({ data: { type: 'result', time: data.time, width, height, inferenceMs: 1, hands: [], pose: this.mode === 'hand' ? [] : structuredClone(window.__pose) } }); }, 0);
          }
        }
        terminate() { this.dead = true; }
      };
    });
    const page = await context.newPage();
    const body = shift => {
      const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 1, presence: 1 }));
      for (const [i, x, y] of [[11, .4, .4], [12, .6, .4], [23, .42, .7], [24, .58, .7]]) points[i] = { x, y: y + shift, visibility: 1, presence: 1 };
      points[15].y = .8; points[16].y = .8;
      return points;
    };
    const pose = async (shift, delay = 300) => {
      const before = await page.evaluate(points => { window.__pose = points; return window.__frames; }, body(shift));
      await page.waitForFunction(n => window.__frames >= n + 4, before);
      await page.waitForTimeout(delay);
    };
    const button = name => page.getByRole('button', { name, exact: true });
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173');
    await page.locator(`.game-card.${game}`).click();
    await page.locator('.camera-tools').getByRole('button', { name: '연결', exact: true }).click();
    await button('카메라 허용하고 시작').click();
    await button('확대').waitFor();
    await pose(0); await button('조작 준비하기').click();
    await page.locator('.game-view[data-phase="practice"]').waitFor();
    if (game === 'cat') {
      // Keep the cat grounded throughout the pose sequence, independent of the
      // randomly generated gaps and the time spent on camera calibration.
      await page.locator('iframe.source-game').evaluate(frame => frame.contentWindow.eval('cameraX=0; rooftops=[{x:0,width:100000,y:300}]; wirePoles=[]; coins=[]; cat.reset(); cat.y=258; cat.isGrounded=true'));
    }
    await pose(0);
    await page.locator('iframe.source-game').evaluate((frame, game) => {
      const api = frame.contentWindow.motionGame, original = api.command;
      window.__jumps = 0;
      if (game === 'cat') {
        const motionJump = api.motionJump;
        window.__jumpAttempts = 0;
        api.motionJump = () => { window.__jumpAttempts++; const jumped = motionJump.call(api); if (jumped) window.__jumps++; return jumped; };
      } else {
        api.command = c => { if (c.type === 'jump') window.__jumps++; original.call(api, c); };
      }
    }, game);
    // This movement meets the old cat-only high sensitivity threshold, but not
    // the common body-jump threshold. Both games must reject it.
    await pose(-.0144, 200);
    assert.equal(await page.evaluate(() => window.__jumps), 0, `${game}: small motion must not trigger a jump`);
    await pose(0);
    await pose(-.021, 200);
    assert.equal(await page.evaluate(() => window.__jumps), 1, `${game}: normal jump must trigger`);
    if (game === 'cat') {
      // Hold the simulated cat in the air while the player lands and starts
      // another jump, then land it immediately after the new gesture.
      await page.locator('iframe.source-game').evaluate(frame => {
        const w = frame.contentWindow;
        w.motionGame.advance = () => {};
        w.eval('cat.isGrounded=false');
      });
      await pose(0, 0);
      const before = await page.evaluate(points => { window.__pose = points; return window.__frames; }, body(-.021));
      await page.waitForFunction(n => window.__frames >= n + 3, before);
      assert.equal(await page.evaluate(() => window.__jumps), 1, 'no second jump while the cat is airborne');
      await page.locator('iframe.source-game').evaluate(frame => frame.contentWindow.eval('cat.isGrounded=true'));
      await page.waitForFunction(() => window.__jumps === 2, null, { timeout: 1500 });
      assert.equal(await page.locator('iframe.source-game').evaluate(frame => frame.contentWindow.motionGame.snapshot().grounded), false, 'buffered jump actually takes off after landing');
      await pose(-.021, 200);
      assert.equal(await page.evaluate(() => window.__jumps), 2, 'one gesture produces only one jump');

      const queueAirborneJump = async () => {
        await page.locator('iframe.source-game').evaluate(frame => frame.contentWindow.eval('cat.isGrounded=false; hostClearCoyote()'));
        await pose(0, 0);
        const attempts = await page.evaluate(points => { window.__pose = points; return window.__jumpAttempts; }, body(-.021));
        await page.waitForFunction(n => window.__jumpAttempts > n, attempts);
        assert.equal(await page.evaluate(() => window.__jumps), 2, 'airborne gesture must not jump immediately');
      };
      const land = () => page.locator('iframe.source-game').evaluate(frame => frame.contentWindow.eval('cat.isGrounded=true'));

      await queueAirborneJump();
      await page.waitForTimeout(350);
      await land(); await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => window.__jumps), 2, 'expired jump must not fire on a later landing');

      await queueAirborneJump();
      const beforeLoss = await page.evaluate(() => { window.__pose = []; return window.__frames; });
      await page.waitForFunction(n => window.__frames >= n + 3, beforeLoss);
      await land(); await page.waitForTimeout(200);
      await pose(-.021, 0);
      assert.equal(await page.evaluate(() => window.__jumps), 2, 'tracking loss cancels a buffered jump');

      await queueAirborneJump();
      await button('일시정지').click();
      await page.locator('.game-view[data-phase="paused"]').waitFor();
      await land();
      await page.evaluate(points => { window.__pose = points; }, body(0));
      await button('카운트다운 후 재개').click();
      await page.locator('.game-view[data-phase="running"]').waitFor({ timeout: 15000 });
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => window.__jumps), 2, 'pausing cancels a buffered jump');
      console.log('PASS: cat buffered jumps expire and cancel on tracking loss or pause');
    }
    console.log(`PASS: ${game} uses the common body jump threshold`);
    await page.evaluate(() => { clearInterval(window.__cameraTimer); window.__stream?.getTracks().forEach(track => track.stop()); });
    await context.close();
  }
} finally { await browser.close(); }
