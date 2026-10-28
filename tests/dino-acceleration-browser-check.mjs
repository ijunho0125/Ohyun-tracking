import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({channel: 'chrome', headless: true});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173');
  const html = await page.evaluate(async () => (await import('/src/games/source-games.ts')).sourceDocument('dino'));
  assert(html.includes('frame(0);'));
  const fixture = `window.__accelerationFixture = {
    quiet() { obstacles = []; items = []; nextSpawnDistance = Infinity; },
    addScore(points) { score += points; }
  }; frame(0);`;
  await page.evaluate(source => {
    const frame = document.createElement('iframe');
    frame.id = 'acceleration-check';
    frame.srcdoc = source;
    document.body.append(frame);
  }, html.replace('frame(0);', fixture));
  await page.waitForFunction(() => document.querySelector('#acceleration-check').contentWindow.motionGame);
  await page.evaluate(() => {
    const win = document.querySelector('#acceleration-check').contentWindow;
    const api = win.motionGame, f = win.__accelerationFixture;
    const tick = seconds => { for (let i = 0; i < seconds * 20; i++) api.advance(.05); };
    const close = (value, expected, label) => {
      if (Math.abs(value - expected) > .025) throw Error(`${label}: ${value}, expected ${expected}`);
    };
    for (const motion of [false, true]) {
      api.configure({dinoSpeed: 380, obstacleGap: 1.3, dinoMode: 'body'}, 'day', motion);
      api.practice(true); api.start(); f.quiet();
      const initial = api.snapshot().speed;
      tick(10); close(api.snapshot().speed, initial, 'practice does not accelerate');
      api.practice(false); f.quiet();
      tick(25); close(api.snapshot().speed, initial + 1, 'speed rises with playing time');
      api.pause(); const paused = api.snapshot().speed; tick(30);
      close(api.snapshot().speed, paused, 'pause does not accelerate');
      api.resume(); tick(25);
      close(api.snapshot().speed, initial + 2, 'acceleration resumes after pause');
      f.addScore(100000); tick(.05);
      close(api.snapshot().speed, initial + 2, 'score and coins do not accelerate');
      tick(180);
      close(api.snapshot().speed, motion ? 12 : 14, 'speed respects its mode cap');
      api.reset(); api.start(); f.quiet();
      close(api.snapshot().speed, initial, 'new run resets acceleration');
    }
  });
  assert.deepEqual(errors, []);
  console.log('PASS: both modes accelerate with playing time, ignore practice, pause and score, cap speed, and reset');
} finally { await browser.close(); }
