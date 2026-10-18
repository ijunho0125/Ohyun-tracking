import type { Landmark } from '../core/types';

// Hand Landmarker does not predict per-joint visibility/presence. The Web SDK
// fills an absent protobuf visibility field with 0. Pose scores are different:
// keep checking those, but never treat a hand's default 0 as tracking failure.
export function normalizeHandLandmarks(points: readonly Landmark[]): Landmark[] {
  return points.map(({x,y,z})=>({x,y,z}));
}

export function isDrawableLandmark(point: Landmark | undefined, kind: 'hand' | 'pose') {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y)
    && (kind === 'hand' || ((point.visibility ?? 1) >= .55 && (point.presence ?? 1) >= .55));
}
