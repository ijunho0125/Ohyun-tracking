import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const button = name => page.getByRole('button', { name, exact: true });
const state = () => page.locator('iframe.source-game').evaluate(frame => frame.contentWindow.motionGame.snapshot());
try {
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173');
  await page.locator('.game-card.cat').click();
  await button('조작 준비하기').waitFor();
  assert.equal(await page.locator('.game-view').getAttribute('data-source'), 'temp_gameFile/ninja_rope.html');
  await page.waitForFunction(() => !!document.querySelector('iframe.source-game')?.contentWindow?.motionGame);
  await button('소리 끄기').click();
  assert.equal((await state()).audio.enabled, false);
  await button('소리 켜기').click();
  assert.equal((await state()).audio.enabled, true);
  await button('조작 준비하기').click();
  await page.waitForFunction(() => document.querySelector('iframe.source-game').contentWindow.motionGame.snapshot().grounded);
  assert.equal((await state()).speed, 4.3, 'the run starts at the reduced speed');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.querySelector('iframe.source-game').contentWindow.motionGame.snapshot().cat.vy < 0);
  assert.equal(await page.locator('iframe.source-game').evaluate(frame => frame.contentWindow.eval('cat.jumpForce')), -13, 'jump strength is reduced');
  await page.keyboard.down('ArrowDown');
  await page.keyboard.up('ArrowDown');
  await button('연습 완료 · 게임 시작').waitFor();
  const generated = await page.locator('iframe.source-game').evaluate(frame => frame.contentWindow.eval(`(() => {
    rooftops=[]; wirePoles=[]; coins=[];
    let edge=0; const gaps=[];
    for (let i=0; i<500; i++) {
      const oldPoleCount=wirePoles.length;
      const nextEdge=generateNextRooftop(edge);
      const roof=rooftops[rooftops.length-1];
      gaps.push({gap:roof.x-edge, poles:wirePoles.length-oldPoleCount});
      edge=nextEdge;
    }
    const poleXs=wirePoles.map(pole=>pole.x);
    generateInitialWorld();
    return {gaps,poleXs};
  })()`));
  const shortGaps = generated.gaps.filter(item => item.gap < 240);
  const wideGaps = generated.gaps.filter(item => item.gap >= 240);
  assert(shortGaps.length && wideGaps.length, 'both jump and wire gaps are generated');
  assert(shortGaps.every(item => item.gap >= 95 && item.gap <= 110 && item.poles === 0), 'jump gaps remain at least 95px and within jumping range');
  assert(wideGaps.every(item => item.gap <= 300 && item.poles === 1), 'each wide gap has exactly one wire pole');
  assert(generated.poleXs.every((x, i, xs) => i === 0 || x - xs[i - 1] >= 840), 'wire poles are separated by at least one screen plus their visible width');
  const wireLimits = await page.locator('iframe.source-game').evaluate(frame => frame.contentWindow.eval(`(() => {
    cameraX=0; cat.reset(); cat.y=200; cat.isGrounded=false;
    const before={x:cat.x,y:cat.y};
    wirePoles=[{x:cat.x+cat.width/2+301,y:cat.y+10}]; cat.tryAttachWire();
    const farAttached=cat.isWireAttached;
    wirePoles=[{x:cat.x+cat.width/2+100,y:cat.y+10}]; cat.tryAttachWire();
    const nearAttached=cat.isWireAttached, length=cat.wireLength;
    cat.update();
    return {farAttached, nearAttached, length, movement:Math.hypot(cat.x-before.x,cat.y-before.y)};
  })()`));
  assert(!wireLimits.farAttached && wireLimits.nearAttached, 'wire only attaches within its reach');
  assert(Math.abs(wireLimits.length - 100) < 1e-9 && wireLimits.movement < 10, 'attaching preserves the cat position without a sudden jump');
  // Fix the world so the mechanics are independent of randomly generated maps.
  const mechanics = await page.locator('iframe.source-game').evaluate(frame => {
    const w = frame.contentWindow, api = w.motionGame;
    const run = code => w.eval(code);
    run('cameraX=0; cat.reset(); cat.x=150; cat.y=180; wirePoles=[{x:300,y:80}]; cat.isGrounded=false');
    api.command({ type: 'jump' });
    const attached = api.snapshot().wire;
    api.command({ type: 'jump' });
    const detached = !api.snapshot().wire && run('cat.vy < 0 && cat.vx > 0');
    run("score=0; combo=0; hostCoins=0; coins=[{x:cat.x+cameraX+cat.width/2,y:cat.y+cat.height/2,type:'gold',value:30,collected:false}]; checkCoinCollisions()");
    const pickup = api.snapshot();
    run('cameraX=0; rooftops=[{x:0,width:500,y:240}]; cat.x=150; cat.y=100; cat.vy=140; cat.vx=0; cat.isWireAttached=false; cat.update()');
    const landing = api.snapshot();
    return { attached, detached, pickup, landing };
  });
  assert(mechanics.attached, 'wire attaches to a forward pole');
  assert(mechanics.detached, 'second jump releases wire and grants forward/upward motion');
  assert.equal(mechanics.pickup.coins, 1);
  assert.equal(mechanics.pickup.score, 32, 'coin plus first combo bonus');
  assert.equal(mechanics.pickup.combo, 1);
  assert(mechanics.landing.grounded, 'high-speed descent crossing a roof lands');
  assert.equal(mechanics.landing.cat.y, 198);
  assert.equal(mechanics.landing.cat.vy, 0);
  const acceleration = await page.locator('iframe.source-game').evaluate(frame => {
    const w = frame.contentWindow, api = w.motionGame;
    w.eval('cameraX=0; rooftops=[{x:0,width:10000,y:300}]; wirePoles=[]; coins=[]; cat.reset(); cat.y=258; cat.isGrounded=true; gameSpeed=4.3; frameCount=238');
    w.eval('updateGame()');
    const before = api.snapshot().speed;
    w.eval('updateGame()');
    const after = api.snapshot().speed;
    w.eval('gameSpeed=6.95; frameCount=239; updateGame()');
    return { before, after, capped: api.snapshot().speed };
  });
  assert.equal(acceleration.before, 4.3, 'speed stays constant before the acceleration interval');
  assert(Math.abs(acceleration.after - 4.4) < 1e-9, 'speed rises by 0.1 at the interval');
  assert.equal(acceleration.capped, 7, 'speed stays at or below the limit');
  const crossings = await page.locator('iframe.source-game').evaluate(frame => frame.contentWindow.eval(`(() => {
    function cross(gap, wire) {
      hostPractice=false; gameState='PLAYING'; gameSpeed=4.3; frameCount=0;
      cameraX=538; cat.reset(); cat.x=150; cat.y=297; cat.isGrounded=true;
      rooftops=[{x:0,width:700,y:339},{x:700+gap,width:500,y:250},{x:2500,width:500,y:250}];
      wirePoles=wire?[{x:700+gap*.45,y:69}]:[]; coins=[];
      window.isRightArmExtended=wire; cat.jump();
      let attached=false, landed=false;
      for(let i=0;i<180 && gameState==='PLAYING';i++) {
        updateGame(); attached ||= cat.isWireAttached;
        if(cat.isGrounded && cameraX+cat.x >= 700+gap-cat.width*.3) { landed=true; break; }
      }
      return {landed, attached, x:cameraX+cat.x, y:cat.y};
    }
    const result = {short:cross(110,false), wide:cross(300,true)};
    hostPractice=true; gameState='PLAYING'; window.isRightArmExtended=false;
    return result;
  })()`));
  assert(crossings.short.landed, `maximum short gap can be jumped onto the higher roof: ${JSON.stringify(crossings.short)}`);
  assert(crossings.wide.attached && crossings.wide.landed, `maximum wide gap can be crossed by wire: ${JSON.stringify(crossings.wide)}`);
  await button('연습 완료 · 게임 시작').click();
  await page.locator('.countdown').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('iframe.source-game').contentWindow.motionGame.snapshot().distance > 0);
  await button('일시정지').click();
  const paused = await state();
  await page.waitForTimeout(300);
  const pausedAfter = await state();
  assert.equal(pausedAfter.distance, paused.distance);
  assert.equal(pausedAfter.speed, paused.speed);
  assert.deepEqual(pausedAfter.cat, paused.cat);
  await button('카운트다운 후 재개').click();
  await page.locator('.countdown').waitFor({ state: 'hidden' });
  await page.waitForFunction(distance => document.querySelector('iframe.source-game').contentWindow.motionGame.snapshot().distance > distance, paused.distance);
  await page.locator('iframe.source-game').evaluate(frame => frame.contentWindow.eval('cat.y=600; cat.isWireAttached=false'));
  await page.getByText('멋진 플레이였어요', { exact: true }).waitFor();
  assert.equal((await state()).state, 'gameover');
  await button('다시 하기').click();
  await page.locator('.countdown').waitFor({ state: 'hidden' });
  assert.equal((await state()).state, 'PLAYING');
  assert.deepEqual(errors, []);
  console.log('PASS: cat speed, gap crossings, audio, controls, pause/resume, game over and restart');
} finally {
  await browser.close();
}
