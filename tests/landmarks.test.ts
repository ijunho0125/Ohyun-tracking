import {it,expect} from 'vitest';
import {isDrawableLandmark,normalizeHandLandmarks} from '../src/motion/landmarks';
it('removes unavailable hand visibility/presence values while preserving coordinates',()=>{
  const input=[{x:.2,y:.3,z:-.1,visibility:0,presence:0}];
  expect(normalizeHandLandmarks(input)).toEqual([{x:.2,y:.3,z:-.1}]);expect(input[0].visibility).toBe(0);
});
it('draws hand joints with the SDK default zero visibility',()=>{expect(isDrawableLandmark({x:.2,y:.3,visibility:0,presence:0},'hand')).toBe(true);});
it('still rejects low-visibility pose joints',()=>{expect(isDrawableLandmark({x:.2,y:.3,visibility:0},'pose')).toBe(false);expect(isDrawableLandmark({x:.2,y:.3,visibility:1,presence:0},'pose')).toBe(false);expect(isDrawableLandmark({x:.2,y:.3,visibility:.9,presence:.9},'pose')).toBe(true);});
it('rejects missing and invalid coordinates for both landmark kinds',()=>{for(const kind of ['hand','pose'] as const){expect(isDrawableLandmark(undefined,kind)).toBe(false);expect(isDrawableLandmark({x:NaN,y:.3},kind)).toBe(false);}});
