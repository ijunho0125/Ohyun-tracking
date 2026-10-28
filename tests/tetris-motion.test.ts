import { describe, expect, it } from 'vitest';
import { defaults, type Command, type Landmark } from '../src/core/types';
import { TetrisControls } from '../src/motion/tetris';
import { fixtureBody } from './pose-fixtures';

const settings = {...defaults, smoothing:1};
// A front-facing player: their right side is on the camera image's left.
function body(shift = 0, arm: 'left'|'right'|'both'|'none' = 'none'): Landmark[] {
  const p = fixtureBody(shift);
  p[11].x=.6; p[12].x=.4;
  p[13]={x:.6,y:.57+shift,visibility:1}; p[14]={x:.4,y:.57+shift,visibility:1};
  p[15]={x:.6,y:.7+shift,visibility:1}; p[16]={x:.4,y:.7+shift,visibility:1};
  if (arm === 'left' || arm === 'both') { p[13]={x:.72,y:.4+shift,visibility:1}; p[15]={x:.82,y:.4+shift,visibility:1}; }
  if (arm === 'right' || arm === 'both') { p[14]={x:.28,y:.4+shift,visibility:1}; p[16]={x:.18,y:.4+shift,visibility:1}; }
  return p;
}
function calibrated() {
  const c = new TetrisControls(); c.beginCalibration();
  for (let i=0;i<30;i++) c.update([],body(),i*50,4/3,settings);
  for (let i=0;i<4;i++) c.update([],body(),1500+i*50,4/3,settings);
  return c;
}
describe('Tetris arm and body controls', () => {
  it.each([['left',-1],['right',1]] as const)('moves toward the physical %s arm and repeats while held', (arm,direction) => {
    const c=calibrated(), commands: Command[]=[];
    for (let i=0;i<12;i++) commands.push(...c.update([],body(0,arm),1800+i*50,4/3,settings).commands);
    expect(commands.filter(x=>x.type==='move')).toEqual([{type:'move',value:direction},{type:'move',value:direction},{type:'move',value:direction}]);
  });
  it('does not move for both arms or a brief tracking spike', () => {
    const c=calibrated();
    expect(c.update([],body(0,'left'),1800,4/3,settings).commands).not.toContainEqual({type:'move',value:-1});
    for(let i=0;i<8;i++) expect(c.update([],body(0,'both'),1850+i*50,4/3,settings).commands.filter(x=>x.type==='move')).toEqual([]);
  });
  it('stops on missing arm landmarks and requires fresh confirmation after recovery', () => {
    const c=calibrated(), missing=body(0,'right'); missing[16].visibility=0;
    expect(c.update([],missing,1800,4/3,settings)).toMatchObject({valid:false,commands:[{type:'softDrop',value:false}]});
    expect(c.update([],body(0,'right'),1850,4/3,settings).commands).not.toContainEqual({type:'move',value:1});
    expect(c.update([],body(0,'right'),1900,4/3,settings).commands).toContainEqual({type:'move',value:1});
  });
  it('does not repeat movement for duplicate or reordered timestamps', () => {
    const c=calibrated(); c.update([],body(0,'left'),1800,4/3,settings);
    expect(c.update([],body(0,'left'),1850,4/3,settings).commands).toContainEqual({type:'move',value:-1});
    expect(c.update([],body(0,'left'),1850,4/3,settings).commands).toEqual([]);
    expect(c.update([],body(0,'left'),1800,4/3,settings).commands).toEqual([]);
  });
  it.each([10,20,30])('rotates once per jump and rearms after standing at %i Hz', frequency => {
    const c=calibrated(),step=1000/frequency; let now=1700;
    for(let cycle=0;cycle<2;cycle++) {
      const commands:Command[]=[];
      for(let i=0;i<10;i++) commands.push(...c.update([],body(-.045),now+=step,4/3,defaults).commands);
      expect(commands.filter(x=>x.type==='rotate')).toHaveLength(1);
      for(let i=0;i<8;i++) c.update([],body(),now+=step,4/3,defaults);
    }
  });
  it('holds soft drop while crouched and releases on standing', () => {
    const c=calibrated();
    for(let i=0;i<8;i++) expect(c.update([],body(.07,'right'),1800+i*50,4/3,settings).commands).toContainEqual({type:'softDrop',value:true});
    expect(c.update([],body(),2200,4/3,settings).commands).toContainEqual({type:'softDrop',value:false});
  });
  it('clears incomplete calibration when an arm disappears', () => {
    const c=new TetrisControls(); c.beginCalibration();
    for(let i=0;i<20;i++) c.update([],body(),i*50,4/3,settings);
    const missing=body(); missing[13].visibility=0;
    expect(c.update([],missing,1000,4/3,settings).valid).toBe(false);
    expect(c.pose.samples).toHaveLength(0);
    for(let i=0;i<29;i++) expect(c.update([],body(),1050+i*50,4/3,settings).progress).toBeLessThan(1);
    expect(c.update([],body(),2500,4/3,settings).progress).toBe(1);
  });
});
