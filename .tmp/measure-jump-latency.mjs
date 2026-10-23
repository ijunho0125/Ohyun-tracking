import { readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';

async function loadModule(path, label) {
  const source = (await readFile(path, 'utf8')).replace(/^export \{ MenuSelector, HandControls, inspectHand, palmCenter \} from '\.\/hands';\r?\n/m, '');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText + `\n// ${label}`).toString('base64')}`);
}
const [{ PoseControls: Before }, { PoseControls: After }, { defaults }] = await Promise.all([
  loadModule(new URL('./gestures-before.ts', import.meta.url), 'before'),
  loadModule(new URL('../src/motion/gestures.ts', import.meta.url), 'after'),
  loadModule(new URL('../src/core/types.ts', import.meta.url), 'settings'),
]);
function body(shift=0,wrist=.8) {
  const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:1,presence:1}));
  for(const [i,x,y] of [[11,.4,.4],[12,.6,.4],[23,.42,.7],[24,.58,.7]])p[i]={x,y:y+shift,visibility:1,presence:1};
  p[15].y=p[16].y=wrist;return p;
}
function measure(Controls, frequency, mode, samples) {
  const p = new Controls(), settings={...defaults,dinoMode:mode}, step=1000/frequency;
  p.beginCalibration();
  for(let i=0;i<30;i++)p.update(body(),i*50,4/3,settings,true);
  let now=1600;
  for(let i=0;i<4;i++)p.update(body(),now+=step,4/3,settings,true);
  for(let i=0;i<samples.length;i++){
    if(p.update(samples[i],now+=step,4/3,settings,true).commands.some(c=>c.type==='jump'))return{samples:i+1,afterFirstCaptureMs:+(i*step).toFixed(1),afterLastNeutralCaptureMs:+((i+1)*step).toFixed(1)};
  }
  return null;
}
const scenarios = [
  {name:'small-jump-apex',mode:'body',samples:Array.from({length:20},()=>body(-.021))},
  {name:'gradual-early-takeoff',mode:'body',samples:[body(-.004),body(-.015),...Array.from({length:18},()=>body(-.021))]},
  {name:'seated-hand-raise',mode:'seated',samples:Array.from({length:20},()=>body(0,.3))},
  {name:'single-large-spike',mode:'body',samples:[body(-.2),...Array.from({length:19},()=>body())]},
];
const rows=scenarios.flatMap(scenario=>[10,20,30,60].map(frequency=>({scenario:scenario.name,frequency,before:measure(Before,frequency,scenario.mode,scenario.samples),after:measure(After,frequency,scenario.mode,scenario.samples)})));
await writeFile(new URL('./jump-latency-results.json',import.meta.url),JSON.stringify({note:'Synthetic landmark replay; gesture-stage delay only. afterFirstCaptureMs excludes the wait for the first captured movement frame, model inference, and game rendering.',rows},null,2)+'\n');
console.log(JSON.stringify(rows,null,2));
