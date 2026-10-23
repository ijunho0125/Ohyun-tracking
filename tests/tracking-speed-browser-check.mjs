import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';

const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:5173');
  const result=await page.evaluate(async()=>{
    const {CameraManager}=await import('/src/motion/camera.ts');
    const {defaults}=await import('/src/core/types.ts');
    const image=new Image();image.src='/tests/fixtures/mediapipe-right-hands.jpg';await image.decode();
    const canvas=document.createElement('canvas');canvas.width=760;canvas.height=600;
    const ctx=canvas.getContext('2d');
    const draw=()=>{ctx.fillStyle='#fff';ctx.fillRect(0,0,760,600);ctx.drawImage(image,345,0,375,382,190,110,375,382);};draw();
    const paint=setInterval(draw,1000/60),stream=canvas.captureStream(60);
    const getUserMedia=navigator.mediaDevices.getUserMedia;
    navigator.mediaDevices.getUserMedia=async()=>stream;
    const camera=new CameraManager(defaults);
    try {
      await new Promise(async(resolve,reject)=>{
        const deadline=setTimeout(()=>reject(new Error('model initialization timeout')),45000);
        camera.onStatus=()=>{
          if(camera.status==='ready'){clearTimeout(deadline);resolve();}
          if(camera.status==='error'){clearTimeout(deadline);reject(new Error(camera.message));}
        };
        await camera.start();
      });
      // GPU delegates compile kernels on the first frames; measure steady
      // tracking after real results arrive, not model startup time.
      await new Promise((resolve,reject)=>{
        let count=0;const deadline=setTimeout(()=>reject(new Error(`warmup timeout: ${camera.status}, ${camera.message}`)),20000);
        camera.onFrame=()=>{if(++count>=8){clearTimeout(deadline);resolve();}};
        camera.onStatus=()=>{if(camera.status==='error'){clearTimeout(deadline);reject(new Error(camera.message));}};
      });
      const samples=[];
      for(const frequency of [20,30]) {
        camera.settings={...defaults,frequency};camera.nextFrameTime=0;
        await new Promise(resolve=>setTimeout(resolve,500));
        const frames=[],started=performance.now();
        camera.onFrame=frame=>frames.push({latency:performance.now()-frame.time,inference:frame.inferenceMs,hands:frame.hands.length,width:frame.width,height:frame.height,delegate:frame.delegate});
        await new Promise(resolve=>setTimeout(resolve,3000));
        camera.onFrame=()=>{};
        const elapsed=performance.now()-started;
        const percentile=(key,p)=>{const sorted=frames.map(f=>f[key]).sort((a,b)=>a-b);return sorted[Math.floor((sorted.length-1)*p)]??null;};
        samples.push({requestedHz:frequency,frames:frames.length,observedHz:frames.length*1000/elapsed,latencyP50Ms:percentile('latency',.5),latencyP95Ms:percentile('latency',.95),inferenceP50Ms:percentile('inference',.5),detectedFrames:frames.filter(f=>f.hands>0).length,sourceDimensions:frames[0]&&[frames[0].width,frames[0].height],delegate:frames[0]?.delegate,status:camera.status,message:camera.message,busy:camera.busy,video:{paused:camera.video.paused,time:camera.video.currentTime,state:camera.video.readyState},hidden:document.hidden});
      }
      return {samples,cameraFrameCallbacks:typeof camera.video.requestVideoFrameCallback==='function',note:'Real model and worker; an animated canvas displaying a still hand photo replaces the physical camera. These measurements are local, not human webcam accuracy or guaranteed device performance.'};
    } finally {camera.stop();clearInterval(paint);navigator.mediaDevices.getUserMedia=getUserMedia;}
  });
  for(const sample of result.samples) {
    assert(sample.frames>=3,JSON.stringify(sample));assert(sample.detectedFrames>0,JSON.stringify(sample));
    assert.deepEqual(sample.sourceDimensions,[760,600]);assert(Number.isFinite(sample.latencyP95Ms));
  }
  assert.deepEqual(errors,[]);
  await writeFile(new URL('../docs/tracking-speed-results.json',import.meta.url),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
  console.log('PASS: real worker/model cadence and latency, source-coordinate preservation after resized inference');
} finally {await browser.close();}
