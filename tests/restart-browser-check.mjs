import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {fixtureHand} from './hand-fixtures.ts';
import {fixtureBody} from './pose-fixtures.ts';

const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.addInitScript(()=>{
  window.__fixture={hands:[],pose:[]};window.__workers=[];
  window.__stats={streams:0,liveWorkers:0,maxWorkers:0};
  navigator.mediaDevices.getUserMedia=async()=>{
    window.__stats.streams++;
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
    const ctx=canvas.getContext('2d');
    const timer=setInterval(()=>{ctx.fillStyle='#49413c';ctx.fillRect(0,0,640,480);},33);
    const stream=canvas.captureStream(30);
    stream.getTracks()[0].addEventListener('ended',()=>clearInterval(timer));return stream;
  };
  window.Worker=class {
    onmessage=null;onerror=null;dead=false;mode='hand';
    constructor(){window.__workers.push(this);window.__stats.liveWorkers++;window.__stats.maxWorkers=Math.max(window.__stats.maxWorkers,window.__stats.liveWorkers);}
    postMessage(data){
      if(data.type==='init'){this.mode=data.mode;setTimeout(()=>{if(!this.dead)this.onmessage?.({data:{type:'ready'}});},0);}
      if(data.type==='frame'){
        const width=data.width,height=data.height,fixture=structuredClone(window.__fixture);data.bitmap.close();
        setTimeout(()=>{if(!this.dead)this.onmessage?.({data:{type:'result',time:data.time,width,height,inferenceMs:1,hands:this.mode==='pose'?[]:fixture.hands,pose:this.mode==='hand'?[]:fixture.pose}});},5);
      }
    }
    terminate(){if(!this.dead){this.dead=true;window.__stats.liveWorkers--;}}
  };
});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const button=name=>page.getByRole('button',{name,exact:true});
const phase=name=>page.locator(`.game-view[data-phase="${name}"]`);
const score=()=>page.locator('.game-score').first().innerText();
const snapshot=()=>page.locator('iframe.source-game').evaluate(frame=>frame.contentWindow.motionGame.snapshot());
const fixture=(shift=0,present=true)=>page.evaluate(value=>{window.__fixture=value;},{hands:present?[fixtureHand('Left'),fixtureHand('Right')]:[],pose:present?fixtureBody(shift):[]});
const checkNeutral=async id=>{
  if(id==='dino')assert.equal((await snapshot()).dino.duckHeld,false,'the new standing height must not duck');
  if(id==='tetris')assert.equal((await snapshot()).pressingDown,false,'the new standing height must not soft-drop');
};

try{
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:5173');
  await page.locator('.camera-connect-action').click();await button('카메라 허용하고 시작').click();
  await page.getByText('카메라 연결됨',{exact:true}).waitFor();
  for(const id of ['dino','tetris','balance']){
    await fixture();await page.locator('.game-card.'+id).click();await button('조작 준비하기').click();
    await phase('practice').waitFor();
    await page.locator('.practice-strip button').click();
    await phase('countdown').waitFor();await phase('running').waitFor();
    await page.waitForTimeout(300);await page.keyboard.press('Escape');await phase('paused').waitFor();
    const pausedScore=await score();

    await fixture(0,false);await button('카운트다운 후 재개').click();
    await phase('calibration').waitFor();await page.waitForTimeout(1800);
    assert.equal(await phase('calibration').count(),1,'missing body must not start the countdown');
    assert.equal(await page.locator('progress').getAttribute('value'),'0');
    assert.equal(await score(),pausedScore,'recalibration must preserve the paused score');
    await fixture(.1);await phase('countdown').waitFor();
    assert.equal(await score(),pausedScore,'the game must stay paused during the countdown');
    await phase('running').waitFor();await page.waitForTimeout(200);await checkNeutral(id);
    console.log(`PASS: ${id} resume waits for fresh body calibration, preserves score, and accepts a new standing height`);

    await page.keyboard.press('Escape');await phase('paused').waitFor();
    await fixture(0,false);await button('처음부터 다시').click();
    await phase('calibration').waitFor();assert.match(await score(),id==='balance'?/0\.0m/:/00000/);
    await page.waitForTimeout(200);assert.equal(await phase('calibration').count(),1);
    await fixture(-.06);await phase('countdown').waitFor();
    // A briefly lost body must restart the full countdown, even if it returns
    // inside the auto-pause timeout.
    await page.waitForTimeout(900);await fixture(0,false);await page.waitForTimeout(250);
    assert.equal(await page.locator('.countdown strong').innerText(),'3');
    await fixture(-.06);await page.waitForTimeout(2200);
    assert.equal(await phase('countdown').count(),1,'tracking recovery needs a full new countdown');
    await phase('running').waitFor();await page.waitForTimeout(200);await checkNeutral(id);
    console.log(`PASS: ${id} restart resets score and baseline; lost tracking resets the countdown`);

    await page.keyboard.press('Escape');await phase('paused').waitFor();
    await button('이번 게임 종료').click();await phase('over').waitFor();
    await fixture(0,false);await button('다시 하기').click();await phase('calibration').waitFor();
    await button('키보드로 이어하기').click();await phase('countdown').waitFor();
    assert.equal(await page.locator('.game-view').getAttribute('data-input'),'keyboard');
    await phase('running').waitFor();await page.keyboard.press('Escape');await phase('paused').waitFor();
    await button('카운트다운 후 재개').click();await phase('countdown').waitFor();
    await phase('running').waitFor();
    console.log(`PASS: ${id} game-over retry reacquires the body; keyboard fallback and keyboard resume skip calibration`);
    await button('로비').click();await page.waitForFunction(()=>!document.fullscreenElement);
  }

  // A disconnected camera must not erase the finished game or enter a
  // countdown that cannot complete.
  await fixture();await page.locator('.game-card.dino').click();await button('조작 준비하기').click();
  await phase('practice').waitFor();await page.keyboard.press('Escape');await phase('paused').waitFor();
  await button('이번 게임 종료').click();await phase('over').waitFor();const finalScore=await score();
  await page.evaluate(()=>window.__workers.at(-1).onerror());
  await button('다시 하기').click();await page.locator('dialog[open]').waitFor();
  assert.equal(await phase('over').count(),1);assert.equal(await score(),finalScore);
  await page.keyboard.press('Escape');
  console.log('PASS: retry with a disconnected camera requests reconnection and keeps the finished game intact');

  assert.deepEqual(errors,[]);
  const stats=await page.evaluate(()=>window.__stats);
  assert.equal(stats.streams,1);assert.equal(stats.maxWorkers,1);
  console.log('PASS: one camera stream, at most one live worker, and no browser errors');
}finally{await browser.close();}
