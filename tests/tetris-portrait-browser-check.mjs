import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = process.env.TEST_URL || 'http://127.0.0.1:5173';
const button = (page, name) => page.getByRole('button', { name, exact: true });

try {
  for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 810, height: 1080 }, { width: 1080, height: 1920 }]) {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.locator('.game-card.tetris').click();
    await button(page, '키보드로').click();
    await button(page, '조작 준비하기').click();
    await page.locator('.practice-strip').waitFor();

    const board = await page.locator('iframe.source-game').evaluate(frame => {
      const rect = frame.contentDocument.getElementById('tetrisCanvas').getBoundingClientRect();
      const host = frame.getBoundingClientRect();
      return { left: rect.left + host.left, right: rect.right + host.left, top: rect.top + host.top, bottom: rect.bottom + host.top, width: rect.width, height: rect.height };
    });
    const practice = await page.locator('.practice-strip').boundingBox();
    assert(board.left >= 0 && board.right <= viewport.width && board.top >= 52, 'board fits the screen');
    assert(board.bottom < practice.y - 4, 'practice controls do not cover the board');
    assert(Math.abs(board.height / board.width - 2) < 0.04, 'board keeps its proportions');
    const panels = await page.locator('iframe.source-game').evaluate(frame => {
      const host = frame.getBoundingClientRect();
      return ['festival-next', 'source-info'].map(id => {
        const rect = frame.contentDocument.getElementById(id).getBoundingClientRect();
        return { left: rect.left + host.left, right: rect.right + host.left, top: rect.top + host.top, bottom: rect.bottom + host.top };
      });
    });
    for (const panel of panels) {
      assert(panel.left >= board.right && panel.right <= viewport.width && panel.top >= 52 && panel.bottom < practice.y, 'supporting panel fits beside the board');
    }
    // Expose the folded motion preview to check its placement without requiring a camera.
    await page.locator('.game-view').evaluate(view => { view.dataset.input = 'motion'; });
    const camera = await page.locator('.camera-floating').boundingBox();
    assert(camera && camera.x >= board.right && camera.x + camera.width <= viewport.width, 'camera does not cover the board');
    await page.locator('.game-view').evaluate(view => { view.dataset.input = 'keyboard'; });

    const snapshot = () => page.locator('iframe.source-game').evaluate(frame => frame.contentWindow.motionGame.snapshot());
    const initial = await snapshot();
    await page.keyboard.press('ArrowLeft');
    assert.equal((await snapshot()).figure.x, initial.figure.x - 1, 'keyboard movement works');
    await button(page, '순위판').click();
    await page.getByRole('dialog', { name: '난이도별 순위판' }).waitFor();
    await button(page, '순위판 닫기').click();
    await button(page, '카운트다운 후 재개').click();
    await page.locator('.game-view[data-phase=running]').waitFor();
    await button(page, '일시정지').click();
    await page.getByRole('heading', { name: '잠깐 쉬어가요' }).waitFor();
    assert.deepEqual(errors, []);
    console.log(`PASS: Tetris portrait ${viewport.width}x${viewport.height}`);
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(base);
  await page.locator('.game-card.tetris').click();
  const cameraFold = page.locator('.camera-floating .camera-fold');
  await cameraFold.waitFor();
  assert.equal(await cameraFold.getAttribute('aria-expanded'), 'true');
  await page.setViewportSize({ width: 810, height: 1080 });
  await page.waitForFunction(() => document.querySelector('.camera-floating .camera-fold')?.getAttribute('aria-expanded') === 'false');
  console.log('PASS: camera collapses when rotating from landscape to portrait');
  await page.close();
} finally {
  await browser.close();
}
