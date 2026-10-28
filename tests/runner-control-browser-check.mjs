import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));

try {
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173');
  await page.locator('.game-card.balance').click();
  const frame = page.locator('iframe.source-game');
  await page.waitForFunction(() => document.querySelector('iframe.source-game')?.contentWindow?.motionGame);
  const result = await frame.evaluate(element => {
    const api = element.contentWindow.motionGame;
    const steps = count => { for (let i = 0; i < count; i++) api.advance(1 / 60 + 1e-8); };
    const run = (mode, input, frames, motion = true) => {
      api.reset(); api.configure({}, '', motion); api.practice(false); api.start(mode);
      api.command({ type: 'tilt', value: input }); steps(frames);
      return api.snapshot();
    };
    const gentle = run('EASY', .19, 30);
    const full = run('EASY', .38, 30);
    api.command({ type: 'tilt', value: -.38 }); steps(30);
    const recovered = api.snapshot();
    const left = run('EASY', -.38, 30);
    api.command({ type: 'tilt', value: .38 }); steps(30);
    const recoveredLeft = api.snapshot();
    const keyboard = run('EASY', .28, 30, false);
    api.release(); const released = api.snapshot();
    const beforeGentleRecovery = run('EASY', .38, 45);
    api.command({ type: 'tilt', value: -.0684 }); steps(24);
    const gentleRecovery = api.snapshot();
    const beforeGentleRecoveryLeft = run('EASY', -.38, 45);
    api.command({ type: 'tilt', value: .0684 }); steps(24);
    const gentleRecoveryLeft = api.snapshot();
    const hard = run('HARD', .38, 30);
    api.reset(); api.configure({}, '', true); api.practice(true); api.start('EASY');
    api.command({ type: 'tilt', value: .38 }); steps(240);
    const practiceLimit = api.snapshot();
    api.command({ type: 'tilt', value: -.38 }); steps(30);
    const practiceRecovery = api.snapshot();
    const failure = run('EASY', .38, 180);
    return { gentle, full, recovered, left, recoveredLeft, keyboard, released, beforeGentleRecovery, gentleRecovery, beforeGentleRecoveryLeft, gentleRecoveryLeft, hard, practiceLimit, practiceRecovery, failure };
  });
  assert.equal(result.full.state, 'PLAYING');
  assert(result.gentle.angle > 0 && result.gentle.angle < result.full.angle * .75, JSON.stringify(result));
  assert(result.full.angle > .1 && result.full.angle < 1, JSON.stringify(result));
  assert(result.recovered.angle < result.full.angle && result.recovered.state === 'PLAYING', JSON.stringify(result));
  assert(result.left.angle < -.1 && result.left.angle > -1, JSON.stringify(result));
  assert(result.recoveredLeft.angle > result.left.angle && result.recoveredLeft.state === 'PLAYING', JSON.stringify(result));
  assert(Math.abs(result.keyboard.tilt - 1) < 1e-6);
  assert.equal(result.released.tilt, 0);
  assert(result.gentleRecovery.angle < result.beforeGentleRecovery.angle, JSON.stringify(result));
  assert(result.gentleRecoveryLeft.angle > result.beforeGentleRecoveryLeft.angle, JSON.stringify(result));
  assert(result.hard.angle > result.full.angle && result.hard.state === 'PLAYING', JSON.stringify(result));
  assert.equal(result.practiceLimit.state, 'PLAYING');
  assert(Math.abs(result.practiceLimit.angle) <= 1.1, JSON.stringify(result));
  assert(result.practiceRecovery.angle < result.practiceLimit.angle - .2, JSON.stringify(result));
  assert.equal(result.failure.state, 'gameover');
  assert.deepEqual(errors, []);
  console.log('PASS: proportional motion, keyboard strength, bidirectional recovery, release, and difficulty', result);
} finally {
  await browser.close();
}
