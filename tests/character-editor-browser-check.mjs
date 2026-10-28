import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Run against a test server with its own CHARACTER_DATA_DIR: this check writes
// characters and temporarily changes the selected character.
const base=process.env.TEST_URL;
if(!base) throw new Error('Set TEST_URL to a test server using an isolated CHARACTER_DATA_DIR.');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage();
const savedIds=[];
let initial;
try {
  initial=await (await page.request.get(base+'/api/characters')).json();
  await page.goto(base);
  await page.getByRole('navigation',{name:'주요 메뉴'}).getByRole('button',{name:'내 그림',exact:true}).click();
  const filename='a'.repeat(50)+'.png';
  await page.locator('input[type=file]').setInputFiles({name:filename,mimeType:'image/png',buffer:await readFile(new URL('./fixtures/character.png',import.meta.url))});
  await page.getByText('그림을 불러왔어요. 발 기준점을 맞춰보세요.',{exact:true}).waitFor();
  assert.equal((await page.getByLabel('캐릭터 이름',{exact:true}).inputValue()).length,40,'uploaded filename must respect the server name limit');
  const response=page.waitForResponse(r=>r.url().endsWith('/api/characters') && r.request().method()==='POST');
  await page.getByRole('button',{name:'이미지 저장',exact:true}).click();
  const result=await response;
  assert.equal(result.status(),201);
  savedIds.push((await result.json()).id);
  await page.getByText('사이트에 저장하고 연결된 병아리 질주 게임에 적용했어요.',{exact:true}).waitFor();
  console.log('PASS: a long uploaded filename is shortened and the character saves');
  await page.goto(base+'/draw');
  let selections=0;
  await page.route('**/api/characters/active',route=>{selections++;return route.fulfill({status:503});});
  const canvas=page.locator('canvas');
  const rect=await canvas.boundingBox();
  assert(rect);
  await page.mouse.move(rect.x+rect.width/3,rect.y+rect.height/3);
  await page.mouse.down();
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
  await page.mouse.up();
  const drawingResponse=page.waitForResponse(r=>r.url().endsWith('/api/characters') && r.request().method()==='POST');
  await page.getByRole('button',{name:'이미지 저장',exact:true}).click();
  const drawingResult=await drawingResponse;
  assert.equal(drawingResult.status(),201);
  const drawing=await drawingResult.json();savedIds.push(drawing.id);
  await page.getByText('저장 완료! 병아리 질주 게임에 바로 적용됐어요. 게임 시작 버튼을 눌러주세요.',{exact:true}).waitFor();
  assert.equal(selections,0,'saving a drawing must not send a second selection request');
  assert.equal((await (await page.request.get(base+'/api/characters')).json()).selectedId,drawing.id);
  console.log('PASS: a drawing saves and becomes active without a redundant selection request');
} finally {
  for(const id of savedIds) await page.request.delete(base+'/api/characters/'+id);
  if(initial) await page.request.post(base+'/api/characters/active',{data:{id:initial.selectedId}});
  await browser.close();
}
