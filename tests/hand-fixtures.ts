import type { Hand } from '../src/core/types';
export function fixtureHand(side:'Left'|'Right'='Right',state:'open'|'fist'|'index'|'two'|'pinch'='open'):Hand {
  const points=Array.from({length:21},()=>({x:.5,y:.5}));
  points[0]={x:.5,y:.8};points[1]={x:.42,y:.76};points[2]={x:.36,y:.7};points[3]={x:.31,y:.64};points[4]={x:.27,y:.59};
  const bases=[{x:.41,y:.62},{x:.48,y:.59},{x:.55,y:.61},{x:.62,y:.66}];
  [5,9,13,17].forEach((i,k)=>{
    const b=bases[k],curled=state==='fist'||state==='index'&&k===0||state==='two'&&k<2;
    points[i]={...b};
    points[i+1]={x:b.x,y:b.y-(curled?.055:.09)};
    points[i+2]={x:b.x+(curled?.025:0),y:b.y+(curled?.005:-.16)};
    points[i+3]={x:b.x+(curled?.01:0),y:b.y+(curled?.055:-.22)};
  });
  if(state==='pinch')points[4]={...points[8]};
  // Match real Tasks Vision output, including default visibility=0.
  return {side,points:points.map(p=>({...p,visibility:0})),confidence:.99};
}
export function translateHand(hand:Hand,x:number,y=0):Hand {return {...hand,points:hand.points.map(p=>({...p,x:p.x+x,y:p.y+y}))};}
export function rollHand(hand:Hand,angle:number):Hand {
  const wrist=hand.points[0],cos=Math.cos(angle),sin=Math.sin(angle);
  return {...hand,points:hand.points.map(p=>({...p,x:wrist.x+(p.x-wrist.x)*cos-(p.y-wrist.y)*sin,y:wrist.y+(p.x-wrist.x)*sin+(p.y-wrist.y)*cos}))};
}
