import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:5173');
  const html=await page.evaluate(async()=>{
    const {sourceDocument}=await import('/src/games/source-games.ts');
    return sourceDocument('dino');
  });
  // Isolate scheduling from survival: keep the actual spawn, movement, speed,
  // clock code, suppress collisions and force the highest speed-boost multiplier.
  const collision='if (rectsOverlap(dHitbox, obstacleHitbox(ob))) {';
  const speedBoost='const speedMultiplier = (effectTimers.speed > 0) ? 1.3 : 1.0;';
  assert(html.includes(collision));
  assert(html.includes(speedBoost));
  await page.evaluate(html=>{
    const frame=document.createElement('iframe');frame.id='pacing-check';
    frame.srcdoc=html;document.body.append(frame);
  },html.replace(collision,'if (false) {').replace(speedBoost,'const speedMultiplier = 1.3;'));
  await page.waitForFunction(()=>document.querySelector('#pacing-check').contentWindow.motionGame);
  for(const dinoMode of ['body','seated']) {
    for(const obstacleGap of [1.3,3.2,5]) {
      const result=await page.evaluate(({dinoMode,obstacleGap})=>{
        const api=document.querySelector('#pacing-check').contentWindow.motionGame;
        api.configure({dinoSpeed:380,obstacleGap,dinoMode},'day',true);
        api.practice(false);api.start();
        const spawns=[],arrivals=[];let previousTail=-Infinity,maximumSpeed=0;
        // 180 seconds covers acceleration to the motion speed cap.
        for(let i=0;i<3600;i++) {
          const before=api.snapshot();
          api.advance(.05);const snap=api.snapshot();
          maximumSpeed=Math.max(maximumSpeed,snap.speed);
          const tail=snap.obstacleDetails.at(-1);
          if(tail&&tail.x>previousTail+1)spawns.push({time:snap.time,count:snap.obstacleDetails.length-before.obstacleDetails.length,type:tail.type});
          previousTail=tail?.x??-Infinity;
          for(let j=0;j<before.obstacleDetails.length;j++) {
            const old=before.obstacleDetails[j];
            const moved=snap.obstacleDetails.find(ob=>ob.type===old.type&&ob.x<old.x&&Math.abs(ob.x-(old.x-before.speed*60*.05))<20);
            if(old.x>snap.dino.x&&moved&&moved.x<=snap.dino.x)arrivals.push(snap.time);
          }
        }
        return {spawns,arrivals,maximumSpeed};
      },{dinoMode,obstacleGap});
      assert(result.spawns.length>=5,JSON.stringify(result));
      assert(result.maximumSpeed>=9.5&&result.maximumSpeed<=10,'faster motion speed reaches its new cap');
      for(let i=0;i<result.spawns.length;i++) {
        assert(result.spawns[i].count<=1,'no compound motion encounters');
        if(dinoMode==='seated')assert(result.spawns[i].type.startsWith('cactus-'),'seated input needs no duck');
        if(i)assert(result.spawns[i].time-result.spawns[i-1].time>=obstacleGap*1000-51,'minimum spawn time');
      }
      assert(result.arrivals.length>=3,'obstacles actually reach the player');
      for(let i=1;i<result.arrivals.length;i++)assert(result.arrivals[i]-result.arrivals[i-1]>=obstacleGap*1000-51,'minimum reaction time at player');
      console.log(`PASS: ${dinoMode}, ${obstacleGap}s minimum gap, ${result.spawns.length} single encounters, speed <= ${result.maximumSpeed.toFixed(2)}`);
    }
  }
  assert.deepEqual(errors,[]);

  // Add fixtures only to this test document. Keep the actual collision rules,
  // physics and assist timers, and place obstacles at controlled contact points.
  assert(html.includes('frame(0);'));
  await page.evaluate(html=>{
    const frame=document.createElement('iframe');frame.id='assist-check';
    frame.srcdoc=html;document.body.append(frame);
  },html.replace('frame(0);',`window.__dinoFixture = {
    quiet() { obstacles = []; items = []; nextSpawnDistance = Infinity; },
    obstacle(width) {
      const ob = placeObstacle(makeObstacle('cactus-large'), dino.x + 12);
      if (width) ob.width = width;
      obstacles.push(ob);
    },
    boost() { effectTimers.speed = 2000; }
  }; frame(0);`));
  await page.waitForFunction(()=>document.querySelector('#assist-check').contentWindow.motionGame);
  const assistResults=await page.evaluate(()=>{
    const win=document.querySelector('#assist-check').contentWindow;
    const api=win.motionGame, fixture=win.__dinoFixture, results=[];
    const check=(condition,message)=>{if(!condition)throw new Error(message);};
    const tick=(count=1)=>{for(let i=0;i<count;i++)api.advance(1/60);};
    const fresh=(motion=true,dinoMode='body')=>{
      api.configure({dinoSpeed:260,obstacleGap:3.2,dinoMode},'day',motion);
      api.practice(false);api.start();fixture.quiet();
    };
    const unprotected=(motion=true,dinoMode='body')=>{fresh(motion,dinoMode);tick(125);};

    for(const dinoMode of ['body','seated']) {
      fresh(true,dinoMode);
      api.command({type:'duck',value:true});tick();
      check(api.snapshot().dino.state==='duck','fixture is physically crouched');
      api.command({type:'duck',value:false});api.command({type:'jump'});tick();
      check(!api.snapshot().grounded&&api.snapshot().dino.vy<0,'crouch jump remains airborne after its first physics step');
      const takeoffY=api.snapshot().dino.y;tick(3);
      check(api.snapshot().dino.y<takeoffY,'crouch jump continues climbing instead of immediately landing');
      fresh(true,dinoMode);
      check(api.snapshot().speed===6.5,'default motion speed increases from 3.9 to 6.5');
      check(api.snapshot().assist.protectionMs===2000,'two seconds of startup protection');
      fixture.obstacle();tick();
      check(api.snapshot().state==='running'&&api.snapshot().obstacles===1,'protected obstacles remain visible');
      check(api.snapshot().score<2,'assist does not award a collision bonus');

      unprotected(true,dinoMode);fixture.obstacle();tick();
      check(api.snapshot().assist.pendingCollisions===1,'motion contact waits briefly for a gesture');
      check(api.snapshot().dino.state==='run','contact does not fabricate a jump');
      tick(9);
      check(api.snapshot().state==='gameover','a real collision still ends the game without input');

      unprotected(true,dinoMode);fixture.obstacle();tick(6);api.command({type:'jump'});
      check(api.snapshot().dino.state==='jump'&&api.snapshot().assist.pendingCollisions===0,'a gesture about 100ms late rescues contact');
      check(api.snapshot().assist.protectionMs===450,'accepted jump grants 450ms protection');
      tick(5);const jumpProtection=api.snapshot().assist.protectionMs;
      api.command({type:'jump'});
      check(api.snapshot().assist.protectionMs===jumpProtection,'airborne jump repeats cannot renew protection');
      let flight=0;while(!api.snapshot().grounded&&flight++<90)tick();
      check(api.snapshot().grounded&&api.snapshot().assist.protectionMs===180,'landing adds a short recovery window');
      tick(12);check(api.snapshot().assist.protectionMs===0,'landing protection expires');

      unprotected(true,dinoMode);fixture.obstacle();tick(6);api.command({type:'duck',value:true});tick();
      check(api.snapshot().state==='running'&&api.snapshot().dino.state==='duck','late crouch also rescues contact');

      unprotected(true,dinoMode);api.command({type:'duck',value:true});
      check(api.snapshot().assist.protectionMs===300,'new crouch grants 300ms protection');
      fixture.obstacle(320);tick(10);const duckProtection=api.snapshot().assist.protectionMs;
      api.command({type:'duck',value:true});
      check(api.snapshot().assist.protectionMs===duckProtection,'held crouch cannot renew protection');
      tick(15);
      check(api.snapshot().assist.protectionMs===0&&api.snapshot().state==='running'&&api.snapshot().obstacles===1,'the same obstacle stays safe through its trailing edge');
      fixture.obstacle();tick(10);
      check(api.snapshot().state==='gameover','a subsequent obstacle is dangerous after protection expires');

      unprotected(true,dinoMode);fixture.obstacle();tick();api.pause();
      const paused=api.snapshot();tick(180);
      check(api.snapshot().state==='paused'&&api.snapshot().assist.pendingCollisions===paused.assist.pendingCollisions,'pending collisions freeze while paused');
      api.resume();check(api.snapshot().assist.protectionMs===1000&&api.snapshot().assist.pendingCollisions===0,'resume clears pending contact and grants one second');
      tick(20);api.pause();const protectedPause=api.snapshot().assist.protectionMs;tick(180);
      check(api.snapshot().assist.protectionMs===protectedPause,'protection uses playing time only');
      api.resume();tick(70);fixture.obstacle();tick(10);
      check(api.snapshot().state==='gameover','resume protection expires');
      results.push(dinoMode+': faster running, start/action/landing/resume protection, late gestures, real game over');
    }

    unprotected(false);check(api.snapshot().speed>6.9,'keyboard running is faster too');
    fixture.obstacle();tick();
    check(api.snapshot().state==='gameover'&&api.snapshot().assist.pendingCollisions===0,'keyboard collisions remain immediate after startup protection');

    unprotected();fixture.boost();fixture.obstacle();const beforeBoost=api.snapshot().score;tick();
    check(api.snapshot().state==='running'&&api.snapshot().obstacles===0&&api.snapshot().score>=beforeBoost+10,'original speed boost still removes obstacles and awards its bonus');
    api.command({type:'jump'});api.reset();
    check(api.snapshot().state==='idle'&&api.snapshot().assist.protectionMs===0&&api.snapshot().assist.pendingCollisions===0,'reset clears all assist state');
    api.start();check(api.snapshot().assist.protectionMs===2000,'restart grants fresh protection');
    api.dispose();check(api.snapshot().state==='disposed'&&api.snapshot().assist.protectionMs===0,'dispose clears protection');
    results.push('keyboard collision rules, original boost rewards, restart and disposal');
    return results;
  });
  for(const result of assistResults)console.log('PASS: '+result);

  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(()=>{
    window.__pose=[];window.__readyDelay=0;window.__firstFrameDelay=0;window.__frames=0;
    navigator.mediaDevices.getUserMedia=async()=>{
      const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
      const ctx=canvas.getContext('2d');
      const timer=setInterval(()=>{ctx.fillStyle='#49413c';ctx.fillRect(0,0,640,480);},33);
      const stream=canvas.captureStream(30);
      stream.getTracks()[0].addEventListener('ended',()=>clearInterval(timer));return stream;
    };
    window.Worker=class {
      onmessage=null;dead=false;mode='hand';first=true;
      postMessage(data) {
        if(data.type==='init') { this.mode=data.mode;setTimeout(()=>{if(!this.dead)this.onmessage?.({data:{type:'ready'}});},window.__readyDelay); }
        if(data.type==='frame') {
          window.__frames++;
          const width=data.bitmap.width,height=data.bitmap.height;data.bitmap.close();
          const delay=this.first?window.__firstFrameDelay:0;this.first=false;
          setTimeout(()=>{if(!this.dead){
            window.__deliveringMotion=true;window.__motionDeliveredAt=performance.now();
            try {this.onmessage?.({data:{type:'result',time:data.time,width,height,inferenceMs:1,hands:[],pose:this.mode==='hand'?[]:structuredClone(window.__pose)}});}
            finally {window.__deliveringMotion=false;}
          }},delay);
        }
      }
      terminate(){this.dead=true;}
    };
  });
  const inputPage=await context.newPage();inputPage.on('pageerror',e=>errors.push(e.message));
  const body=(shift=0,wrist=.8)=>{
    const points=Array.from({length:33},()=>({x:.5,y:.5,visibility:1,presence:1}));
    for(const [i,x,y] of [[11,.4,.4],[12,.6,.4],[23,.42,.7],[24,.58,.7]])points[i]={x,y:y+shift,visibility:1,presence:1};
    points[15].y=wrist;points[16].y=wrist;return points;
  };
  const fixture=async(points,ms=300)=>{
    const before=await inputPage.evaluate(points=>{window.__pose=points;return window.__frames;},points);
    await inputPage.waitForFunction(before=>window.__frames>=before+4,before);
    await inputPage.waitForTimeout(ms);
  };
  const button=name=>inputPage.getByRole('button',{name,exact:true});
  const snapshot=()=>inputPage.locator('iframe.source-game').evaluate(f=>f.contentWindow.motionGame.snapshot());
  await inputPage.goto(process.env.TEST_URL||'http://127.0.0.1:5173');
  await inputPage.locator('.game-card.dino').click();
  assert.equal(await inputPage.locator('.game-view').getAttribute('data-input'),'keyboard');
  await inputPage.locator('.camera-tools').getByRole('button',{name:'연결',exact:true}).click();await button('카메라 허용하고 시작').click();
  await inputPage.getByRole('button',{name:'확대',exact:true}).waitFor();
  assert.equal(await inputPage.locator('.game-view').getAttribute('data-input'),'motion','connecting a camera in game setup must enable motion input');
  await fixture(body());await button('조작 준비하기').click();
  await inputPage.locator('.game-view[data-phase="practice"]').waitFor();await fixture(body());
  await inputPage.locator('iframe.source-game').evaluate(f=>{
    const api=f.contentWindow.motionGame,original=api.command;window.__jumps=0;window.__jumpDelivery=[];
    api.command=c=>{if(c.type==='jump'){window.__jumps++;window.__jumpReleasedDuck=!api.snapshot().dino.duckHeld;window.__jumpDelivery.push({synchronous:window.__deliveringMotion===true,ms:performance.now()-window.__motionDeliveredAt});}original.call(api,c);if(c.type==='jump')window.__jumpStarted=api.snapshot().dino.state==='jump';};
  });
  await fixture(body(-.021),200);assert.equal(await inputPage.evaluate(()=>window.__jumps),1);assert.equal(await inputPage.evaluate(()=>window.__jumpStarted),true);
  await fixture(body(-.021),500);assert.equal(await inputPage.evaluate(()=>window.__jumps),1);
  await fixture(body());await fixture(body(-.021),200);assert.equal(await inputPage.evaluate(()=>window.__jumps),2);
  const landCrouched=async()=>{
    await fixture(body(.07),500);
    await inputPage.waitForFunction(()=>document.querySelector('iframe.source-game').contentWindow.motionGame.snapshot().dino.state==='duck');
    // Count grounded pose frames after landing, independently of animation speed.
    await fixture(body(.07),0);
  };
  await landCrouched();
  for(let expected=3;expected<=5;expected++){
    await fixture(body(-.021),200);
    assert.equal(await inputPage.evaluate(()=>window.__jumps),expected,'crouch-to-jump must work without a standing pause');
    assert.equal(await inputPage.evaluate(()=>window.__jumpReleasedDuck),true,'release duck before starting the jump');
    assert.equal(await inputPage.evaluate(()=>window.__jumpStarted),true);
    await fixture(body(-.021),500);assert.equal(await inputPage.evaluate(()=>window.__jumps),expected);
    await landCrouched();
  }
  await fixture(body());assert.equal(await inputPage.evaluate(()=>window.__jumps),5,'standing up alone must not jump');
  const deliveries=await inputPage.evaluate(()=>window.__jumpDelivery);
  assert.equal(deliveries.length,5);
  assert(deliveries.every(sample=>sample.synchronous),'all camera jumps must reach physics in the worker result callback, before React rendering');
  console.log('PASS: synchronous worker-result to game command delivery (ms): '+deliveries.map(sample=>sample.ms.toFixed(2)).join(', '));
  console.log('PASS: actual dino motion calibration, small jumps, repeated crouch-to-jump transitions, duck release, and standing without false jumps');
  await button('로비').click();await inputPage.waitForFunction(()=>!document.fullscreenElement);
  await button('설정·도움말').click();await inputPage.locator('.view-tabs').getByRole('button',{name:'게임',exact:true}).click();
  await inputPage.getByLabel('디노 모션 조작').selectOption('seated');await inputPage.keyboard.press('Escape');
  await inputPage.locator('.game-card.dino').click();await fixture(body());await button('조작 준비하기').click();
  await inputPage.locator('.game-view[data-phase="practice"]').waitFor();
  assert.equal(await inputPage.locator('.practice-checks > span').count(),1);
  await fixture(body());await fixture(body(0,.3));assert.equal(await inputPage.locator('.practice-checks .complete').count(),1);
  await fixture(body());await inputPage.keyboard.press('Escape');await inputPage.waitForTimeout(200);
  await inputPage.evaluate(()=>{window.__readyDelay=1800;window.__firstFrameDelay=1600;});
  await button('카운트다운 후 재개').click();await inputPage.waitForTimeout(1500);
  assert.equal(await inputPage.locator('.game-view').getAttribute('data-phase'),'countdown');
  await inputPage.locator('.game-view[data-phase="running"]').waitFor({timeout:10000});assert((await snapshot()).speed>=6.5&&(await snapshot()).speed<=10);
  console.log('PASS: seated dino needs only hand-raise practice; slow model loading and first-inference warmup do not falsely pause resume');
  await inputPage.evaluate(()=>{window.__readyDelay=0;window.__firstFrameDelay=0;});
  await inputPage.keyboard.press('Escape');await button('키보드로 이어하기').click();
  await inputPage.locator('.game-view[data-phase="running"]').waitFor();
  assert.equal(await inputPage.locator('.game-view').getAttribute('data-input'),'keyboard');
  await inputPage.keyboard.press('Escape');await button('모션으로 전환').click();
  await inputPage.locator('.game-view[data-phase="practice"]').waitFor();
  assert.equal(await inputPage.locator('.game-view').getAttribute('data-input'),'motion');
  await button('로비').click();await inputPage.waitForFunction(()=>!document.fullscreenElement);
  await inputPage.locator('.game-card.dino').click();await button('키보드로').click();
  await inputPage.waitForTimeout(200);
  assert.equal(await inputPage.locator('.game-view').getAttribute('data-input'),'keyboard','explicit keyboard preference must be respected');
  console.log('PASS: paused keyboard games switch to motion through calibration; explicit keyboard choice remains available');
  assert.deepEqual(errors,[]);
} finally { await browser.close(); }
