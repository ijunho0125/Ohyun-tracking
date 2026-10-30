import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({channel:'chrome', headless:true});
const page = await browser.newPage({viewport:{width:1024,height:768},hasTouch:true});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
try {
  await page.goto('http://127.0.0.1:5173/draw');
  const canvas=page.locator('canvas');
  const button=name=>page.getByRole('button',{name,exact:true});
  const pixels=()=>canvas.evaluate(c=>{const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let hash=2166136261,count=0;for(let i=0;i<p.length;i++){hash=Math.imul(hash^p[i],16777619);if(i%4===3&&p[i]>0)count++;}return {hash,count};});
  const count=async()=>(await pixels()).count;
  const at=async(x,y)=>canvas.evaluate((c,[x,y])=>Array.from(c.getContext('2d').getImageData(x,y,1,1).data),[x,y]);
  const drag=async(x1,y1,x2,y2)=>{const r=await canvas.boundingBox(); await page.mouse.move(r.x+r.width*x1,r.y+r.height*y1); await page.mouse.down(); await page.mouse.move(r.x+r.width*x2,r.y+r.height*y2,{steps:8}); await page.mouse.up();};
  await drag(.2,.2,.4,.2);
  const pen=await pixels(); assert((await count())>0,'pen draws');
  await button('실행 취소').click(); assert.equal(await count(),0,'undo clears stroke');
  await button('다시 실행').click(); assert.deepEqual(await pixels(),pen,'redo restores stroke');
  await button('지우개').click(); await drag(.25,.2,.35,.2); assert((await count())<pen.count,'eraser removes ink');
  await button('실행 취소').click(); assert.deepEqual(await pixels(),pen,'undo restores erased ink');
  for(const tool of ['직선','사각형','원']){
    await button(tool).click(); await drag(.5,.4,.75,.7); const changed=await pixels(); assert.notDeepEqual(changed,pen,tool+' draws');
    await button('실행 취소').click(); assert.deepEqual(await pixels(),pen,tool+' undo restores');
  }
  await button('채우기').click(); const r=await canvas.boundingBox(); await page.mouse.click(r.x+r.width*.9,r.y+r.height*.9); assert((await at(700,700))[3]>0,'fill colors transparent area');
  await button('실행 취소').click(); assert.deepEqual(await pixels(),pen,'fill undo restores');
  await button('모두 지우기').click(); assert.equal(await count(),0,'clear removes drawing');
  await button('실행 취소').click(); assert.deepEqual(await pixels(),pen,'clear is undoable');
  await page.screenshot({path:'test-results/drawing-tools-desktop.png',fullPage:true});
  for(const [width,height] of [[768,1024],[390,844]]){await page.setViewportSize({width,height}); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width,'no horizontal overflow'); const r=await canvas.boundingBox(); assert(r.width>200&&Math.abs(r.width-r.height)<1,'usable square canvas'); await page.screenshot({path:`test-results/drawing-tools-${width}.png`,fullPage:true});}
  assert.deepEqual(errors,[]);
  console.log('PASS: pen, eraser, line, rectangle, ellipse, fill, undo, redo, clear, responsive canvas, no runtime errors');
} finally {await browser.close();}
