import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base=process.env.TEST_URL || 'http://127.0.0.1:5173';
const browser=await chromium.launch({channel:'chrome',headless:true});
const tablet=await browser.newContext({viewport:{width:1024,height:768},hasTouch:true});
const desktop=await browser.newContext({viewport:{width:1280,height:720}});
const pad=await tablet.newPage(),game=await desktop.newPage(),errors=[],downloads=[],savedIds=[];
pad.setDefaultTimeout(10000);game.setDefaultTimeout(10000);
for(const page of [pad,game]){page.on('pageerror',error=>errors.push(error.message));page.on('download',download=>downloads.push(download.suggestedFilename()));}
const button=(page,name)=>page.getByRole('button',{name,exact:true});
const state=()=>game.locator('iframe.source-game').evaluate(frame=>frame.contentWindow.motionGame.snapshot());
const current=name=>game.getByRole('button',{name:new RegExp(`현재 캐릭터: ${name}`)});
const renderedColor=rgb=>game.waitForFunction(expected=>{
  const frame=document.querySelector('iframe.source-game'),api=frame?.contentWindow.motionGame;if(!api?.drawCharacter)return false;
  const canvas=frame.contentDocument.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d');
  if(!api.drawCharacter(ctx,{x:20,y:20,width:44,height:44,state:'run',vy:0},0))return false;
  const pixels=ctx.getImageData(0,0,128,128).data;
  for(let i=0;i<pixels.length;i+=4)if(pixels[i]===expected[0]&&pixels[i+1]===expected[1]&&pixels[i+2]===expected[2]&&pixels[i+3]>100)return true;
  return false;
},rgb);
const initial=await (await desktop.request.get(base+'/api/characters')).json();
const suffix=Date.now().toString(36);
const pass=name=>console.log('PASS: '+name);
async function touchDrawing(){
  const rect=await pad.locator('canvas').boundingBox();assert(rect && rect.width>200 && Math.abs(rect.width-rect.height)<1,'square, usable drawing surface');
  const cdp=await tablet.newCDPSession(pad);
  const point=(x,y)=>({x:rect.x+rect.width*x,y:rect.y+rect.height*y,radiusX:2,radiusY:2,force:1,id:1});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(.25,.7)]});
  assert.equal(await button(pad,'이미지 저장').isEnabled(),false,'do not save mid-stroke');
  for(const [x,y] of [[.3,.3],[.5,.25],[.65,.4],[.55,.7],[.25,.7]])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(x,y)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
}
async function save(name){
  await pad.getByLabel('캐릭터 이름',{exact:true}).fill(name);
  const response=pad.waitForResponse(response=>response.url().endsWith('/api/characters') && response.request().method()==='POST');
  await button(pad,'이미지 저장').click();
  const result=await response;assert.equal(result.status(),201);const info=await result.json();savedIds.push(info.id);
  await pad.getByText('저장 완료! 병아리 질주 게임에 바로 적용됐어요. 게임 시작 버튼을 눌러주세요.',{exact:true}).waitFor();
  await current(name).waitFor({timeout:6000});
  assert.equal((await state()).state,'idle','saving must not start the game');
  return info;
}
try{
  await game.goto(base);await game.locator('.game-card.dino').click();await button(game,'조작 준비하기').waitFor();
  await pad.goto(base+'/draw');await pad.getByRole('heading',{name:'내 그림으로 병아리 질주 게임'}).waitFor();
  await button(pad,'이미지 저장').click();await pad.getByText('빈 종이예요. 캐릭터를 먼저 그려주세요.',{exact:true}).waitFor();
  pass('tablet drawing page opens directly; blank drawing cannot replace the game character');
  await touchDrawing();
  const first=await save('첫 그림 '+suffix);
  const image=await game.evaluate(async id=>{
    const blob=await(await fetch(`/api/characters/${id}/processed`)).blob(),image=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,image.width,image.height).data;
    return {width:image.width,height:image.height,transparent:pixels[3]===0,ink:pixels.some((value,index)=>index%4===3 && value>0)};
  },first.id);
  assert(image.transparent && image.ink && image.width<768 && image.height<768);assert.deepEqual(downloads,[]);
  await renderedColor([128,0,32]);
  pass('real touch drawing is saved on the server as a cropped transparent PNG; a separate browser receives and renders it without an apply click or automatic start');
  await button(pad,'모두 지우기').click();await button(pad,'이미지 저장').click();await pad.getByText('빈 종이예요. 캐릭터를 먼저 그려주세요.',{exact:true}).waitFor();
  assert(await current(first.name).isVisible());
  await pad.getByLabel('펜 색상').fill('#2277dd');await touchDrawing();
  await desktop.setOffline(true);
  const secondName='두 번째 '+suffix;
  await pad.getByLabel('캐릭터 이름',{exact:true}).fill(secondName);
  const secondResponse=pad.waitForResponse(response=>response.url().endsWith('/api/characters')&&response.request().method()==='POST');
  await button(pad,'이미지 저장').click();const second=await(await secondResponse).json();savedIds.push(second.id);
  await desktop.setOffline(false);await current(secondName).waitFor({timeout:10000});await renderedColor([34,119,221]);assert.equal((await state()).state,'idle');
  pass('clearing a drawing preserves the last saved character; the game reconnects and receives the latest save after a connection loss');
  await game.reload();await game.locator('.game-card.dino').click();await button(game,'조작 준비하기').waitFor();await current(secondName).waitFor();assert.equal((await state()).state,'idle');
  pass('a fresh game page restores the shared selection from the server');
  await pad.route('**/api/characters',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'테스트: 서버 연결을 확인해주세요.'})}));
  await button(pad,'이미지 저장').click();await pad.getByText('테스트: 서버 연결을 확인해주세요.',{exact:true}).waitFor();assert(await current(secondName).isVisible());
  await pad.unroute('**/api/characters');
  assert(await pad.locator('canvas').evaluate(canvas=>canvas.getContext('2d').getImageData(0,0,768,768).data.some((value,index)=>index%4===3&&value>0)));
  pass('failed saves show an error, retain the drawing for retry, and leave the current game character intact');
  await button(game,'조작 준비하기').click();assert.equal((await state()).state,'running');
  pass('the existing game button still starts play explicitly');
  await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
  await pad.screenshot({path:fileURLToPath(new URL('../test-results/drawing-tablet.png',import.meta.url))});
  for(const [width,height] of [[768,1024],[390,844]]){
    await pad.setViewportSize({width,height});
    assert.equal(await pad.evaluate(()=>document.documentElement.scrollWidth),width);
    const rect=await pad.locator('canvas').boundingBox();assert(Math.abs(rect.width-rect.height)<1 && rect.width>200,'drawing surface stays square and usable');
    await button(pad,'이미지 저장').scrollIntoViewIfNeeded();assert(await button(pad,'이미지 저장').isVisible());
    await pad.screenshot({path:fileURLToPath(new URL(`../test-results/drawing-${width}.png`,import.meta.url))});
  }
  assert.deepEqual(downloads,[]);assert.deepEqual(errors,[]);
  pass('tablet portrait and phone widths have no horizontal overflow; saving never triggers a file download; no browser runtime errors');
}catch(error){
  await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
  await Promise.allSettled([pad.screenshot({path:fileURLToPath(new URL('../test-results/drawing-failure.png',import.meta.url)),timeout:5000}),game.screenshot({path:fileURLToPath(new URL('../test-results/drawing-game-failure.png',import.meta.url)),timeout:5000})]);
  throw error;
}finally{
  for(const id of savedIds)await desktop.request.delete(base+'/api/characters/'+id,{timeout:5000});
  await desktop.request.post(base+'/api/characters/active',{data:{id:initial.selectedId},timeout:5000});
  await browser.close();
}
