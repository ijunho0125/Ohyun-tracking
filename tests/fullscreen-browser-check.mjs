import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const base=process.env.TEST_URL||'http://127.0.0.1:5173';
const output=new URL('../docs/screenshots/',import.meta.url);await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1280,height:720},reducedMotion:'reduce'});
const page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
const pass=name=>{checks.push(name);console.log('PASS: '+name);};
const shot=name=>page.screenshot({path:fileURLToPath(new URL(name+'.png',output))});
const button=name=>page.getByRole('button',{name,exact:true});
async function fits(label){
  const metrics=await page.evaluate(()=>{
    const visible=e=>e.checkVisibility()&&e.getBoundingClientRect().width>0;
    const root=document.documentElement;
    const clipped=[...document.querySelectorAll('button,input:not([hidden]),select,summary')].filter(visible).filter(e=>!e.closest('dialog:not([open])')).flatMap(e=>{
      const r=e.getBoundingClientRect();
      if(r.left<-.5||r.top<-.5||r.right>innerWidth+.5||r.bottom>innerHeight+.5)return [e.textContent?.trim().slice(0,50)||e.getAttribute('aria-label')];
      for(let p=e.parentElement;p;p=p.parentElement){const cs=getComputedStyle(p),b=p.getBoundingClientRect();if(['hidden','clip','auto','scroll'].includes(cs.overflowY)&&r.bottom>b.bottom+1)return [e.textContent?.trim().slice(0,50)];}
      return [];
    });
    const clippedCards=[...document.querySelectorAll('.game-card')].filter(visible).filter(card=>card.querySelector('.game-card-body').getBoundingClientRect().bottom>card.getBoundingClientRect().bottom+1).map(card=>card.getAttribute('aria-label'));
    return {width:innerWidth,height:innerHeight,scrollWidth:root.scrollWidth,scrollHeight:root.scrollHeight,clipped,clippedCards,mainOverflow:document.querySelector('main.page-content').scrollHeight-document.querySelector('main.page-content').clientHeight};
  });
  assert.equal(metrics.scrollWidth,metrics.width,label+': horizontal scroll');assert.equal(metrics.scrollHeight,metrics.height,label+': vertical scroll');
  assert.deepEqual(metrics.clipped,[],label+': clipped controls '+JSON.stringify(metrics));
  assert.deepEqual(metrics.clippedCards,[],label+': clipped game descriptions');
  assert(metrics.mainOverflow<=2,label+': content clipping '+JSON.stringify(metrics));
}
const nav=name=>page.getByRole('navigation',{name:'주요 메뉴'}).getByRole('button',{name,exact:true}).click();
async function leave(){await button('로비').click();await page.waitForFunction(()=>!document.fullscreenElement);}
const snapshot=()=>page.locator('iframe.source-game').evaluate(f=>f.contentWindow.motionGame.snapshot());
try{
 await page.goto(base);await page.locator('.game-card').first().waitFor();assert.equal(await page.locator('.brand-hero').count(),0);
 for(const [width,height] of [[1280,640],[1280,720],[1366,768],[1920,1080]]){
  await page.setViewportSize({width,height});await fits(`lobby ${width}x${height}`);await shot('viewport-lobby-'+width);
  pass(`lobby ${width}x${height}: no scrolling or clipped actions`);
 }
 await page.setViewportSize({width:1280,height:640});
 await button('설정·도움말').click();
 for(const name of ['카메라','손 조작','게임','도움말']){await page.locator('.view-tabs').getByRole('button',{name,exact:true}).click();await fits('settings '+name);if(name==='도움말')for(const summary of await page.locator('.help-panel summary').all()){await summary.click();await fits('expanded help topic');}}
 await shot('viewport-settings');await page.keyboard.press('Escape');pass('all four settings panels fit the viewport');
 await nav('내 그림');await fits('character basic');
 for(const name of ['자르기·발 위치','배경 제거','그림']){await button(name).click();await fits('character '+name);}
 await page.locator('input[type=file]').setInputFiles(fileURLToPath(new URL('./fixtures/character.png',import.meta.url)));
 await page.getByText('그림을 불러왔어요. 발 기준점을 맞춰보세요.',{exact:true}).waitFor();
 await page.getByLabel('캐릭터 이름',{exact:true}).fill('원본 게임 연결 테스트');await button('이미지 저장').click();
 await page.getByText('사이트에 저장하고 연결된 디노 런에 적용했어요.',{exact:true}).waitFor();await fits('saved character');await shot('viewport-character');
 await page.getByRole('button',{name:/보관함 \(/}).click();await fits('character library');await button('그림 편집').click();
 pass('character tabs, actual image processing/storage and paginated library');
 await nav('기술 체험관');await fits('tracking lab');await button('몸').click();await fits('body lab');await button('그림 움직임').click();await fits('drawing lab');await shot('viewport-lab');
 pass('hand/body lab and drawing experiment fit without scrolling');
 await nav('튜토리얼');await fits('tutorial');await button('손 안내 건너뛰기').click();await fits('tutorial game setup');
 await button('조작 준비하기').click();await page.keyboard.press('Space');await page.keyboard.press('ArrowDown');await button('연습 마치기').click();await fits('tutorial completion');
 pass('tutorial layout and source dino keyboard practice');
 await nav('게임 로비');await page.locator('.game-card.dino').click();await button('조작 준비하기').waitFor();
 await page.waitForFunction(()=>!!document.fullscreenElement);assert.equal(await page.locator('.site-header').count(),0);assert.equal(await page.locator('.app-footer').count(),0);
 assert.equal(await page.locator('.game-view').getAttribute('data-source'),'temp_gameFile/공룡게임.html');
 await page.getByRole('button',{name:/현재 캐릭터: 원본 게임 연결 테스트/}).waitFor();
 await page.locator('.scene-choice select').selectOption('beach');await fits('dino setup');await button('조작 준비하기').click();
 assert.equal((await snapshot()).scene,'beach');await page.keyboard.press('Space');await page.waitForFunction(()=>document.querySelector('iframe').contentWindow.motionGame.snapshot().dino.vy<0);
 await page.waitForFunction(()=>document.querySelector('iframe').contentWindow.motionGame.snapshot().grounded);
 await page.keyboard.down('ArrowDown');await page.waitForFunction(()=>document.querySelector('iframe').contentWindow.motionGame.snapshot().dino.state==='duck');await page.keyboard.up('ArrowDown');
 await fits('dino practice');await shot('viewport-dino');await button('연습 완료 · 게임 시작').click();await page.locator('.countdown').waitFor({state:'hidden'});
 await page.waitForFunction(()=>document.querySelector('iframe').contentWindow.motionGame.snapshot().score>0);
 await button('일시정지').click();const before=await snapshot();await page.waitForTimeout(350);const after=await snapshot();assert.equal(after.score,before.score);assert.equal(after.state,'paused');
 await fits('dino pause');await button('이번 게임 종료').click();await button('다시 하기').click();await page.keyboard.press('Escape');await leave();
 pass('actual source dino, fullscreen entry/exit, background, custom character, jump/duck, score, pause and restart');
 await page.locator('.game-card.tetris').click();await button('조작 준비하기').waitFor();
 assert.equal(await page.locator('.game-view').getAttribute('data-source'),'temp_gameFile/테트리스.html');
 await button('어려움 · 방해 블록').click();await button('조작 준비하기').click();assert.equal((await snapshot()).mode,'HARD');
 const initial=await snapshot();await page.keyboard.press('ArrowLeft');assert.equal((await snapshot()).figure.x,initial.figure.x-1);await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowUp');
 await page.keyboard.press('Space');assert((await snapshot()).field.some(row=>row.some(v=>v>0)));
 await page.keyboard.down('ArrowDown');assert.equal((await snapshot()).pressingDown,true);await page.keyboard.up('ArrowDown');assert.equal((await snapshot()).pressingDown,false);
 await fits('tetris practice');await shot('viewport-tetris');
 const dimensions=await page.locator('iframe').evaluate(f=>{const c=f.contentDocument.getElementById('tetrisCanvas'),r=c.getBoundingClientRect();return{w:r.width,h:r.height,frameHeight:f.clientHeight};});assert(Math.abs(dimensions.h/dimensions.w-2)<.03);assert(dimensions.h>=dimensions.frameHeight*.58);
 await button('연습 완료 · 게임 시작').click();await page.locator('.countdown').waitFor({state:'hidden'});await button('일시정지').click();const paused=await snapshot();await page.waitForTimeout(1100);assert.deepEqual((await snapshot()).figure,paused.figure);
 await button('카운트다운 후 재개').click();await page.locator('.countdown').waitFor({state:'hidden'});assert.equal((await snapshot()).state,'playing');await button('일시정지').click();await button('이번 게임 종료').click();await leave();
 pass('actual source tetris HARD mode, board scaling, original rotation/drop, soft-drop release, pause and resume');
 await page.locator('.game-card.balance').click();await button('조작 준비하기').click();await page.keyboard.press('ArrowLeft');await fits('balance practice');await shot('viewport-balance');await button('전체화면 해제').click();await page.getByRole('heading',{name:'잠깐 쉬어가요',exact:true}).waitFor();await fits('fullscreen exit pause');await leave();
 pass('balance remains playable with compact tracking view; exiting fullscreen pauses play');
 assert.deepEqual(errors,[]);pass('no browser runtime errors');
 await writeFile(new URL('../docs/fullscreen-check-results.json',import.meta.url),JSON.stringify({checks,errors},null,2));
}catch(error){await shot('festival-check-failure');throw error;}finally{await browser.close();}
