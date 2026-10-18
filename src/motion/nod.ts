import type { Command, Landmark } from '../core/types';

/** Nose position relative to the eye line: translation, scale and modest head
 * roll cancel out. This is a gesture estimate, not a measured neck angle. */
export function headPitch(points: Landmark[], aspect: number): number | null {
  const indices=[0,2,5,7,8];
  if(!Number.isFinite(aspect)||aspect<=0||indices.some(i=>!points[i]||!Number.isFinite(points[i].x)||!Number.isFinite(points[i].y)||(points[i].visibility??1)<.55||(points[i].presence??1)<.55||points[i].x<.01||points[i].x>.99||points[i].y<.01||points[i].y>.99))return null;
  const [nose,left,right,earLeft,earRight]=indices.map(i=>points[i]);
  const dx=(right.x-left.x)*aspect,dy=right.y-left.y,span=Math.hypot(dx,dy);
  if(span<.035||span>.4||Math.abs(dy)>Math.abs(dx)*.55||Math.hypot((earRight.x-earLeft.x)*aspect,earRight.y-earLeft.y)<span*1.1)return null;
  let vx=-dy/span,vy=dx/span;if(vy<0){vx=-vx;vy=-vy;}
  const nx=(nose.x-(left.x+right.x)/2)*aspect,ny=nose.y-(left.y+right.y)/2;
  if(Math.abs((nx*dx+ny*dy)/(span*span))>.65)return null;
  const pitch=(nx*vx+ny*vy)/span;
  return pitch>=-.2&&pitch<=1.4?pitch:null;
}

export class NodControls {
  baseline: number | null = null; samples: number[] = []; lastTime = 0;
  neutralRequired = false; neutralFrames = 0;
  stage: 'neutral' | 'down' = 'neutral'; downSince = 0; downFrames = 0; returnFrames = 0; cooldownUntil = 0;
  reset() { this.baseline=null;this.samples=[];this.lastTime=0;this.cancel();this.cooldownUntil=0;this.neutralRequired=false;this.neutralFrames=0; }
  cancel() { this.stage='neutral';this.downSince=0;this.downFrames=0;this.returnFrames=0; }
  update(points: Landmark[], now: number, aspect: number, enabled=true): {valid:boolean;ready:boolean;commands:Command[]} {
    const pitch=headPitch(points,aspect);
    if(pitch===null){this.reset();return{valid:false,ready:false,commands:[]};}
    if(this.lastTime&&now-this.lastTime>400)this.reset();this.lastTime=now;
    if(this.baseline===null){
      if(this.samples.length&&Math.abs(pitch-this.samples[this.samples.length-1])>.08)this.samples=[];
      this.samples.push(pitch);
      if(this.samples.length>=8){const sorted=[...this.samples].sort((a,b)=>a-b);this.baseline=sorted[Math.floor(sorted.length/2)];}
      return{valid:true,ready:this.baseline!==null,commands:[]};
    }
    const delta=pitch-this.baseline;
    if(!enabled){this.cancel();this.neutralRequired=true;this.neutralFrames=0;return{valid:true,ready:true,commands:[]};}
    if(this.neutralRequired){if(Math.abs(delta)<.045){if(++this.neutralFrames>=2)this.neutralRequired=false;}else this.neutralFrames=0;return{valid:true,ready:true,commands:[]};}
    if(now<this.cooldownUntil){this.cancel();if(Math.abs(delta)>.045)this.neutralRequired=true;return{valid:true,ready:true,commands:[]};}
    if(this.stage==='neutral'){
      if(delta>.10){if(!this.downFrames)this.downSince=now;this.downFrames++;if(this.downFrames>=2&&now-this.downSince>=60)this.stage='down';}
      else {this.downFrames=0;if(Math.abs(delta)<.06)this.baseline+=delta*.015;}
    }else{
      if(now-this.downSince>1400){this.cancel();this.cooldownUntil=now+400;this.neutralRequired=true;this.neutralFrames=0;}
      else if(Math.abs(delta)<.045){this.returnFrames++;if(this.returnFrames>=2&&now-this.downSince>=150){this.cancel();this.cooldownUntil=now+600;return{valid:true,ready:true,commands:[{type:'rotate'}]};}}
      else this.returnFrames=0;
    }
    return{valid:true,ready:true,commands:[]};
  }
}
