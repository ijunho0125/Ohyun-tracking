import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {fixtureHand,translateHand,rollHand} from './hand-fixtures.ts';
import {fixtureFace} from './nod-fixtures.ts';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
await context.addInitScript(()=>{
  window.__fixture={hands:[],pose:[]};window.__dropFrames=false;window.__mockStats={streams:0,liveWorkers:0,maxWorkers:0,frames:0,clicks:0};
  const pending=new Set(),raf=window.requestAnimationFrame.bind(window),cancel=window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame=callback=>{let id=raf(time=>{pending.delete(id);callback(time);});pending.add(id);return id;};window.cancelAnimationFrame=id=>{pending.delete(id);cancel(id);};window.__pendingRAF=()=>pending.size;
  const active={};const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
  for(const [name,original] of [['addEventListener',add],['removeEventListener',remove]])EventTarget.prototype[name]=function(type,listener,...rest){if((this===window||this===document)&&['keydown','keyup','blur','pointerup','visibilitychange','motion-dialog-open'].includes(type)){const key=(this===window?'window:':'document:')+type;active[key]??=new Set();if(name==='addEventListener')active[key].add(listener);else active[key].delete(listener);}return original.call(this,type,listener,...rest);};
  window.__listenerCounts=()=>Object.fromEntries(Object.entries(active).map(([k,v])=>[k,[...v].filter(f=>!f.toString().includes('_hitTargetInterceptor')).length]));window.__listenerDetails=()=>Object.fromEntries(Object.entries(active).map(([k,v])=>[k,[...v].map(f=>f.toString().slice(0,220))]));
  navigator.mediaDevices.getUserMedia=async()=>{
    window.__mockStats.streams++;
    const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const ctx=canvas.getContext('2d');
    const timer=setInterval(()=>{ctx.fillStyle='#49413c';ctx.fillRect(0,0,1280,720);ctx.fillStyle='#fffaf1';for(const hand of window.__fixture.hands)for(const p of hand.points){ctx.beginPath();ctx.arc(p.x*1280,p.y*720,8,0,Math.PI*2);ctx.fill();}},40);
    const stream=canvas.captureStream(25);stream.getTracks()[0].addEventListener('ended',()=>clearInterval(timer));return stream;
  };
  window.Worker=class {
    onmessage=null;onerror=null;dead=false;mode='hand';
    constructor(){window.__mockStats.liveWorkers++;window.__mockStats.maxWorkers=Math.max(window.__mockStats.maxWorkers,window.__mockStats.liveWorkers);}
    postMessage(data){if(data.type==='init'){this.mode=data.mode;setTimeout(()=>{if(!this.dead)this.onmessage?.({data:{type:'ready'}});},0);}if(data.type==='frame'){const width=data.bitmap.width,height=data.bitmap.height;data.bitmap.close();window.__mockStats.frames++;if(window.__dropFrames)return;setTimeout(()=>{if(!this.dead)this.onmessage?.({data:{type:'result',time:data.time,width,height,inferenceMs:2,hands:this.mode!=='pose'?structuredClone(window.__fixture.hands):[],pose:this.mode!=='hand'?structuredClone(window.__fixture.pose):[]}});},5);}}
    terminate(){if(!this.dead){this.dead=true;window.__mockStats.liveWorkers--;}}
  };
  document.addEventListener('click',e=>{if(!e.isTrusted&&e.target.closest('[data-hand]'))window.__mockStats.clicks++;},true);
});
const page=await context.newPage(),errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
const pass=name=>{checks.push(name);console.log('PASS: '+name);};
const fixture=async(hands,ms=400,pose=[])=>{await page.evaluate(data=>{window.__fixture=data;},{hands,pose});await page.waitForTimeout(ms);};
const gameFixture=(hands,ms=400,pose=fixtureFace())=>fixture(hands,ms,pose);
const nav=()=>page.getByRole('navigation',{name:'주요 메뉴'});
async function lobby(){if(await page.locator('.back-button').count())await page.locator('.back-button').click();else await nav().getByRole('button',{name:'게임 로비',exact:true}).click();await page.waitForFunction(()=>!document.fullscreenElement);}
const sourceState=()=>page.locator('iframe.source-game').evaluate(f=>f.contentWindow.motionGame.snapshot());
async function pointing(selector,state='open'){
  const box=await page.locator(selector).boundingBox(),view=page.viewportSize();assert(box);
  const target={x:1-.23-.54*(box.x+box.width/2)/view.width,y:.28+.54*(box.y+box.height/2)/view.height};
  const h=fixtureHand('Right',state),indices=[0,5,9,13,17],center={x:indices.reduce((s,i)=>s+h.points[i].x,0)/5,y:indices.reduce((s,i)=>s+h.points[i].y,0)/5};
  return translateHand(h,target.x-center.x,target.y-center.y);
}
try{
  await page.goto('http://127.0.0.1:5173/');await page.locator('.camera-connect-action').click();await page.getByRole('button',{name:'카메라 허용하고 시작',exact:true}).click();await page.getByText('카메라 연결됨',{exact:true}).waitFor();
  const a=await pointing('.game-card.dino');await fixture([a],700);assert.equal(await page.locator('.game-card.dino[data-motion-state="ready"]').count(),1);
  await fixture([await pointing('.game-card.dino','index')],450);assert.equal(await page.locator('.games-grid').count(),1);
  await fixture([await pointing('.game-card.dino','pinch')],600);assert.equal(await page.locator('.games-grid').count(),1);assert.equal(await page.evaluate(()=>window.__mockStats.clicks),0);pass('palm movement, dwell feedback, index curling and thumb-index touching never click');
  await fixture([a],600);const anchor=await page.locator('.hand-cursor').evaluate(e=>e.style.transform);await fixture([await pointing('.game-card.dino','index')],80);
  const elsewhere=await pointing('.game-card.balance','fist');await fixture([elsewhere],80);assert.equal(await page.locator('.hand-cursor').evaluate(e=>e.style.transform),anchor);await page.waitForTimeout(300);await page.getByRole('heading',{name:'디노 런',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__mockStats.clicks),1);await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>window.__mockStats.clicks),1);assert.equal(await page.getByRole('button',{name:'조작 준비하기',exact:true}).count(),1);pass('closing freezes cursor and original target; one fist selects once and cannot activate the next screen');
  await lobby();await fixture([a],650);await fixture([await pointing('.game-card.dino','fist')],80);await fixture([],100);await fixture([await pointing('.game-card.dino','fist')],500);assert.equal(await page.locator('.games-grid').count(),1);assert.equal(await page.evaluate(()=>window.__mockStats.clicks),1);
  await fixture([fixtureHand('Left')],300);assert.equal(await page.locator('.hand-cursor').count(),0);pass('tracking loss cancels a close and the other hand never takes over the cursor');
  await fixture([a],650);
  const alignment=await page.locator('.camera-screen').first().evaluate(e=>{const v=e.querySelector('video'),c=e.querySelector('canvas'),vr=v.getBoundingClientRect(),cr=c.getBoundingClientRect();const p=window.__fixture.hands[0].points[5];return {w:c.width,h:c.height,video:[vr.x,vr.y,vr.width,vr.height],canvas:[cr.x,cr.y,cr.width,cr.height],mirror:[getComputedStyle(v).transform,getComputedStyle(c).transform],pixel:[...c.getContext('2d').getImageData(Math.round(p.x*c.width),Math.round(p.y*c.height),1,1).data]};});
  assert.equal(alignment.w,1280);assert.equal(alignment.h,720);assert.deepEqual(alignment.video,alignment.canvas);assert.equal(alignment.mirror[0],alignment.mirror[1]);assert(alignment.pixel[3]>0);await page.locator('.camera-panel').first().scrollIntoViewIfNeeded();await page.screenshot({path:fileURLToPath(new URL('../docs/screenshots/pc-tracking-mock.png',import.meta.url))});
  await page.getByRole('button',{name:'확대',exact:true}).click();await page.locator('dialog[open] .camera-screen video').waitFor();await page.evaluate(()=>document.body.style.zoom='1.2');
  assert(await page.locator('dialog[open] .camera-screen').evaluate(e=>{const v=e.querySelector('video').getBoundingClientRect(),c=e.querySelector('canvas').getBoundingClientRect();return Math.abs(v.x-c.x)<.1&&Math.abs(v.width-c.width)<.1&&Math.abs(v.height-c.height)<.1;}));
  await page.getByLabel('관절 표시 켜기',{exact:true}).uncheck();assert(await page.locator('dialog[open] canvas').evaluate(c=>!c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v)));
  await page.evaluate(()=>document.body.style.zoom='');await page.keyboard.press('Escape');await page.locator('.camera-tools input[type=checkbox]').check();pass('16:9 raw-coordinate overlay matches video bounds and mirror, including enlargement, zoom and display toggle');
  await fixture([],200);await nav().getByRole('button',{name:'튜토리얼',exact:true}).click();await fixture([fixtureHand()],500);await page.locator('[data-tutorial-step="1"]').waitFor();const tutorialOpen=await pointing('.tutorial-target');await fixture([tutorialOpen],900);await page.locator('[data-tutorial-step="2"]').waitFor();await page.locator('.tutorial-target').click();assert.equal(await page.locator('[data-tutorial-step="2"]').count(),1);await fixture([tutorialOpen],600);await fixture([await pointing('.tutorial-target','fist')],400);await page.locator('[data-tutorial-step="3"]').waitFor();await page.waitForTimeout(400);assert.equal(await page.locator('[data-tutorial-step="3"]').count(),1);await fixture([tutorialOpen],500);await page.getByRole('button',{name:'조작 준비하기',exact:true}).waitFor();pass('tiger tutorial advances on actual mock landmarks, motion selection and confirmed release, not mouse clicks or time');
  await lobby();await fixture([],200);await nav().getByRole('button',{name:'튜토리얼',exact:true}).click();await fixture([fixtureHand()],500);await page.locator('[data-tutorial-step="1"]').waitFor();
  const nextPalm=await pointing('.tutorial-next');await fixture([nextPalm],1200);await page.locator('[data-tutorial-step="2"]').waitFor();await page.waitForTimeout(1100);assert.equal(await page.locator('[data-tutorial-step="2"]').count(),1);
  await fixture([fixtureHand()],300);await fixture([await pointing('.tutorial-next')],1200);await page.getByRole('button',{name:'조작 준비하기',exact:true}).waitFor();
  await page.getByRole('button',{name:'키보드로',exact:true}).click();await page.getByRole('button',{name:'조작 준비하기',exact:true}).click();await page.keyboard.press('Space');await page.keyboard.press('ArrowDown');await page.getByRole('button',{name:'연습 마치기',exact:true}).waitFor();await page.getByRole('heading',{name:'잠깐 쉬어가요',exact:true}).waitFor();await fixture([await pointing('[data-hand-id="tutorial-finish"]')],1200);await page.getByRole('heading',{name:'플레이할 준비 완료',exact:true}).waitFor();pass('open-palm next and finish work; held cursor cannot advance successive screens or fabricate practice completion');
  const clicksBeforeGame=await page.evaluate(()=>window.__mockStats.clicks);
  await lobby();await page.locator('.game-card.tetris').click();await fixture([fixtureHand('Left'),fixtureHand()],500);await page.getByRole('button',{name:'조작 준비하기',exact:true}).click();await page.locator('.practice-strip').waitFor();
  await fixture([fixtureHand('Left'),fixtureHand()],500);
  await gameFixture([fixtureHand('Left'),fixtureHand()],700);
  await page.locator('iframe').evaluate(frame=>{const api=frame.contentWindow.motionGame,original=api.command;window.__commands=[];api.command=command=>{window.__commands.push({...command});original.call(api,command);};});
  const beforeLeft=await sourceState();await gameFixture([fixtureHand('Left','fist'),fixtureHand()],400);const afterLeft=await sourceState();assert(afterLeft.figure.x<beforeLeft.figure.x);
  await gameFixture([fixtureHand('Left'),fixtureHand('Right','fist')],400);const afterRight=await sourceState();assert(afterRight.figure.x>afterLeft.figure.x);
  await gameFixture([fixtureHand('Left'),fixtureHand()],250);const beforeWrist=await sourceState();await gameFixture([rollHand(fixtureHand('Left'),.65),fixtureHand()],300);assert.equal((await sourceState()).figure.x,beforeWrist.figure.x);assert.equal(await page.evaluate(()=>window.__commands.filter(c=>c.type==='rotate').length),0);
  await gameFixture([fixtureHand('Left'),fixtureHand()],250,fixtureFace(.04));await gameFixture([fixtureHand('Left'),fixtureHand()],250);assert.equal(await page.evaluate(()=>window.__commands.filter(c=>c.type==='rotate').length),1);
  const beforeDrop=await sourceState();await gameFixture([fixtureHand('Left','fist'),fixtureHand('Right','fist')],400);const afterDrop=await sourceState();assert(afterDrop.field.flat().filter(Boolean).length>beforeDrop.field.flat().filter(Boolean).length);assert.equal(await page.evaluate(()=>window.__commands.filter(c=>c.type==='hardDrop').length),1);
  await gameFixture([fixtureHand('Left','fist'),fixtureHand('Right','fist')],500);assert.equal(await page.evaluate(()=>window.__commands.filter(c=>c.type==='hardDrop').length),1);
  await gameFixture([fixtureHand('Left'),fixtureHand()],250);await gameFixture([fixtureHand('Left','fist'),fixtureHand('Right','fist')],400);assert.equal(await page.evaluate(()=>window.__commands.filter(c=>c.type==='hardDrop').length),2);
  assert.equal(await page.locator('.hand-cursor').count(),0);assert.equal(await page.evaluate(()=>window.__mockStats.clicks),clicksBeforeGame);await page.screenshot({path:fileURLToPath(new URL('../docs/screenshots/festival-motion.png',import.meta.url))});pass('original tetris: left/right fists move, nod-return rotates once, both fists instantly drop once per cycle, wrist bends do nothing');
  await fixture([],1800);assert.equal((await sourceState()).pressingDown,false);await page.getByRole('heading',{name:'잠깐 쉬어가요',exact:true}).waitFor();assert.equal(await page.locator('.camera-screen canvas').first().evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v)),false);pass('lost hands clear overlays, release held input and automatically pause the game');
  for(let i=0;i<12;i++){await lobby();await page.locator('.game-card.'+(['dino','tetris','balance'][i%3])).click();}
  await page.waitForTimeout(200);const stats=await page.evaluate(()=>({mock:window.__mockStats,raf:window.__pendingRAF(),listeners:window.__listenerCounts(),details:window.__listenerDetails()}));assert.equal(stats.mock.streams,1);assert.equal(stats.mock.maxWorkers,1);assert.equal(stats.mock.liveWorkers,1);assert(stats.raf<=2);for(const [name,count] of Object.entries(stats.listeners))assert(count<=(name==='document:visibilitychange'?2:1),name+': '+count);pass('12 game switches retain one stream, one live worker, at most two RAF callbacks and no duplicated game listeners');
  await lobby();await fixture([a],500);await page.evaluate(()=>window.__dropFrames=true);await page.waitForTimeout(1000);assert.equal(await page.locator('.hand-cursor').count(),0);assert.equal(await page.locator('.camera-screen canvas').first().evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v)),false);pass('stalled inference expires old landmarks and cursor');
  assert.deepEqual(errors,[]);await writeFile(new URL('../docs/motion-check-results.json',import.meta.url),JSON.stringify({checks,stats,alignment,errors,note:'Mock camera stream and mock worker landmarks; no human webcam performance was tested.'},null,2));
}catch(error){console.log('State:',await page.evaluate(()=>({tutorial:document.querySelector('[data-tutorial-step]')?.getAttribute('data-tutorial-step'),headings:[...document.querySelectorAll('h1,h2')].filter(e=>e.checkVisibility()).map(e=>e.textContent),cursor:document.querySelector('.hand-cursor')?.textContent})));await page.screenshot({path:fileURLToPath(new URL('../docs/screenshots/motion-check-failure.png',import.meta.url))});throw error;}finally{await browser.close();}


