import {describe,it,expect} from 'vitest';
import {defaults} from '../src/core/types';
import {inspectHand,MenuSelector,palmCenter,palmToScreen} from '../src/motion/hands';
import {fixtureHand} from './hand-fixtures';
const s={...defaults,smoothing:1};
function ready(m:MenuSelector,target='a',start=0){for(const t of [0,50,100,400])m.update(target,'open',start+t,s);}
function close(m:MenuSelector,target='a',start=450){return [0,50,100,150,200].map(t=>m.update(target,'fist',start+t,s));}
describe('hand geometry',()=>{
  it('distinguishes an open palm, several curled fingers, index-only and a finger pinch',()=>{
    expect(inspectHand(fixtureHand(),4/3).shape).toBe('open');expect(inspectHand(fixtureHand('Right','fist'),4/3).shape).toBe('fist');
    expect(inspectHand(fixtureHand('Right','index'),4/3).shape).not.toBe('fist');expect(inspectHand(fixtureHand('Right','two'),4/3).shape).not.toBe('fist');expect(inspectHand(fixtureHand('Right','pinch'),4/3).shape).toBe('open');
  });
  it('keeps the palm center identical when fingertips fold',()=>{expect(palmCenter(fixtureHand().points)).toEqual(palmCenter(fixtureHand('Right','fist').points));});
  it('mirrors X consistently and maps a comfortable inner region to the whole PC display',()=>{expect(palmToScreen({x:.5,y:.55},1440,1000)).toEqual({x:720,y:500});expect(palmToScreen({x:.77,y:.28},1440,1000)).toEqual({x:0,y:0});expect(palmToScreen({x:.1,y:.9},1440,1000)).toEqual({x:1440,y:1000});});
  it('rejects low handedness scores, missing, tiny and clipped landmarks',()=>{
    const h=fixtureHand('Right','fist');expect(inspectHand({...h,confidence:.4},4/3).shape).toBe('unknown');expect(inspectHand({...h,points:h.points.slice(0,20)},4/3).shape).toBe('unknown');
    expect(inspectHand({...h,points:h.points.map(p=>({x:.5+(p.x-.5)*.1,y:.5+(p.y-.5)*.1}))},4/3).shape).toBe('unknown');
    const clipped=structuredClone(h);clipped.points[8].x=-.01;expect(inspectHand(clipped,4/3).shape).toBe('unknown');
  });
  it('accepts real Hand Landmarker default visibility=0 for both open and closed right hands',()=>{for(const state of ['open','fist'] as const){const h=fixtureHand('Right',state);h.points=h.points.map(p=>({...p,visibility:0}));expect(inspectHand(h,4/3).shape).toBe(state);}});
});
describe('fist menu lifecycle',()=>{
  it('requires a confirmed open hand and emits once per close until confirmed release',()=>{
    const m=new MenuSelector();expect(close(m).filter(Boolean)).toEqual([]);m.reset();ready(m);expect(close(m).filter(Boolean)).toEqual(['a']);
    expect(m.update('a','fist',2000,s)).toBe(null);m.update('b','open',2100,s);expect(m.armed).toBe(false);m.update('b','open',2150,s);expect(m.armed).toBe(false);m.update('b','open',2200,s);m.update('b','open',2500,s);expect(close(m,'b',2600).filter(Boolean)).toEqual(['b']);
  });
  it('locks the original dwell target as fingers begin closing',()=>{const m=new MenuSelector();ready(m);m.update('a','closing',425,s);expect(close(m,'b').filter(Boolean)).toEqual(['a']);});
  it('does not select by an index curl, thumb-index pinch, or a brief fist',()=>{
    for(const state of ['index','pinch'] as const){const m=new MenuSelector();ready(m);const shape=inspectHand(fixtureHand('Right',state),4/3).shape;expect([450,550,700,900].map(t=>m.update('a',shape,t,s)).filter(Boolean)).toEqual([]);}
    const m=new MenuSelector();ready(m);expect(m.update('a','fist',450,s)).toBe(null);expect(m.update('a','fist',500,s)).toBe(null);expect(m.update('a','open',550,s)).toBe(null);
  });
  it('rejects closes without dwell, even if the hand moves onto a ready button later',()=>{const m=new MenuSelector();ready(m);m.update('b','open',410,s);expect(close(m,'b').filter(Boolean)).toEqual([]);});
  it('cancels on tracking loss and navigation and rejects a held fist on the next screen',()=>{
    for(const loss of [true,false]){const m=new MenuSelector();ready(m);m.update('a','fist',450,s);if(loss)m.update('a','unknown',500,s);else m.reset();expect(close(m,'b',700).filter(Boolean)).toEqual([]);expect(m.armed).toBe(false);}
  });
  it('requires both configured frame count and minimum hold time',()=>{const m=new MenuSelector();ready(m);const slow={...s,fistFrames:6,fistHoldMs:300};expect([450,500,550,600,650,700].map(t=>m.update('a','fist',t,slow)).filter(Boolean)).toEqual([]);expect(m.update('a','fist',750,slow)).toBe('a');});
});
