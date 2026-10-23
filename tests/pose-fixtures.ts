import type { Landmark } from '../src/core/types';

export function fixtureBody(shift = 0): Landmark[] {
  const points = Array.from({length:33}, () => ({x:.5, y:.5, visibility:1, presence:1}));
  for (const [i,x,y] of [[11,.4,.4],[12,.6,.4],[23,.42,.7],[24,.58,.7]]) {
    points[i] = {x, y:y+shift, visibility:1, presence:1};
  }
  points[15].y = .8;
  points[16].y = .8;
  return points;
}
