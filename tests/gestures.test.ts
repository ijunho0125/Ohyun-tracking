import { describe, it, expect } from 'vitest';
import { defaults, type Landmark } from '../src/core/types';
import { kneeAngle, PoseControls } from '../src/motion/gestures';
const s={...defaults,smoothing:1};
function body(shift=0,wrist=.8):Landmark[]{const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:1,presence:1}));p[11]={x:.4,y:.4+shift,visibility:1,presence:1};p[12]={x:.6,y:.4+shift,visibility:1,presence:1};p[23]={x:.42,y:.7+shift,visibility:1,presence:1};p[24]={x:.58,y:.7+shift,visibility:1,presence:1};p[15].y=wrist;p[16].y=wrist;return p;}
function scaledBody(size:number,rise=0){const points=body(-size*rise);for(const i of [23,24])points[i].y=.4+size-size*rise;return points;}
function calibrated(points=body()){const p=new PoseControls();p.beginCalibration();for(let i=0;i<30;i++)p.update(points,i*50,4/3,s,true);return p;}
describe('pose calibration and commands',()=>{
  it.each([10,20,30])('recognizes a smaller cat jump without changing the normal threshold at %i Hz',frequency=>{
    const cat=calibrated(),normal=calibrated(),step=1000/frequency;let now=1600;
    for(let i=0;i<4;i++){now+=step;cat.update(body(),now,4/3,defaults,true,'high');normal.update(body(),now,4/3,defaults,true);}
    const catCommands=[],normalCommands=[];
    for(let i=0;i<4;i++){
      now+=step;
      catCommands.push(...cat.update(body(-.014),now,4/3,defaults,true,'high').commands);
      normalCommands.push(...normal.update(body(-.014),now,4/3,defaults,true).commands);
    }
    expect(catCommands.filter(c=>c.type==='jump')).toHaveLength(1);
    expect(normalCommands.filter(c=>c.type==='jump')).toHaveLength(0);
    for(let i=0;i<5;i++)expect(cat.update(body(-.014),now+=step,4/3,defaults,false,'high').commands).not.toContainEqual({type:'jump'});
  });
  it.each([10,20,30])('rejects jitter and a single tracking spike in high sensitivity mode at %i Hz',frequency=>{
    const p=calibrated(),step=1000/frequency;let now=1600;
    for(let i=0;i<4;i++)p.update(body(),now+=step,4/3,defaults,true,'high');
    for(let i=0;i<30;i++)expect(p.update(body(i%2?.008:-.008),now+=step,4/3,defaults,true,'high').commands).not.toContainEqual({type:'jump'});
    expect(p.update(body(-.05),now+=step,4/3,defaults,true,'high').commands).not.toContainEqual({type:'jump'});
    expect(p.update(body(),now+=step,4/3,defaults,true,'high').commands).not.toContainEqual({type:'jump'});
  });
  it('keeps crouching for as long as the player remains crouched and releases when they stand',()=>{
    const p=calibrated();
    for(let time=1600;time<=6600;time+=50){
      expect(p.update(body(.1),time,4/3,s,true).commands).toContainEqual({type:'duck',value:true});
    }
    expect(p.update(body(),6650,4/3,s,true).commands).toContainEqual({type:'duck',value:false});
  });
  it('replaces the previous baseline when body tracking is calibrated again',()=>{
    const p=calibrated();
    p.update(body(.1),1800,4/3,s,true);
    expect(p.duck).toBe(true);
    p.beginCalibration();
    expect(p.baseline).toBe(null);
    expect(p.duck).toBe(false);
    for(let i=0;i<30;i++)expect(p.update(body(.1),1900+i*50,4/3,s,true).commands).toEqual([]);
    expect(p.baseline?.shoulderY).toBeCloseTo(.5);
    expect(p.update(body(.1),3500,4/3,s,true).commands).toContainEqual({type:'duck',value:false});
  });
  it('does not count duplicate or reordered captures toward calibration',()=>{
    const p=new PoseControls();p.beginCalibration();
    p.update(body(),100,4/3,s,true);
    for(let i=0;i<30;i++)p.update(body(),i%2?100:50,4/3,s,true);
    expect(p.samples).toHaveLength(1);
    expect(p.calibrating).toBe(true);
  });
  it('discards partial calibration after an inference gap or an explicit tracking reset',()=>{
    for(const reset of [false,true]){
      const p=new PoseControls();p.beginCalibration();
      for(let i=0;i<20;i++)p.update(body(),i*50,4/3,s,true);
      if(reset)p.reset();
      p.update(body(),reset?1000:1500,4/3,s,true);
      expect(p.samples).toHaveLength(1);
      expect(p.calibrating).toBe(true);
    }
  });
  it('restarts calibration if the hips move while the shoulders remain still',()=>{
    const p=new PoseControls();p.beginCalibration();
    for(let i=0;i<20;i++)p.update(body(),i*50,4/3,s,true);
    const points=body();points[23].y+=.06;points[24].y+=.06;
    expect(p.update(points,1000,4/3,s,true).progress).toBeCloseTo(1/30);
  });
  it.each([10,20,30,60])('confirms a brief small jump in two captured samples at %i Hz',frequency=>{
    const p=calibrated(),step=1000/frequency;let now=1600;
    for(let i=0;i<4;i++)p.update(body(),now+=step,4/3,defaults,true);
    expect(p.update(body(-.021),now+=step,4/3,defaults,true).commands).not.toContainEqual({type:'jump'});
    expect(p.update(body(-.021),now+=step,4/3,defaults,true).commands).toContainEqual({type:'jump'});
    for(let i=0;i<8;i++)expect(p.update(body(-.021),now+=step,4/3,defaults,true).commands).not.toContainEqual({type:'jump'});
  });
  it.each([10,20,30,60])('does not mistake the smoothing tail of one large body spike for a jump at %i Hz',frequency=>{
    const p=calibrated(),step=1000/frequency;let now=1600;
    for(let i=0;i<4;i++)p.update(body(),now+=step,4/3,defaults,true);
    expect(p.update(body(-.2),now+=step,4/3,defaults,true).commands).not.toContainEqual({type:'jump'});
    for(let i=0;i<12;i++)expect(p.update(body(),now+=step,4/3,defaults,true).commands).not.toContainEqual({type:'jump'});
  });
  it.each([10,20,30,60])('confirms a seated hand raise in two raw samples and rejects single wrist spikes at %i Hz',frequency=>{
    const seated={...defaults,dinoMode:'seated' as const},p=calibrated(),step=1000/frequency;let now=1600;
    for(let i=0;i<4;i++)p.update(body(),now+=step,4/3,seated,true);
    expect(p.update(body(0,.1),now+=step,4/3,seated,true).commands).not.toContainEqual({type:'jump'});
    for(let i=0;i<6;i++)expect(p.update(body(),now+=step,4/3,seated,true).commands).not.toContainEqual({type:'jump'});
    expect(p.update(body(0,.3),now+=step,4/3,seated,true).commands).not.toContainEqual({type:'jump'});
    expect(p.update(body(0,.3),now+=step,4/3,seated,true).commands).toContainEqual({type:'jump'});
  });
  it('ignores duplicate and reordered samples without clearing a valid takeoff',()=>{
    const p=calibrated();for(let i=0;i<4;i++)p.update(body(),1600+i*50,4/3,defaults,true);
    expect(p.update(body(-.021),1800,4/3,defaults,true).commands).not.toContainEqual({type:'jump'});
    expect(p.update(body(-.021),1800,4/3,defaults,true).commands).toEqual([]);
    expect(p.update(body(),1790,4/3,defaults,true).commands).toEqual([]);
    expect(p.update(body(-.021),1850,4/3,defaults,true).commands).toContainEqual({type:'jump'});
  });
  it('recognizes a small jump during irregular camera delivery without relying on the configured fps',()=>{
    const p=calibrated();for(let i=0;i<4;i++)p.update(body(),1600+i*50,4/3,defaults,true);
    expect(p.update(body(-.021),1771,4/3,{...defaults,frequency:10},true).commands).not.toContainEqual({type:'jump'});
    expect(p.update(body(-.021),1814,4/3,{...defaults,frequency:10},true).commands).toContainEqual({type:'jump'});
  });
  it('does not convert slow posture drift through the jump height into a takeoff',()=>{
    const p=calibrated();for(let i=0;i<4;i++)p.update(body(),1600+i*50,4/3,defaults,true);
    for(let i=1;i<=30;i++)expect(p.update(body(-i*.0015),1750+i*50,4/3,defaults,true).commands).not.toContainEqual({type:'jump'});
  });
  it('releases controls on a non-finite capture timestamp and recovers from fresh neutral samples',()=>{
    for(const time of [NaN,Infinity,-Infinity]){
      const p=calibrated();p.update(body(.1),1800,4/3,s,true);
      expect(p.update(body(),time,4/3,s,true)).toMatchObject({valid:false,commands:[{type:'duck',value:false},{type:'tilt',value:0}]});
      for(let i=0;i<3;i++)p.update(body(),1900+i*50,4/3,s,true);
      p.update(body(-.021),2050,4/3,s,true);
      expect(p.update(body(-.021),2100,4/3,s,true).commands).toContainEqual({type:'jump'});
    }
  });
  it.each([10,20,30])('jumps again after landing in a crouch without a standing pause at %i Hz',frequency=>{
    const p=calibrated(),step=1000/frequency;let now=1600;
    const update=(shift:number,grounded=true)=>p.update(body(shift),now+=step,4/3,defaults,grounded).commands;
    for(let i=0;i<4;i++)update(0);
    for(let cycle=0;cycle<3;cycle++){
      const commands=[];
      for(let i=0;i<8;i++)commands.push(...update(-.021));
      expect(commands.filter(c=>c.type==='jump')).toHaveLength(1);
      for(let i=0;i<8;i++)expect(update(.07,false)).not.toContainEqual({type:'jump'});
      expect(p.jumpArmed).toBe(false);
      for(let i=0;i<8;i++)expect(update(.07)).not.toContainEqual({type:'jump'});
      expect(p.duck).toBe(true);
    }
  });
  it.each([10,20,30])('releases a lingering crouch before a confirmed quick takeoff at %i Hz',frequency=>{
    const p=calibrated(),step=1000/frequency;let now=1600;
    const update=(shift:number)=>p.update(body(shift),now+=step,4/3,defaults,true).commands;
    for(let i=0;i<4;i++)update(0);
    for(let i=0;i<12;i++)update(.2);
    expect(p.duck).toBe(true);
    expect(update(-.004)).not.toContainEqual({type:'jump'});
    const commands=update(-.015);
    expect(commands.slice(0,2)).toEqual([{type:'duck',value:false},{type:'jump'}]);
    for(let i=0;i<10;i++)expect(update(-.015)).not.toContainEqual({type:'jump'});
  });
  it.each([10,20,30])('does not jump from simply standing up or a single spike after crouching at %i Hz',frequency=>{
    const p=calibrated(),step=1000/frequency;let now=1600;
    const update=(shift:number)=>p.update(body(shift),now+=step,4/3,defaults,true).commands;
    for(let i=0;i<4;i++)update(0);
    for(let i=0;i<12;i++)update(.07);
    for(const shift of [.04,.02,0,-.006,0,0])expect(update(shift)).not.toContainEqual({type:'jump'});
    expect(p.duck).toBe(false);
    for(let i=0;i<12;i++)update(.07);
    expect(update(-.045)).not.toContainEqual({type:'jump'});
    expect(update(.07)).not.toContainEqual({type:'jump'});
  });
  it.each([10,20,30])('recognizes a small jump once and rearms only after landing at %i Hz',frequency=>{
    const p=calibrated(),step=1000/frequency;let now=1600;
    for(let i=0;i<3;i++)p.update(body(),now+=step,4/3,defaults,true);
    for(let cycle=0;cycle<2;cycle++){
      const commands=[];
      for(let i=0;i<4;i++)commands.push(...p.update(body(-.021),now+=step,4/3,defaults,true).commands);
      expect(commands.filter(c=>c.type==='jump')).toHaveLength(1);
      for(let i=0;i<16;i++)expect(p.update(body(-.021),now+=step,4/3,defaults,true).commands).not.toContainEqual({type:'jump'});
      for(let i=0;i<8;i++)p.update(body(),now+=step,4/3,defaults,true);
    }
  });
  it.each([10,20,30])('optionally recognizes a new physical jump before the game character lands at %i Hz',frequency=>{
    const p=calibrated(),step=1000/frequency;let now=1600;
    const update=(shift:number,grounded:boolean)=>p.update(body(shift),now+=step,4/3,defaults,grounded,'normal',true).commands;
    for(let i=0;i<3;i++)update(0,true);
    expect(update(-.021,true)).not.toContainEqual({type:'jump'});
    expect(update(-.021,true)).toContainEqual({type:'jump'});
    // The player lands and starts the next jump while the character remains airborne.
    for(let i=0;i<3;i++)expect(update(0,false)).not.toContainEqual({type:'jump'});
    expect(update(-.021,false)).not.toContainEqual({type:'jump'});
    expect(update(-.021,false)).toContainEqual({type:'jump'});
    for(let i=0;i<5;i++)expect(update(-.021,false)).not.toContainEqual({type:'jump'});
  });
  it.each([10,20,30])('still rejects a single tracking spike while airborne detection is enabled at %i Hz',frequency=>{
    const p=calibrated(),step=1000/frequency;let now=1600;
    const update=(shift:number)=>p.update(body(shift),now+=step,4/3,defaults,false,'normal',true).commands;
    for(let i=0;i<4;i++)update(0);
    expect(update(-.05)).not.toContainEqual({type:'jump'});
    for(let i=0;i<4;i++)expect(update(0)).not.toContainEqual({type:'jump'});
  });
  it.each([10,20,30])('detects early takeoff at different camera distances at %i Hz',frequency=>{
    for(const size of [.12,.3,.5]){
      const p=calibrated(scaledBody(size)),step=1000/frequency;let now=1600;
      for(let i=0;i<3;i++)p.update(scaledBody(size),now+=step,4/3,defaults,true);
      expect(p.update(scaledBody(size,.015),now+=step,4/3,defaults,true).commands).not.toContainEqual({type:'jump'});
      expect(p.update(scaledBody(size,.05),now+=step,4/3,defaults,true).commands).toContainEqual({type:'jump'});
      for(let i=0;i<12;i++)expect(p.update(scaledBody(size,.05),now+=step,4/3,defaults,true).commands).not.toContainEqual({type:'jump'});
    }
  });
  it.each([10,20,30])('ignores alternating tracking jitter with sensitive thresholds at %i Hz',frequency=>{
    const p=calibrated(),step=1000/frequency;let now=1600;
    for(let i=0;i<3;i++)p.update(body(),now+=step,4/3,defaults,true);
    for(let i=0;i<30;i++)expect(p.update(body(i%2?.008:-.008),now+=step,4/3,defaults,true).commands).not.toContainEqual({type:'jump'});
  });
  it.each([20,30])('recognizes the start of a coherent jump before the old height threshold at %i Hz',frequency=>{
    const p=calibrated(),step=1000/frequency;let now=1600;
    for(let i=0;i<3;i++)p.update(body(),now+=step,4/3,defaults,true);
    expect(p.update(body(-.004),now+=step,4/3,defaults,true).commands).not.toContainEqual({type:'jump'});
    expect(p.update(body(-.015),now+=step,4/3,defaults,true).commands).toContainEqual({type:'jump'});
    expect(p.update(body(-.02),now+=step,4/3,defaults,true).commands).not.toContainEqual({type:'jump'});
  });
  it('does not use shoulder-only movement or slow drift for early takeoff',()=>{
    for(const shoulderOnly of [false,true]){
      const p=calibrated();for(let i=0;i<3;i++)p.update(body(),1600+i*50,4/3,defaults,true);
      for(let i=1;i<=8;i++){
        const points=body(-i*.002);
        if(shoulderOnly)for(const index of [23,24])points[index]=body()[index];
        expect(p.update(points,1750+i*50,4/3,defaults,true).commands).not.toContainEqual({type:'jump'});
      }
    }
  });
  it('uses visible bent knees for earlier duck, with a torso-only fallback',()=>{
    const p=calibrated(),points=body(.03);
    points[25]={x:.5,y:.8,visibility:1,presence:1};points[27]={x:.42,y:.9,visibility:1,presence:1};
    points[26]={x:.5,y:.8,visibility:1,presence:1};points[28]={x:.58,y:.9,visibility:1,presence:1};
    expect(kneeAngle(points,4/3)).toBeLessThan(145);
    expect(p.update(points,1800,4/3,s,true).commands).toContainEqual({type:'duck',value:true});
    expect(p.update(body(),1850,4/3,s,true).commands).toContainEqual({type:'duck',value:false});
    const cropped=body(.06);for(const index of [25,26,27,28])cropped[index].visibility=0;
    expect(kneeAngle(cropped,4/3)).toBe(null);expect(p.update(cropped,1900,4/3,s,true).commands).toContainEqual({type:'duck',value:true});
  });
  it('needs 30 stable visible samples and clears progress on lost joints',()=>{const p=new PoseControls();p.beginCalibration();for(let i=0;i<20;i++)p.update(body(),i*50,4/3,s,true);p.update([],1050,4/3,s,true);expect(p.samples).toHaveLength(0);for(let i=0;i<30;i++)p.update(body(),1100+i*50,4/3,s,true);expect(p.baseline?.size).toBeCloseTo(.3);expect(p.calibrating).toBe(false);});
  it('requires consecutive upward frames, neutral return and a grounded character',()=>{const p=calibrated();for(let i=0;i<3;i++)p.update(body(),1600+i*50,4/3,s,true);expect(p.update(body(-.05),1800,4/3,s,true).commands.some(c=>c.type==='jump')).toBe(false);expect(p.update(body(-.065),1850,4/3,s,true).commands).toContainEqual({type:'jump'});expect(p.update(body(-.08),1900,4/3,s,true).commands.some(c=>c.type==='jump')).toBe(false);for(let i=0;i<3;i++)p.update(body(),2000+i*50,4/3,s,false);p.update(body(-.05),2200,4/3,s,false);expect(p.update(body(-.065),2250,4/3,s,false).commands.some(c=>c.type==='jump')).toBe(false);});
  it('releases duck and tilt immediately on tracking loss',()=>{const p=calibrated();expect(p.update(body(.1),1800,4/3,s,true).commands).toContainEqual({type:'duck',value:true});expect(p.update([],1850,4/3,s,true).commands).toEqual([{type:'duck',value:false},{type:'tilt',value:0}]);expect(p.jumpArmed).toBe(false);});
  it.each([10,20,30])('tracks mirrored left and right torso lean and returns to neutral at %i Hz',frequency=>{
    const p=calibrated(),step=1000/frequency;let now=1600;
    const tilted=(shift:number)=>{const points=body();points[11].x+=shift;points[12].x+=shift;return points;};
    const tilt=(shift:number)=>{
      const commands=p.update(tilted(shift),now+=step,4/3,defaults,true).commands;
      const result=commands.find(c=>c.type==='tilt');
      if(!result || result.type!=='tilt')throw new Error('missing tilt command');
      return result.value;
    };
    for(let i=0;i<6;i++)tilt(0);
    let left=0;for(let i=0;i<8;i++)left=tilt(.06);
    expect(left).toBeLessThan(-.1);
    let right=0;for(let i=0;i<8;i++)right=tilt(-.06);
    expect(right).toBeGreaterThan(.1);
    let center=0;for(let i=0;i<10;i++)center=tilt(0);
    expect(Math.abs(center)).toBeLessThan(.025);
  });
  it('keeps small torso jitter neutral and scales tilt with a deliberate lean',()=>{
    const p=calibrated();let now=1600;
    const lean=(shift:number)=>{
      const points=body();points[11].x+=shift;points[12].x+=shift;
      const command=p.update(points,now+=50,4/3,s,true).commands.find(c=>c.type==='tilt');
      if(!command || command.type!=='tilt')throw new Error('missing tilt command');
      return command.value;
    };
    expect(lean(.005)).toBe(0);
    expect(lean(-.005)).toBe(0);
    const slight=lean(.03),strong=lean(.06);
    expect(slight).toBeLessThan(0);
    expect(strong).toBeLessThan(slight);
    expect(Math.abs(strong)).toBeLessThanOrEqual(.38);
    expect(p.update([],now+50,4/3,s,true).commands).toContainEqual({type:'tilt',value:0});
  });
  it('uses a separate hand-raise rule in seated mode',()=>{const p=calibrated(),seated={...s,dinoMode:'seated' as const};for(let i=0;i<3;i++)p.update(body(),1600+i*50,4/3,seated,true);p.update(body(0,.2),1800,4/3,seated,true);expect(p.update(body(0,.2),1850,4/3,seated,true).commands).toContainEqual({type:'jump'});expect(p.duck).toBe(false);});
  it('treats both wrists lost as invalid only for seated dino input',()=>{const p=calibrated(),points=body();points[15].visibility=0;points[16].visibility=0;expect(p.update(points,1800,4/3,{...s,dinoMode:'seated'},true).valid).toBe(false);expect(p.update(points,1850,4/3,s,true).valid).toBe(true);});
  it.each([10,20,30])('recognizes a short rise followed by a stationary apex at %i Hz with default smoothing',frequency=>{
    const p=calibrated(),settings={...defaults,frequency},step=1000/frequency;
    let now=1600;
    for(let i=0;i<4;i++)p.update(body(),now+=step,4/3,settings,true);
    const commands=[];
    for(let i=0;i<4;i++)commands.push(...p.update(body(-.045),now+=step,4/3,settings,true).commands);
    expect(commands.filter(c=>c.type==='jump')).toHaveLength(1);
    for(let i=0;i<6;i++)expect(p.update(body(-.045),now+=step,4/3,settings,true).commands).not.toContainEqual({type:'jump'});
  });
  it('rejects jitter, a single raised frame, and shoulder-only movements',()=>{
    for(const raised of [body(-.008),body(-.05).map((v,i)=>i===23||i===24?body()[i]:v)]){
      const p=calibrated();for(let i=0;i<3;i++)p.update(body(),1600+i*50,4/3,s,true);
      for(let i=0;i<5;i++)expect(p.update(raised,1800+i*50,4/3,s,true).commands).not.toContainEqual({type:'jump'});
    }
    const p=calibrated();for(let i=0;i<3;i++)p.update(body(),1600+i*50,4/3,s,true);
    expect(p.update(body(-.045),1800,4/3,s,true).commands).not.toContainEqual({type:'jump'});
    expect(p.update(body(),1850,4/3,s,true).commands).not.toContainEqual({type:'jump'});
  });
  it('cancels a partially confirmed jump after a long inference gap',()=>{
    const p=calibrated();for(let i=0;i<3;i++)p.update(body(),1600+i*50,4/3,s,true);
    p.update(body(-.045),1800,4/3,s,true);
    expect(p.update(body(-.045),2300,4/3,s,true).commands).not.toContainEqual({type:'jump'});
    expect(p.jumpArmed).toBe(false);
  });
  it('ignores an occluded high wrist when the other wrist is visible below the shoulder',()=>{
    const p=calibrated(),seated={...s,dinoMode:'seated' as const};
    for(let i=0;i<3;i++)p.update(body(),1600+i*50,4/3,seated,true);
    const points=body();points[15].y=.1;points[15].presence=0;
    for(let i=0;i<3;i++)expect(p.update(points,1800+i*50,4/3,seated,true).commands).not.toContainEqual({type:'jump'});
  });
  it('rejects non-finite and out-of-frame torso coordinates',()=>{
    for(const x of [NaN,Infinity,-.1,1.1]){const points=body();points[11].x=x;expect(calibrated().update(points,1800,4/3,s,true).valid).toBe(false);}
  });
});

