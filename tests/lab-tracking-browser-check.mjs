import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { fixtureHand } from './hand-fixtures.ts';
import { fixtureBody } from './pose-fixtures.ts';

const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.addInitScript(()=>{
  window.__fixture={hands:[],pose:[]};window.__mode='';window.__streams=0;
  navigator.mediaDevices.getUserMedia=async()=>{
    window.__streams++;
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
    const ctx=canvas.getContext('2d');let n=0;
    setInterval(()=>{ctx.fillStyle=n++%2?'#111':'#222';ctx.fillRect(0,0,640,480);},35);
    return canvas.captureStream(25);
  };
  window.Worker=class {
    onmessage=null;onerror=null;dead=false;mode='hand';
    postMessage(data){
      if(data.type==='init'){this.mode=data.mode;window.__mode=data.mode;setTimeout(()=>{if(!this.dead)this.onmessage?.({data:{type:'ready'}});},0);}
      if(data.type==='frame'){
        data.bitmap.close();const result={type:'result',time:data.time,width:data.width,height:data.height,inferenceMs:2,hands:this.mode==='hand'?structuredClone(window.__fixture.hands):[],pose:this.mode==='pose'?structuredClone(window.__fixture.pose):[]};
        setTimeout(()=>{if(!this.dead)this.onmessage?.({data:result});},5);
      }
    }
    terminate(){this.dead=true;}
  };
});
const page=await context.newPage();
try {
  await page.goto(process.env.LAB_TEST_URL??'http://127.0.0.1:5173/');
  await page.locator('.camera-connect-action').click();
  await page.getByRole('button',{name:'카메라 허용하고 시작',exact:true}).click();
  await page.getByText('카메라 연결됨',{exact:true}).waitFor();
  await page.getByRole('navigation').getByRole('button',{name:'기술 체험관'}).click();
  await page.evaluate(pose=>{window.__fixture.pose=pose;},fixtureBody());
  await page.getByRole('button',{name:'몸',exact:true}).click();
  await page.waitForFunction(()=>window.__mode==='pose');
  await page.getByRole('button',{name:'중립 자세 보정'}).click();
  await page.waitForFunction(()=>{const p=document.querySelector('.experiment progress');return p&&p.value>0&&p.value<1;});
  await page.getByRole('button',{name:'그림 움직임'}).click();
  await page.waitForFunction(()=>window.__mode==='hand');
  await page.evaluate(hand=>{window.__fixture.hands=[hand];},fixtureHand('Right'));
  await page.locator('.hand-cursor').waitFor();
  assert.equal(await page.locator('.lab-grid .camera-panel').count(),0);
  await page.getByRole('button',{name:'모션 추적'}).click();
  await page.waitForFunction(()=>window.__mode==='pose');
  assert.equal(await page.locator('.experiment progress').evaluate(p=>p.value),0);
  await page.waitForTimeout(250);
  assert.equal(await page.locator('.experiment progress').evaluate(p=>p.value),0);
  assert.equal(await page.evaluate(()=>window.__streams),1);
  console.log('PASS: drawing tab switches body inference to hand menu controls; returning restores body mode and resets interrupted calibration');
} finally { await browser.close(); }
