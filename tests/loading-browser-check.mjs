import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const base = process.env.TEST_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const moduleMatches = (url, name) => new RegExp(`/(?:src/components/${name}\\.tsx|assets/${name}-[^/]+\\.js)(?:\\?|$)`).test(String(url));

try {
  const context = await browser.newContext();
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.goto(base);
  await page.locator('.game-card').first().waitFor();
  for (const name of ['CharacterEditor', 'GameView', 'Experiences']) {
    assert(!requests.some(url => moduleMatches(url, name)), `${name} must load on demand`);
  }
  await page.locator('nav button').nth(1).click();
  await page.locator('.editor-grid').waitFor();
  await page.route(url => moduleMatches(url, 'Experiences'), async route => {
    await new Promise(resolve => setTimeout(resolve, 500));
    await route.continue();
  });
  await page.locator('nav button').nth(3).click();
  await page.locator('.lab-grid').waitFor();
  await page.locator('nav button').nth(1).click();
  await page.locator('.editor-grid').waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: secondary screens load on demand; delayed navigation preserves the canvas preview');
  await context.close();

  const audioContext = await browser.newContext();
  await audioContext.addInitScript(() => {
    window.__audioContexts = [];
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      constructor(...args) { super(...args); window.__audioContexts.push(this); }
    };
  });
  const audioPage = await audioContext.newPage(), audioErrors = [];
  audioPage.on('pageerror', error => audioErrors.push(error.message));
  let releaseImport;
  const importGate = new Promise(resolve => { releaseImport = resolve; });
  await audioPage.route(url => moduleMatches(url, 'CharacterEditor'), async route => {
    await importGate;
    await route.continue();
  });
  try {
    await audioPage.goto(base);
    await audioPage.locator('.game-card.dino').click();
    await audioPage.getByRole('button', { name: /현재 캐릭터:/ }).waitFor();
    await audioPage.waitForFunction(() => window.__audioContexts.at(-1)?.state === 'running');
    await audioPage.getByRole('button', { name: /현재 캐릭터:/ }).click();
    await audioPage.getByRole('status').filter({ hasText: '화면을 불러오는 중' }).waitFor();
    await audioPage.waitForFunction(() => window.__audioContexts.every(context => context.state === 'closed'), {}, { timeout: 2000 });
    releaseImport();
    await audioPage.locator('.editor-grid').waitFor();
    assert.deepEqual(audioErrors, []);
    console.log('PASS: leaving a game closes audio before the next screen finishes loading');
  } finally {
    releaseImport();
    await audioContext.close();
  }
} finally {
  await browser.close();
}
