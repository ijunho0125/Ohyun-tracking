import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce'}),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
  window.__audioContexts=[];window.__audioAnalysers=[];
  const NativeAudioContext=window.AudioContext;
  window.AudioContext=class extends NativeAudioContext {
    constructor(...args){super(...args);window.__audioContexts.push(this);}
    createAnalyser(){const node=super.createAnalyser();window.__audioAnalysers.push(node);return node;}
  };
});
const pass=name=>{checks.push(name);console.log('PASS: '+name);};
const button=name=>page.getByRole('button',{name,exact:true});
const state=()=>page.locator('iframe.source-game').evaluate(frame=>frame.contentWindow.motionGame.snapshot());
async function audible(){await page.waitForFunction(()=>window.__audioAnalysers.some(analyser=>{if(analyser.context.state!=='running')return false;const data=new Uint8Array(analyser.fftSize);analyser.getByteTimeDomainData(data);return data.some(value=>Math.abs(value-128)>1);}),{},{timeout:8000});}
async function leave(){await page.evaluate(()=>window.__previousAudio=window.__audioContexts.at(-1));await button('로비').click();await page.waitForFunction(()=>!document.fullscreenElement&&window.__previousAudio?.state==='closed');}
try{
 await page.goto(process.env.TEST_URL||'http://127.0.0.1:5173');await page.locator('.game-card').first().waitFor();
 const typography=await page.evaluate(()=>{
  const size=selector=>parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
  const rgb=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
  const luminance=color=>{const c=rgb(color);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
  const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  const hero=getComputedStyle(document.querySelector('.site-header')),copy=getComputedStyle(document.querySelector('.game-card-body>p')),card=getComputedStyle(document.querySelector('.game-card'));
  return {cardTitle:size('.game-title h3'),cardCopy:size('.game-card-body>p'),nav:size('.site-header nav button'),mainButton:size('.camera-connect-action'),copyContrast:contrast(copy.color,card.backgroundColor),heroContrast:contrast(hero.color,hero.backgroundColor)};
 });
 assert(typography.cardTitle>=30&&typography.cardCopy>=20&&typography.nav>=20&&typography.mainButton>=20);assert(typography.copyContrast>=4.5&&typography.heroContrast>=4.5);
 await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'본문으로 이동');await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'main-content');
 pass('large event typography, readable text contrast, keyboard focus and working skip link');
 await page.locator('.game-card.tetris').click();await button('조작 준비하기').waitFor();await audible();
 assert.deepEqual((await state()).audio,{enabled:true,context:'running',music:true});
 await page.evaluate(()=>window.__activeAudio=window.__audioContexts.at(-1));
 pass('tetris music is already enabled and produces audio before practice or play');
 const stage=await page.locator('.game-stage').evaluate(element=>{const r=element.getBoundingClientRect(),camera=element.querySelector('.camera-floating'),c=camera.getBoundingClientRect(),top=document.elementFromPoint(c.left+c.width/2,c.top+80);return{stage:[r.x,r.y,r.width,r.height],camera:[c.x,c.y,c.width,c.height],viewport:[innerWidth,innerHeight],onTop:!!top.closest('.camera-floating')};});
 assert.equal(stage.stage[0],0);assert.equal(stage.stage[1],0);assert.equal(stage.stage[2],stage.viewport[0]);assert.equal(stage.stage[3],stage.viewport[1]);assert(stage.onTop);assert(stage.camera[0]+stage.camera[2]<=stage.stage[2]);
 await button('카메라 위치 바꾸기').click();assert((await page.locator('.camera-floating').boundingBox()).x<50);
 await button('카메라 접기').click();assert.equal(await page.locator('.camera-floating .camera-screen').isVisible(),false);assert.equal(await button('카메라 펼치기').getAttribute('aria-expanded'),'false');await button('카메라 펼치기').click();await button('카메라 위치 바꾸기').click();
 pass('stage fills the viewport; camera floats above it with position, collapse and keyboard-operable controls');
 await button('소리 끄기').click();assert.equal((await state()).audio.enabled,false);assert.equal(await button('소리 켜기').getAttribute('aria-pressed'),'false');await button('소리 켜기').click();await audible();assert((await state()).audio.music);
 await button('조작 준비하기').click();await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowDown');await button('연습 완료 · 게임 시작').waitFor();
 const board=await page.locator('iframe').evaluate(frame=>{const rect=frame.contentDocument.getElementById('tetrisCanvas').getBoundingClientRect();return {bottom:rect.bottom+frame.getBoundingClientRect().top};});assert(board.bottom<(await page.locator('.practice-strip').boundingBox()).y-6,'practice controls must not cover the last board row');
 await page.screenshot({path:fileURLToPath(new URL('../docs/screenshots/festival-tetris.png',import.meta.url))});
 await button('일시정지').click();await page.waitForFunction(()=>window.__activeAudio.state==='suspended');await button('카운트다운 후 재개').click();await audible();await leave();
 pass('sound toggle, tetris practice checklist, pause/resume audio and context cleanup on exit');
 await page.locator('.game-card.dino').click();await button('조작 준비하기').waitFor();await audible();assert.deepEqual((await state()).audio,{enabled:true,context:'running',music:true});await button('조작 준비하기').click();await page.screenshot({path:fileURLToPath(new URL('../docs/screenshots/festival-dino.png',import.meta.url))});await leave();
 pass('dino original music plays on entry through the same audio bus and closes on exit');
 await page.locator('.game-card.balance').click();await button('조작 준비하기').waitFor();await audible();await leave();
 pass('balance has entry sound and gentle background music');
 assert.deepEqual(errors,[]);
 await writeFile(new URL('../docs/festival-check-results.json',import.meta.url),JSON.stringify({checks,typography,stage,errors,note:'Audio tested through real Web Audio analyser output in Chrome, not speakers or a human webcam.'},null,2));
}catch(error){await page.screenshot({path:fileURLToPath(new URL('../docs/screenshots/festival-audio-failure.png',import.meta.url))});throw error;}finally{await browser.close();}
