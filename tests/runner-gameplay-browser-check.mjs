import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try {
  await page.goto('http://127.0.0.1:5173');
  await page.locator('.game-card.balance').click();
  await page.waitForFunction(()=>document.querySelector('iframe.source-game')?.contentWindow?.motionGame);
  const data=await page.locator('iframe.source-game').evaluate(frame=>{
    const w=frame.contentWindow,api=w.motionGame;
    const run=code=>w.eval(code);
    const advance=n=>{for(let i=0;i<n;i++)api.advance(1/60+1e-8);};
    const stable=n=>{for(let i=0;i<n;i++){run('runner.angle=0; runner.angularVelocity=0');advance(1);}};
    api.configure({},'',true);api.start('EASY');api.practice(false);
    stable(179);const beforeDash=api.snapshot();stable(2);const dash=api.snapshot();
    api.pause();const paused=api.snapshot();advance(60);const pausedAfter=api.snapshot();api.resume();
    stable(179);const endDash=api.snapshot();
    run('runner.x=180+50*80-2;runner.angle=0;runner.angularVelocity=0');advance(3);const segment=api.snapshot(),segmentBonus=run('runner.hasStabilityBoost()');
    run("powerups.length=0; powerups.push(new PowerUpItem('speed',runner.x+3));");
    advance(2);const item=api.snapshot(),pickup=run('runner.hasSpeedBoost()');
    run('runner.x=GOAL_WORLD_X-65;runner.angle=0;runner.angularVelocity=0');advance(2);const win=api.snapshot();
    api.reset();const reset=api.snapshot();api.start('EASY');api.practice(true);api.command({type:'tilt',value:.12});advance(12);const lean1=api.snapshot();advance(12);const lean2=api.snapshot();api.command({type:'tilt',value:-.12});advance(60);const reverse=api.snapshot();api.release();const released=api.snapshot();
    return {beforeDash,dash,paused,pausedAfter,endDash,segment,segmentBonus,item,pickup,win,reset,lean1,lean2,reverse,released};
  });
  assert(data.beforeDash.dashFrames===0&&data.dash.dashFrames>0,'dash enters after balancing');
  assert.equal(data.paused.dashFrames,data.pausedAfter.dashFrames,'pause freezes dash');
  assert.equal(data.paused.score,data.pausedAfter.score,'pause freezes distance');
  assert.equal(data.endDash.dashFrames,0,'dash ends');
  assert.equal(data.segment.segment,1,'checkpoint reached');assert(data.segmentBonus,'checkpoint stability reward active');
  assert(data.pickup,'speed item collected');assert.equal(data.win.state,'gameover');assert.equal(data.win.score,2000,'200m win');
  assert.equal(data.reset.score,0);assert.equal(data.reset.dashCount,0);assert.equal(data.reset.segment,0);
  assert(data.lean2.angle>data.lean1.angle&&data.lean2.angularVelocity>data.lean1.angularVelocity,'angle accelerates');
  assert(data.reverse.angle<data.lean2.angle,'reverse lean corrects');assert.equal(data.released.tilt,0);
  assert.deepEqual(errors,[]);console.log('PASS',JSON.stringify(data));
} finally {await browser.close();}
