import { describe, it, expect } from 'vitest';
import { defaults, type Landmark } from '../src/core/types';
import { PoseControls } from '../src/motion/gestures';
const s={...defaults,smoothing:1};
function body(shift=0,wrist=.8):Landmark[]{const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:1,presence:1}));p[11]={x:.4,y:.4+shift,visibility:1,presence:1};p[12]={x:.6,y:.4+shift,visibility:1,presence:1};p[23]={x:.42,y:.7+shift,visibility:1,presence:1};p[24]={x:.58,y:.7+shift,visibility:1,presence:1};p[15].y=wrist;p[16].y=wrist;return p;}
function calibrated(){const p=new PoseControls();p.beginCalibration();for(let i=0;i<30;i++)p.update(body(),i*50,4/3,s,true);return p;}
describe('pose calibration and commands',()=>{
  it('needs 30 stable visible samples and clears progress on lost joints',()=>{const p=new PoseControls();p.beginCalibration();for(let i=0;i<20;i++)p.update(body(),i*50,4/3,s,true);p.update([],1050,4/3,s,true);expect(p.samples).toHaveLength(0);for(let i=0;i<30;i++)p.update(body(),1100+i*50,4/3,s,true);expect(p.baseline?.size).toBeCloseTo(.3);expect(p.calibrating).toBe(false);});
  it('requires consecutive upward frames, neutral return and a grounded character',()=>{const p=calibrated();for(let i=0;i<3;i++)p.update(body(),1600+i*50,4/3,s,true);expect(p.update(body(-.05),1800,4/3,s,true).commands.some(c=>c.type==='jump')).toBe(false);expect(p.update(body(-.065),1850,4/3,s,true).commands).toContainEqual({type:'jump'});expect(p.update(body(-.08),1900,4/3,s,true).commands.some(c=>c.type==='jump')).toBe(false);for(let i=0;i<3;i++)p.update(body(),2000+i*50,4/3,s,false);p.update(body(-.05),2200,4/3,s,false);expect(p.update(body(-.065),2250,4/3,s,false).commands.some(c=>c.type==='jump')).toBe(false);});
  it('releases duck and tilt immediately on tracking loss',()=>{const p=calibrated();expect(p.update(body(.1),1800,4/3,s,true).commands).toContainEqual({type:'duck',value:true});expect(p.update([],1850,4/3,s,true).commands).toEqual([{type:'duck',value:false},{type:'tilt',value:0}]);expect(p.jumpArmed).toBe(false);});
  it('uses a separate hand-raise rule in seated mode',()=>{const p=calibrated(),seated={...s,dinoMode:'seated' as const};for(let i=0;i<3;i++)p.update(body(),1600+i*50,4/3,seated,true);p.update(body(0,.2),1800,4/3,seated,true);expect(p.update(body(0,.2),1850,4/3,seated,true).commands).toContainEqual({type:'jump'});expect(p.duck).toBe(false);});
  it('treats both wrists lost as invalid only for seated dino input',()=>{const p=calibrated(),points=body();points[15].visibility=0;points[16].visibility=0;expect(p.update(points,1800,4/3,{...s,dinoMode:'seated'},true).valid).toBe(false);expect(p.update(points,1850,4/3,s,true).valid).toBe(true);});
});

