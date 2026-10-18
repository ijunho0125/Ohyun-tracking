import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const diagnose=process.argv.includes('--diagnose');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto('http://127.0.0.1:5173/');
  const result=await page.evaluate(async()=>{
    const {FilesetResolver,HandLandmarker}=await import('/node_modules/@mediapipe/tasks-vision/vision_bundle.mjs');
    const {inspectHand}=await import('/src/motion/hands.ts');
    const image=new Image();image.src='/tests/fixtures/mediapipe-right-hands.jpg';await image.decode();
    const canvas=document.createElement('canvas');canvas.width=960;canvas.height=640;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,960,640);ctx.drawImage(image,120,129);
    const model=await HandLandmarker.createFromOptions(await FilesetResolver.forVisionTasks('/vision'),{baseOptions:{modelAssetPath:'/models/hand_landmarker.task',delegate:'CPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.6,minTrackingConfidence:.6});
    const raw=model.detectForVideo(canvas,performance.now());
    const rawHands=raw.landmarks.map((points,i)=>({points,side:raw.handedness[i][0].categoryName,confidence:raw.handedness[i][0].score}));
    const rawSummary=rawHands.map(hand=>({side:hand.side,score:hand.confidence,visibilityValues:[...new Set(hand.points.map(p=>p.visibility))],shape:inspectHand(hand,1.5).shape}));model.close();
    const worker=new Worker('/vision.worker.js');
    const message=types=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Worker timeout')),45000);const handler=({data})=>{if(types.includes(data.type)){clearTimeout(timer);worker.removeEventListener('message',handler);if(data.type==='error')reject(new Error(data.message));else resolve(data);}};worker.addEventListener('message',handler);});
    let waiting=message(['ready','error']);worker.postMessage({type:'init',mode:'hand',base:location.origin+'/'});await waiting;
    const bitmap=await createImageBitmap(canvas);waiting=message(['result','error']);worker.postMessage({type:'frame',bitmap,time:performance.now()},[bitmap]);const frame=await waiting;worker.terminate();
    return {rawSummary,workerSummary:frame.hands.map(hand=>({side:hand.side,score:hand.confidence,shape:inspectHand(hand,frame.width/frame.height).shape,hasVisibility:hand.points.some(p=>'visibility' in p)}))};
  });
  console.log(JSON.stringify(result,null,2));
  if(diagnose){await writeFile(new URL('../docs/right-hand-before.json',import.meta.url),JSON.stringify(result,null,2));await browser.close();process.exit(0);}
  assert(result.rawSummary.some(h=>h.side==='Right'&&h.visibilityValues.includes(0)),'official fixture must reproduce MediaPipe zero visibility');
  assert(result.rawSummary.some(h=>h.side==='Right'&&h.shape==='open'),'raw model right hand reaches gesture code');
  assert(result.workerSummary.some(h=>h.side==='Right'&&h.shape==='open'&&!h.hasVisibility),'worker normalizes hand landmarks separately from pose');
  console.log('PASS: real MediaPipe detects right hands with visibility=0; raw and worker results remain usable');
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(()=>{
    navigator.mediaDevices.getUserMedia=async()=>{
      const image=new Image();image.src='/tests/fixtures/mediapipe-right-hands.jpg';await image.decode();
      const canvas=document.createElement('canvas');canvas.width=760;canvas.height=600;const ctx=canvas.getContext('2d');
      const draw=()=>{ctx.fillStyle='#fff';ctx.fillRect(0,0,760,600);ctx.drawImage(image,345,0,375,382,190,110,375,382);};draw();setInterval(draw,40);return canvas.captureStream(25);
    };
  });
  const app=await context.newPage(),errors=[];app.on('pageerror',e=>errors.push(e.message));
  await app.goto('http://127.0.0.1:5173/');await app.locator('.camera-connect-action').click();await app.getByRole('button',{name:'카메라 허용하고 시작',exact:true}).click();await app.locator('.hand-cursor').waitFor({timeout:45000});
  await app.getByText('감지된 손: 오른손 · 조작 손: 오른손',{exact:true}).waitFor();
  assert(await app.locator('.camera-screen canvas').first().evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0)),'right-hand overlay has visible pixels');
  await app.locator('.camera-panel').first().scrollIntoViewIfNeeded();
  await app.waitForFunction(()=>{const video=document.querySelector('.camera-screen video');return video.readyState>=2&&!video.paused;});
  await app.waitForTimeout(250);
  const preview=await app.locator('.camera-screen video').first().evaluate(video=>({width:video.videoWidth,height:video.videoHeight,paused:video.paused,readyState:video.readyState}));
  await app.screenshot({path:fileURLToPath(new URL('../docs/screenshots/pc-right-hand-real-model.png',import.meta.url))});
  assert.deepEqual(errors,[]);result.app={cursorVisible:true,rightHandReported:true,overlayDrawn:true,preview,errors};
  await writeFile(new URL('../docs/right-hand-check-results.json',import.meta.url),JSON.stringify(result,null,2));
  console.log('PASS: actual app camera pipeline, real worker/model, right-hand cursor, overlay and detected-hand status');
}finally{await browser.close();}
