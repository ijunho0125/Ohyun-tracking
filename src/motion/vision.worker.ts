import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import { normalizeHandLandmarks } from './landmarks';
import type { MotionMode } from '../core/types';
let hand: HandLandmarker | null = null;
let pose: PoseLandmarker | null = null;
let mode: MotionMode = 'hand';
let generation = 0;
let delegate: 'CPU' | 'GPU' = 'CPU';
let files: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
let base = '';
const scope = self as unknown as DedicatedWorkerGlobalScope;
function hardwareGPU() {
  if (typeof OffscreenCanvas === 'undefined') return false;
  try {
    const gl = new OffscreenCanvas(1,1).getContext('webgl2');
    if(!gl)return false;
    const info=gl.getExtension('WEBGL_debug_renderer_info');
    const renderer=String(gl.getParameter(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    // Software WebGL adds transfers without providing hardware acceleration.
    return !/swiftshader|llvmpipe|software|microsoft basic render/i.test(renderer);
  } catch { return false; }
}
async function createModels(target: 'CPU' | 'GPU') {
  hand?.close();pose?.close();hand=null;pose=null;
  const canvas=()=>target==='GPU'?{canvas:new OffscreenCanvas(1,1)}:{};
  if(mode!=='pose')hand=await HandLandmarker.createFromOptions(files,{...canvas(),baseOptions:{modelAssetPath:`${base}models/hand_landmarker.task`,delegate:target},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.6,minTrackingConfidence:.6});
  if(mode!=='hand')pose=await PoseLandmarker.createFromOptions(files,{...canvas(),baseOptions:{modelAssetPath:`${base}models/pose_landmarker_lite.task`,delegate:target},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.6,minTrackingConfidence:.6,outputSegmentationMasks:false});
  delegate=target;
}
function detect(bitmap: ImageBitmap,time: number) {
  return {handResult:mode!=='pose'?hand!.detectForVideo(bitmap,time):null,poseResult:mode!=='hand'?pose!.detectForVideo(bitmap,time):null};
}
scope.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    const token = ++generation;
    try {
      mode=data.mode;base=data.base;
      files=await FilesetResolver.forVisionTasks(`${base}vision`);
      try {await createModels(hardwareGPU()?'GPU':'CPU');}
      catch {await createModels('CPU');}
      if (token === generation) scope.postMessage({ type: 'ready', delegate });
    } catch (error) { scope.postMessage({ type: 'error', message: String(error) }); }
  }
  if (data.type === 'frame') {
    const bitmap = data.bitmap as ImageBitmap;
    const start = performance.now();
    try {
      let result;
      try {result=detect(bitmap,data.time);}
      catch(error) {if(delegate!=='GPU')throw error;await createModels('CPU');result=detect(bitmap,data.time);}
      const {handResult,poseResult}=result;
      scope.postMessage({ type: 'result', delegate, time: data.time, width: data.width || bitmap.width, height: data.height || bitmap.height, inferenceMs: performance.now() - start,
        hands: handResult?.landmarks.map((points, i) => ({ points: normalizeHandLandmarks(points), side: handResult.handedness[i][0].categoryName, confidence: handResult.handedness[i][0].score })) ?? [],
        pose: poseResult?.landmarks[0] ?? [] });
    } catch (error) { scope.postMessage({ type: 'error', message: String(error) }); }
    finally { bitmap.close(); }
  }
};
