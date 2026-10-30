import { afterEach,beforeEach,describe,it,expect,vi } from 'vitest';
import { defaults } from '../src/core/types';
import { CameraManager } from '../src/motion/camera';
let permission=vi.fn(),video:{muted:boolean;playsInline:boolean;readyState:number;pause:ReturnType<typeof vi.fn>;play:ReturnType<typeof vi.fn>;srcObject:unknown;currentTime?:number;videoWidth?:number;videoHeight?:number};
let workers:FakeWorker[]=[];
type WorkerMessage = { type: string; message?: string };
class FakeWorker { onmessage:((e:{data:WorkerMessage})=>void)|null=null;onerror:(()=>void)|null=null;postMessage=vi.fn();terminate=vi.fn();constructor(){workers.push(this);}send(data:WorkerMessage){this.onmessage?.({data});} }
beforeEach(()=>{workers=[];video={muted:false,playsInline:false,readyState:0,pause:vi.fn(),play:vi.fn().mockResolvedValue(undefined),srcObject:null};vi.stubGlobal('document',{createElement:()=>video,hidden:false});vi.stubGlobal('window',{isSecureContext:true,setTimeout,clearTimeout});vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:permission=vi.fn()}});vi.stubGlobal('location',{origin:'http://localhost:5173'});vi.stubGlobal('Worker',FakeWorker);vi.stubGlobal('requestAnimationFrame',vi.fn(()=>123));vi.stubGlobal('cancelAnimationFrame',vi.fn());});
afterEach(()=>vi.unstubAllGlobals());
function stream(){const track={stop:vi.fn(),onended:null};return{track,value:{getTracks:()=>[track],getVideoTracks:()=>[track]}};}
describe('camera lifecycle and retries',()=>{
  it('pauses inference during keyboard play without closing the camera and resumes with a fresh frame',async()=>{
    const capture=vi.fn().mockResolvedValue({close:vi.fn()}), preview=vi.fn();vi.stubGlobal('createImageBitmap',capture);
    Object.assign(video,{readyState:2,currentTime:0,videoWidth:640,videoHeight:480});
    const m=new CameraManager(defaults),s=stream();m.onFrame=preview;permission.mockResolvedValue(s.value);
    await m.start();workers[0].send({type:'ready'});await Promise.resolve();
    m.setTrackingEnabled(false);video.currentTime=.1;m.loop();workers[0].send({type:'result'});
    expect(capture).toHaveBeenCalledOnce();expect(preview).not.toHaveBeenCalled();expect(m.hasResult).toBe(false);
    expect(s.track.stop).not.toHaveBeenCalled();expect(workers[0].terminate).not.toHaveBeenCalled();
    m.setTrackingEnabled(true);await Promise.resolve();expect(capture).toHaveBeenCalledTimes(2);
    workers[0].send({type:'result'});expect(preview).toHaveBeenCalledOnce();expect(m.hasResult).toBe(true);m.stop();
  });
  it('discards an in-flight result after a rapid pause and resume',async()=>{
    const capture=vi.fn().mockResolvedValue({close:vi.fn()}),preview=vi.fn();vi.stubGlobal('createImageBitmap',capture);
    Object.assign(video,{readyState:2,currentTime:0,videoWidth:640,videoHeight:480});
    const m=new CameraManager(defaults);m.onFrame=preview;permission.mockResolvedValue(stream().value);
    await m.start();workers[0].send({type:'ready'});await Promise.resolve();
    m.setTrackingEnabled(false);m.setTrackingEnabled(true);video.currentTime=.1;workers[0].send({type:'result'});await Promise.resolve();
    expect(preview).not.toHaveBeenCalled();expect(capture).toHaveBeenCalledTimes(2);
    workers[0].send({type:'result'});expect(preview).toHaveBeenCalledOnce();m.stop();
  });
  it('discards a pending bitmap and stale inference errors across suspension',async()=>{
    let resolveBitmap!:(bitmap:{close:ReturnType<typeof vi.fn>})=>void;
    const capture=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{resolveBitmap=resolve;})).mockResolvedValue({close:vi.fn()});vi.stubGlobal('createImageBitmap',capture);
    Object.assign(video,{readyState:2,currentTime:0,videoWidth:640,videoHeight:480});
    const m=new CameraManager(defaults),s=stream();permission.mockResolvedValue(s.value);
    await m.start();workers[0].send({type:'ready'});m.setTrackingEnabled(false);m.setTrackingEnabled(true);
    const bitmap={close:vi.fn()};resolveBitmap(bitmap);await Promise.resolve();await Promise.resolve();
    expect(bitmap.close).toHaveBeenCalledOnce();expect(capture).toHaveBeenCalledTimes(2);
    m.setTrackingEnabled(false);workers[0].send({type:'error'});expect(m.status).toBe('ready');expect(s.track.stop).not.toHaveBeenCalled();m.stop();
  });
  it('distinguishes loaded models from the first inference during GPU warmup',async()=>{
    const m=new CameraManager(defaults);permission.mockResolvedValue(stream().value);await m.start();workers[0].send({type:'ready'});
    expect(m.status).toBe('ready');expect(m.hasResult).toBe(false);workers[0].send({type:'result'});expect(m.hasResult).toBe(true);
    m.setMode('pose');expect(m.hasResult).toBe(false);m.stop();
  });
  it('requests a high-frame-rate camera without requiring that hardware capability',async()=>{
    const m=new CameraManager(defaults),s=stream();permission.mockResolvedValue(s.value);await m.start();
    expect(permission).toHaveBeenCalledWith(expect.objectContaining({video:expect.objectContaining({frameRate:{ideal:60,max:60}})}));m.stop();
  });
  it('uses camera-frame callbacks and cancels them on model switches and stop',async()=>{
    const request=vi.fn(()=>77),cancel=vi.fn();Object.assign(video,{requestVideoFrameCallback:request,cancelVideoFrameCallback:cancel});
    const m=new CameraManager(defaults);permission.mockResolvedValue(stream().value);await m.start();workers[0].send({type:'ready'});
    expect(request).toHaveBeenCalledOnce();expect(requestAnimationFrame).toHaveBeenCalledOnce();
    m.setMode('pose');expect(cancel).toHaveBeenCalledWith(77);workers[1].send({type:'ready'});m.stop();expect(cancel).toHaveBeenCalledTimes(2);
  });
  it('continues recognizing frames if a detached video stops firing presentation callbacks',async()=>{
    let now=0;vi.stubGlobal('performance',{now:()=>now});const capture=vi.fn().mockResolvedValue({close:vi.fn()});vi.stubGlobal('createImageBitmap',capture);
    const request=vi.fn(()=>77);Object.assign(video,{requestVideoFrameCallback:request,cancelVideoFrameCallback:vi.fn(),readyState:2,currentTime:0});
    const m=new CameraManager(defaults);permission.mockResolvedValue(stream().value);await m.start();workers[0].send({type:'ready'});await Promise.resolve();workers[0].send({type:'result'});
    for(let i=1;i<=5;i++){now=i*40;video.currentTime=i*.04;const tick=vi.mocked(requestAnimationFrame).mock.lastCall![0];tick(now);await Promise.resolve();workers[0].send({type:'result'});}
    expect(capture).toHaveBeenCalledTimes(6);expect(request).toHaveBeenCalledOnce();m.stop();
  });
  it('does not queue images during slow inference and keeps source dimensions when resizing',async()=>{
    const bitmap={close:vi.fn()},capture=vi.fn().mockResolvedValue(bitmap);vi.stubGlobal('createImageBitmap',capture);
    Object.assign(video,{readyState:2,currentTime:0,videoWidth:1280,videoHeight:720});
    const m=new CameraManager(defaults);permission.mockResolvedValue(stream().value);await m.start();workers[0].send({type:'ready'});await Promise.resolve();
    expect(capture).toHaveBeenCalledWith(video,{resizeWidth:640,resizeHeight:360,resizeQuality:'low'});
    expect(workers[0].postMessage).toHaveBeenLastCalledWith(expect.objectContaining({type:'frame',width:1280,height:720}),[bitmap]);
    for(let i=1;i<=10;i++){video.currentTime=i/30;m.loop();}
    expect(capture).toHaveBeenCalledOnce();expect(m.busy).toBe(true);m.stop();
  });
  it('captures the newest frame immediately when inference completes between display ticks',async()=>{
    let now=0;vi.stubGlobal('performance',{now:()=>now});
    const bitmap={close:vi.fn()},capture=vi.fn().mockResolvedValue(bitmap);vi.stubGlobal('createImageBitmap',capture);
    Object.assign(video,{readyState:2,currentTime:0,videoWidth:640,videoHeight:480});
    const m=new CameraManager(defaults);permission.mockResolvedValue(stream().value);await m.start();workers[0].send({type:'ready'});await Promise.resolve();
    now=35;video.currentTime=.033;m.captureFrame();expect(capture).toHaveBeenCalledOnce();
    now=50;video.currentTime=.05;workers[0].send({type:'result'});await Promise.resolve();
    expect(capture).toHaveBeenCalledTimes(2);
    expect(workers[0].postMessage).toHaveBeenLastCalledWith(expect.objectContaining({type:'frame',time:50}),[bitmap]);
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    expect(m.lastVideoTime).toBe(.05);expect(m.busy).toBe(true);m.stop();
  });
  it('still honors the frequency limit and rejects duplicate images after immediate completion',async()=>{
    let now=0;vi.stubGlobal('performance',{now:()=>now});
    const capture=vi.fn().mockResolvedValue({close:vi.fn()});vi.stubGlobal('createImageBitmap',capture);
    Object.assign(video,{readyState:2,currentTime:0,videoWidth:640,videoHeight:480});
    const m=new CameraManager(defaults);permission.mockResolvedValue(stream().value);await m.start();workers[0].send({type:'ready'});await Promise.resolve();
    now=10;video.currentTime=.01;workers[0].send({type:'result'});expect(capture).toHaveBeenCalledOnce();
    now=34;video.currentTime=.033;m.captureFrame();await Promise.resolve();workers[0].send({type:'result'});
    now=100;m.captureFrame();expect(capture).toHaveBeenCalledTimes(2);m.stop();
  });
  it('delivers motion directly before preview updates and supports unsubscribe',async()=>{
    const m=new CameraManager(defaults),order:string[]=[];
    const unsubscribe=m.subscribeFrame(()=>order.push('motion'));m.onFrame=()=>order.push('preview');
    permission.mockResolvedValue(stream().value);await m.start();workers[0].send({type:'ready'});workers[0].send({type:'result'});
    expect(order).toEqual(['motion','preview']);unsubscribe();workers[0].send({type:'result'});
    expect(order).toEqual(['motion','preview','preview']);m.stop();
  });
  it.each(['stop','switch'] as const)('does not publish or capture a stale result when a direct listener performs %s',async action=>{
    const capture=vi.fn().mockResolvedValue({close:vi.fn()});vi.stubGlobal('createImageBitmap',capture);
    Object.assign(video,{currentTime:0,videoWidth:640,videoHeight:480});
    const m=new CameraManager(defaults),preview=vi.fn(),laterListener=vi.fn();m.onFrame=preview;
    m.subscribeFrame(()=>action==='stop'?m.stop():m.setMode('pose'));m.subscribeFrame(laterListener);
    permission.mockResolvedValue(stream().value);await m.start();workers[0].send({type:'ready'});
    video.readyState=2;workers[0].send({type:'result'});m.captureFrame();
    expect(preview).not.toHaveBeenCalled();expect(laterListener).not.toHaveBeenCalled();expect(capture).not.toHaveBeenCalled();
    expect(m.status).toBe(action==='stop'?'off':'loading');m.stop();
  });
  it.each([20,30])('avoids frame-rate rounding losses at %i Hz with a 30 Hz camera',async frequency=>{
    let now=0;vi.stubGlobal('performance',{now:()=>now});const capture=vi.fn().mockResolvedValue({close:vi.fn()});vi.stubGlobal('createImageBitmap',capture);
    Object.assign(video,{readyState:2,currentTime:0,videoWidth:640,videoHeight:480});
    const m=new CameraManager({...defaults,frequency});permission.mockResolvedValue(stream().value);await m.start();workers[0].send({type:'ready'});await Promise.resolve();workers[0].send({type:'result'});
    for(let i=1;i<=30;i++){now=i*1000/30;video.currentTime=i/30;m.loop();await Promise.resolve();workers[0].send({type:'result'});}
    expect(capture.mock.calls.length).toBeGreaterThanOrEqual(frequency);expect(capture.mock.calls.length).toBeLessThanOrEqual(frequency+1);m.stop();
  });
  it('handles permission denial and retries with exactly one stream',async()=>{const m=new CameraManager(defaults),s=stream();permission.mockRejectedValueOnce(new DOMException('denied','NotAllowedError')).mockResolvedValueOnce(s.value);await m.start();expect(m.status).toBe('error');expect(m.message).toContain('권한');await m.start();expect(m.status).toBe('loading');workers[0].send({type:'ready'});expect(m.status).toBe('ready');m.stop();expect(s.track.stop).toHaveBeenCalledOnce();expect(workers[0].terminate).toHaveBeenCalledOnce();});
  it('releases a late stream if the request was cancelled',async()=>{const m=new CameraManager(defaults),s=stream();let resolve!:(v:unknown)=>void;permission.mockReturnValue(new Promise(r=>resolve=r));const pending=m.start();m.stop();resolve(s.value);await pending;expect(s.track.stop).toHaveBeenCalledOnce();expect(m.stream).toBe(null);expect(m.status).toBe('off');});
  it('terminates the previous worker on mode switch without opening another camera',async()=>{const m=new CameraManager(defaults),s=stream();permission.mockResolvedValue(s.value);await m.start();workers[0].send({type:'ready'});m.setMode('pose');expect(workers[0].terminate).toHaveBeenCalledOnce();expect(permission).toHaveBeenCalledOnce();expect(workers[1].postMessage).toHaveBeenCalledWith(expect.objectContaining({type:'init',mode:'pose'}));m.stop();});
  it('combines tetris hand/head inference in one worker without reopening the stream',async()=>{const m=new CameraManager(defaults),s=stream();permission.mockResolvedValue(s.value);await m.start();workers[0].send({type:'ready'});m.setMode('tetris');expect(workers[0].terminate).toHaveBeenCalledOnce();expect(workers[1].postMessage).toHaveBeenCalledWith(expect.objectContaining({type:'init',mode:'tetris'}));expect(permission).toHaveBeenCalledOnce();m.stop();});
  it('stops all resources after model failure and supports a clean retry',async()=>{const m=new CameraManager(defaults),s=stream();permission.mockResolvedValue(s.value);await m.start();workers[0].send({type:'error',message:'missing model'});expect(m.status).toBe('error');expect(s.track.stop).toHaveBeenCalledOnce();expect(m.worker).toBe(null);await m.start();workers[1].send({type:'ready'});expect(m.status).toBe('ready');m.stop();});
  it('ignores a delayed error from a worker replaced during a mode switch', async () => {
    const manager = new CameraManager(defaults), cameraStream = stream();
    permission.mockResolvedValue(cameraStream.value);
    await manager.start();
    const previous = workers[0];
    manager.setMode('pose');
    previous.onerror?.();
    expect(manager.status).toBe('loading');
    expect(manager.worker).toBe(workers[1]);
    expect(cameraStream.track.stop).not.toHaveBeenCalled();
    manager.stop();
  });
  it('ignores a rejected bitmap request from a previous camera session', async () => {
    const manager = new CameraManager(defaults), cameraStream = stream();
    permission.mockResolvedValue(cameraStream.value);
    let rejectBitmap!: (error: Error) => void;
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise((_resolve, reject) => { rejectBitmap = reject; })));
    video.readyState = 2;
    await manager.start();
    workers[0].send({ type: 'ready' });
    manager.setMode('pose');
    rejectBitmap(new Error('old frame'));
    await Promise.resolve();
    await Promise.resolve();
    expect(manager.status).toBe('loading');
    expect(manager.worker).toBe(workers[1]);
    expect(cameraStream.track.stop).not.toHaveBeenCalled();
    manager.stop();
  });
  it('closes a bitmap that resolves after its camera worker was replaced',async()=>{
    let resolveBitmap!:(bitmap:unknown)=>void;
    vi.stubGlobal('createImageBitmap',vi.fn(()=>new Promise(resolve=>{resolveBitmap=resolve;})));
    Object.assign(video,{readyState:2,currentTime:0});
    const m=new CameraManager(defaults);permission.mockResolvedValue(stream().value);await m.start();workers[0].send({type:'ready'});
    const previous=workers[0],bitmap={close:vi.fn()};m.setMode('pose');resolveBitmap(bitmap);await Promise.resolve();
    expect(bitmap.close).toHaveBeenCalledOnce();expect(previous.postMessage).toHaveBeenCalledOnce();expect(workers[1].postMessage).toHaveBeenCalledOnce();m.stop();
  });
});
