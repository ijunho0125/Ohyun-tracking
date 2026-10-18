import type {Landmark} from '../src/core/types';
export function fixtureFace(noseShift=0,translation=0,scale=1,roll=0): Landmark[] {
 const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:0,presence:0}));
 const points: Record<number,[number,number]>={0:[.5,.35+noseShift],2:[.45,.3],5:[.55,.3],7:[.39,.32],8:[.61,.32]};
 for(const [index,[x,y]] of Object.entries(points)){const dx=(x-.5)*4/3*scale,dy=(y-.35)*scale;p[+index]={x:.5+(dx*Math.cos(roll)-dy*Math.sin(roll))/(4/3),y:.35+translation+dx*Math.sin(roll)+dy*Math.cos(roll),visibility:1,presence:1};}
 return p;
}
