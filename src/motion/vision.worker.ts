import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import { normalizeHandLandmarks } from './landmarks';
import type { MotionMode } from '../core/types';
let hand: HandLandmarker | null = null;
let pose: PoseLandmarker | null = null;
let mode: MotionMode = 'hand';
let generation = 0;
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    const token = ++generation;
    try {
      hand?.close(); pose?.close(); hand = null; pose = null; mode = data.mode;
      const files = await FilesetResolver.forVisionTasks(`${data.base}vision`);
      if (mode !== 'pose') hand = await HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: `${data.base}models/hand_landmarker.task`, delegate: 'CPU' }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .6, minTrackingConfidence: .6 });
      if (mode !== 'hand') pose = await PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: `${data.base}models/pose_landmarker_lite.task`, delegate: 'CPU' }, runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: .6, minTrackingConfidence: .6, outputSegmentationMasks: false });
      if (token === generation) scope.postMessage({ type: 'ready' });
    } catch (error) { scope.postMessage({ type: 'error', message: String(error) }); }
  }
  if (data.type === 'frame') {
    const bitmap = data.bitmap as ImageBitmap;
    const start = performance.now();
    try {
      const handResult = mode !== 'pose' ? hand!.detectForVideo(bitmap, data.time) : null;
      const poseResult = mode !== 'hand' ? pose!.detectForVideo(bitmap, data.time) : null;
      scope.postMessage({ type: 'result', time: data.time, width: bitmap.width, height: bitmap.height, inferenceMs: performance.now() - start,
        hands: handResult?.landmarks.map((points, i) => ({ points: normalizeHandLandmarks(points), side: handResult.handedness[i][0].categoryName, confidence: handResult.handedness[i][0].score })) ?? [],
        pose: poseResult?.landmarks[0] ?? [] });
    } catch (error) { scope.postMessage({ type: 'error', message: String(error) }); }
    finally { bitmap.close(); }
  }
};
