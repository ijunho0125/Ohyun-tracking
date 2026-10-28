import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:5173');
  const html=await page.evaluate(async()=> (await import('/src/games/source-games.ts')).sourceDocument('dino'));
  assert(html.includes('frame(0);'));
  const fixture=`window.__coinFixture = {
    quiet() { obstacles = []; items = []; nextSpawnDistance = Infinity; },
    coin(x=dino.x+12, y=dino.y+8) { items.push({type:'coin',x,y,width:22,height:22,collected:false}); },
    items() { return items.map(item=>({...item})); },
    spawn() {
      obstacles=[];items=[];
      const old=Math.random;Math.random=()=>0.5;
      try { spawnEncounter(0); } finally { Math.random=old; }
      return {obstacles:obstacles.map(ob=>({...ob})),items:items.map(item=>({...item}))};
    },
    hud() {
      const calls=[], old=ctx.fillText;ctx.fillText=(...args)=>calls.push(args[0]);
      try {frame(hostTime);} finally {ctx.fillText=old;}
      return calls;
    }
  }; frame(0);`;
  await page.evaluate(source=>{const frame=document.createElement('iframe');frame.id='coin-test';frame.srcdoc=source;document.body.append(frame);},html.replace('frame(0);',fixture));
  await page.waitForFunction(()=>document.querySelector('#coin-test').contentWindow.motionGame);
  const result=await page.evaluate(()=>{
    const win=document.querySelector('#coin-test').contentWindow,api=win.motionGame,f=win.__coinFixture;
    const tick=(count=1)=>{for(let i=0;i<count;i++)api.advance(1/60)};
    const check=(value,message)=>{if(!value)throw Error(message)};
    for(const motion of [false,true]){
      api.configure({dinoSpeed:260,obstacleGap:1.3,dinoMode:'body'},'day',motion);
      api.practice(false);api.start();f.quiet();
      f.coin();const before=api.snapshot().score;tick();
      check(api.snapshot().coins===1 && api.snapshot().score>=before+20 && api.snapshot().score<before+22,'coin gives 20 points and increments count');
      tick(5);check(api.snapshot().coins===1,'coin collected only once');
      check(f.hud().includes('코인 1'),'HUD shows collected count');
      api.pause();f.coin();const paused=api.snapshot().score;tick(20);
      check(api.snapshot().coins===1&&api.snapshot().score===paused,'paused game cannot collect');
      api.resume();tick();check(api.snapshot().coins===2,'coin collects after resuming');
      f.quiet();f.coin(-50);const beforeMiss=api.snapshot().score;tick();
      check(api.snapshot().coins===2&&api.snapshot().score<beforeMiss+2&&f.items().length===0,'missed coin gives no bonus');
      api.reset();api.start();f.quiet();f.coin(145,130);api.command({type:'jump'});tick(18);
      check(api.snapshot().coins===1,'jump can collect a coin at the higher spawn height');
      api.reset();check(api.snapshot().coins===0&&api.snapshot().score===0,'reset clears count and score');
      api.start();check(api.snapshot().coins===0,'new run starts with no coins');
      f.quiet();api.practice(true);f.coin();tick();check(api.snapshot().coins===0&&f.items().length===0,'practice removes coins');
      api.practice(false);f.quiet();const spawned=f.spawn(),coin=spawned.items.find(it=>it.type==='coin');
      check(coin&&coin.x>=Math.max(...spawned.obstacles.map(ob=>ob.x+ob.width))+160,'coin appears well behind obstacle');
      check(coin.y===235-105||coin.y===235-35,'coin appears at one of two collectable heights');
    }
    return 'PASS: coins spawn safely, award points once, pause and reset correctly in both control modes';
  });
  console.log(result);assert.deepEqual(errors,[]);
} finally {await browser.close();}
