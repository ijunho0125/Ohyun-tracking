import { describe, expect, it } from 'vitest';
import { defaults, type Command } from '../src/core/types';
import { TetrisControls } from '../src/motion/tetris';
import { fixtureHand } from './hand-fixtures';
import { fixtureBody } from './pose-fixtures';

const open = () => [fixtureHand('Left'), fixtureHand('Right')];
const settings = {...defaults, smoothing:1};
function calibrated() {
  const controls = new TetrisControls();
  controls.beginCalibration();
  for (let i=0;i<30;i++) controls.update(open(), fixtureBody(), i*50, 4/3, settings);
  for (let i=0;i<4;i++) controls.update(open(), fixtureBody(), 1500+i*50, 4/3, settings);
  return controls;
}

describe('combined Tetris body and hand controls', () => {
  it.each([10,20,30,60])('rotates on the second small-jump sample at %i Hz',frequency=>{
    const controls=calibrated(),step=1000/frequency;let now=1700;
    expect(controls.update(open(),fixtureBody(-.021),now+=step,4/3,defaults).commands).not.toContainEqual({type:'rotate'});
    const commands=controls.update(open(),fixtureBody(-.021),now+=step,4/3,defaults).commands;
    expect(commands).toContainEqual({type:'rotate'});
    expect(commands).toContainEqual({type:'softDrop',value:false});
  });
  it.each([10,20,30,60])('never rotates from one large tracking spike with default smoothing at %i Hz',frequency=>{
    const controls=calibrated(),step=1000/frequency;let now=1700;
    expect(controls.update(open(),fixtureBody(-.2),now+=step,4/3,defaults).commands).not.toContainEqual({type:'rotate'});
    for(let i=0;i<12;i++)expect(controls.update(open(),fixtureBody(),now+=step,4/3,defaults).commands).not.toContainEqual({type:'rotate'});
  });
  it.each([10,20,30])('rotates once per jump and rearms after standing at %i Hz', frequency => {
    const controls = calibrated(), step = 1000/frequency;
    let now = 1700;
    const commands: Command[] = [];
    for (let i=0;i<10;i++) commands.push(...controls.update(open(), fixtureBody(-.045), now+=step, 4/3, defaults).commands);
    expect(commands.filter(c => c.type==='rotate')).toHaveLength(1);
    for (let i=0;i<8;i++) controls.update(open(), fixtureBody(), now+=step, 4/3, defaults);
    const next: Command[] = [];
    for (let i=0;i<5;i++) next.push(...controls.update(open(), fixtureBody(-.045), now+=step, 4/3, defaults).commands);
    expect(next.filter(c => c.type==='rotate')).toHaveLength(1);
    expect([...commands,...next].some(c => c.type==='jump'||c.type==='duck'||c.type==='tilt')).toBe(false);
  });

  it.each([10,20,30])('rotates once for a small jump without repeating at a held apex at %i Hz', frequency => {
    const controls=calibrated(),step=1000/frequency;let now=1700;
    for(let cycle=0;cycle<2;cycle++){
      const commands:Command[]=[];
      for(let i=0;i<16;i++)commands.push(...controls.update(open(),fixtureBody(-.021),now+=step,4/3,defaults).commands);
      expect(commands.filter(c=>c.type==='rotate')).toHaveLength(1);
      for(let i=0;i<8;i++)controls.update(open(),fixtureBody(),now+=step,4/3,defaults);
    }
  });

  it('holds soft drop while crouching, allows fist movement, and releases on standing', () => {
    const controls = calibrated();
    for (let i=0;i<8;i++) {
      const result=controls.update([fixtureHand('Left'),fixtureHand('Right','fist')], fixtureBody(.07), 1800+i*50, 4/3, settings);
      expect(result.commands).toContainEqual({type:'softDrop',value:true});
      expect(result.commands).not.toContainEqual({type:'softDrop',value:false});
      if(i===4) expect(result.commands).toContainEqual({type:'move',value:1});
    }
    expect(controls.update(open(), fixtureBody(), 2200, 4/3, settings).commands).toContainEqual({type:'softDrop',value:false});
  });

  it.each([10,20,30])('rotates again directly after crouching and releases soft drop at %i Hz',frequency=>{
    const controls=calibrated(),step=1000/frequency;let now=1700;
    for(let cycle=0;cycle<3;cycle++){
      const commands:Command[]=[];
      for(let i=0;i<8;i++){
        const frame=controls.update(open(),fixtureBody(-.021),now+=step,4/3,defaults).commands;
        if(frame.some(c=>c.type==='rotate'))expect(frame).toContainEqual({type:'softDrop',value:false});
        commands.push(...frame);
      }
      expect(commands.filter(c=>c.type==='rotate')).toHaveLength(1);
      for(let i=0;i<12;i++)controls.update(open(),fixtureBody(.07),now+=step,4/3,defaults);
      expect(controls.pose.duck).toBe(true);
    }
  });

  it('moves in each physical fist direction independently of the menu hand setting', () => {
    for(const [side,direction] of [['Left',-1],['Right',1]] as const) {
      const controls=calibrated(), commands:Command[]=[];
      const hands=[fixtureHand('Right',side==='Right'?'fist':'open'),fixtureHand('Left',side==='Left'?'fist':'open')];
      for(let i=0;i<5;i++) commands.push(...controls.update(hands,fixtureBody(),1800+i*50,4/3,{...settings,hand:'Left'}).commands);
      expect(commands.filter(c=>c.type==='move')).toEqual([{type:'move',value:direction}]);
    }
  });

  it('uses body gestures even when Dino is set to seated input', () => {
    const controls=calibrated(), seated={...settings,dinoMode:'seated' as const};
    const raised=fixtureBody();raised[15].y=.1;raised[16].y=.1;
    for(let i=0;i<4;i++) expect(controls.update(open(),raised,1800+i*50,4/3,seated).commands).not.toContainEqual({type:'rotate'});
    expect(controls.update(open(),fixtureBody(.07),2000,4/3,seated).commands).toContainEqual({type:'softDrop',value:true});
  });

  it('ignores head-only movements and single-frame body spikes', () => {
    const controls=calibrated(), head=fixtureBody();head[0].y+=.1;
    for(let i=0;i<5;i++) expect(controls.update(open(),head,1800+i*50,4/3,settings).commands).not.toContainEqual({type:'rotate'});
    expect(controls.update(open(),fixtureBody(-.045),2050,4/3,settings).commands).not.toContainEqual({type:'rotate'});
    expect(controls.update(open(),fixtureBody(),2100,4/3,settings).commands).not.toContainEqual({type:'rotate'});
  });

  it('releases on lost hands or torso and prevents an interrupted jump from completing', () => {
    for(const lost of ['hands','torso']) {
      const controls=calibrated();
      controls.update(open(),fixtureBody(-.045),1800,4/3,settings);
      const missing=controls.update(lost==='hands'?[]:open(),lost==='torso'?[]:fixtureBody(-.045),1850,4/3,settings);
      expect(missing.valid).toBe(false);
      expect(missing.commands).toEqual([{type:'softDrop',value:false}]);
      for(let i=0;i<6;i++) expect(controls.update(open(),fixtureBody(-.045),1900+i*50,4/3,settings).commands).not.toContainEqual({type:'rotate'});
    }
  });

  it('resets held drop on phase changes and requires a fresh neutral pose before rotation', () => {
    const controls=calibrated();
    controls.update(open(),fixtureBody(.07),1800,4/3,settings);
    controls.reset();
    expect(controls.pose.duck).toBe(false);
    expect(controls.hands.armed).toBe(false);
    for(let i=0;i<5;i++) expect(controls.update(open(),fixtureBody(-.045),1850+i*50,4/3,settings).commands).not.toContainEqual({type:'rotate'});
  });

  it('calibrates again after tracking loss without retaining incomplete samples', () => {
    const controls=new TetrisControls();controls.beginCalibration();
    for(let i=0;i<20;i++) controls.update(open(),fixtureBody(),i*50,4/3,settings);
    expect(controls.update([],fixtureBody(),1000,4/3,settings).progress).toBe(0);
    expect(controls.pose.samples).toHaveLength(0);
    for(let i=0;i<29;i++) expect(controls.update(open(),fixtureBody(),1050+i*50,4/3,settings).progress).toBeLessThan(1);
    expect(controls.update(open(),fixtureBody(),2500,4/3,settings).progress).toBe(1);
  });
});
