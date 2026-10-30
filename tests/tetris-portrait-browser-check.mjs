import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = process.env.TEST_URL || 'http://127.0.0.1:5173';
const button = (page, name) => page.getByRole('button', { name, exact: true });

try {
  for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 768, height: 1024 }]) {
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
} finally {
  await browser.close();
}
