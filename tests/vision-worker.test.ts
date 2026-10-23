import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const factory=vi.hoisted(()=>({files:vi.fn(),hand:vi.fn(),pose:vi.fn()}));
vi.mock('@mediapipe/tasks-vision',()=>({FilesetResolver:{forVisionTasks:factory.files},HandLandmarker:{createFromOptions:factory.hand},PoseLandmarker:{createFromOptions:factory.pose}}));
type WorkerScope={postMessage:ReturnType<typeof vi.fn>;onmessage:(event:{data:Record<string,unknown>})=>Promise<void>};
let scope:WorkerScope;
const model=()=>({close:vi.fn(),detectForVideo:vi.fn(()=>({landmarks:[],handedness:[]}))});
beforeEach(()=>{
  vi.resetModules();vi.clearAllMocks();factory.files.mockResolvedValue({});factory.hand.mockImplementation(async()=>model());factory.pose.mockImplementation(async()=>model());
  scope={postMessage:vi.fn(),onmessage:async()=>{}};vi.stubGlobal('self',scope);vi.stubGlobal('OffscreenCanvas',undefined);
});
afterEach(()=>vi.unstubAllGlobals());
function renderer(name:string) {
  vi.stubGlobal('OffscreenCanvas',class {
    getContext(){return {RENDERER:1,getParameter:()=>name,getExtension:(key:string)=>key==='WEBGL_debug_renderer_info'?{UNMASKED_RENDERER_WEBGL:2}:{loseContext:vi.fn()}};}
  });
}
async function init(){await import('../src/motion/vision.worker');await scope.onmessage({data:{type:'init',mode:'tetris',base:'/'}});}
describe('vision hardware acceleration and recovery',()=>{
  it('keeps CPU inference available without OffscreenCanvas or with software WebGL',async()=>{
    renderer('ANGLE SwiftShader');await init();
    expect(factory.hand).toHaveBeenLastCalledWith({},expect.objectContaining({baseOptions:expect.objectContaining({delegate:'CPU'})}));
    expect(scope.postMessage).toHaveBeenLastCalledWith({type:'ready',delegate:'CPU'});
  });
  it('tries hardware GPU and recovers on CPU when initialization fails',async()=>{
    renderer('ANGLE Intel');factory.hand.mockRejectedValueOnce(new Error('GPU unavailable'));await init();
    expect(factory.hand).toHaveBeenNthCalledWith(1,{},expect.objectContaining({baseOptions:expect.objectContaining({delegate:'GPU'}),canvas:expect.anything()}));
    expect(scope.postMessage).toHaveBeenLastCalledWith({type:'ready',delegate:'CPU'});
  });
  it('retries a failed GPU frame on CPU, preserving coordinates and closing the transferred image',async()=>{
    renderer('ANGLE Intel');const gpu=model(),cpu=model();gpu.detectForVideo.mockImplementation(()=>{throw new Error('context lost');});
    factory.hand.mockResolvedValueOnce(gpu).mockResolvedValueOnce(cpu);await init();
    expect(scope.postMessage).toHaveBeenLastCalledWith({type:'ready',delegate:'GPU'});
    const bitmap={width:640,height:360,close:vi.fn()};
    await scope.onmessage({data:{type:'frame',bitmap,time:100,width:1280,height:720}});
    expect(gpu.close).toHaveBeenCalledOnce();expect(cpu.detectForVideo).toHaveBeenCalledWith(bitmap,100);expect(bitmap.close).toHaveBeenCalledOnce();
    expect(scope.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({type:'result',delegate:'CPU',width:1280,height:720}));
  });
  it('reports a CPU inference error while releasing the frame',async()=>{
    const cpu=model();cpu.detectForVideo.mockImplementation(()=>{throw new Error('CPU failure');});factory.hand.mockResolvedValue(cpu);await init();
    const bitmap={width:640,height:480,close:vi.fn()};await scope.onmessage({data:{type:'frame',bitmap,time:100}});
    expect(scope.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({type:'error'}));expect(bitmap.close).toHaveBeenCalledOnce();
  });
});
