import { afterEach,beforeEach,describe,it,expect,vi } from 'vitest';
import { defaults } from '../src/core/types';
import { CameraManager } from '../src/motion/camera';
let permission=vi.fn(),video:{muted:boolean;playsInline:boolean;readyState:number;pause:ReturnType<typeof vi.fn>;play:ReturnType<typeof vi.fn>;srcObject:unknown};
let workers:FakeWorker[]=[];
type WorkerMessage = { type: string; message?: string };
class FakeWorker { onmessage:((e:{data:WorkerMessage})=>void)|null=null;onerror:(()=>void)|null=null;postMessage=vi.fn();terminate=vi.fn();constructor(){workers.push(this);}send(data:WorkerMessage){this.onmessage?.({data});} }
beforeEach(()=>{workers=[];video={muted:false,playsInline:false,readyState:0,pause:vi.fn(),play:vi.fn().mockResolvedValue(undefined),srcObject:null};vi.stubGlobal('document',{createElement:()=>video,hidden:false});vi.stubGlobal('window',{isSecureContext:true,setTimeout,clearTimeout});vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:permission=vi.fn()}});vi.stubGlobal('location',{origin:'http://localhost:5173'});vi.stubGlobal('Worker',FakeWorker);vi.stubGlobal('requestAnimationFrame',vi.fn(()=>123));vi.stubGlobal('cancelAnimationFrame',vi.fn());});
afterEach(()=>vi.unstubAllGlobals());
function stream(){const track={stop:vi.fn(),onended:null};return{track,value:{getTracks:()=>[track],getVideoTracks:()=>[track]}};}
describe('camera lifecycle and retries',()=>{
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
});
