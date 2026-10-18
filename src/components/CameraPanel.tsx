import { useEffect, useId, useRef, useState } from 'react';
import { Camera, CameraOff, Maximize2, RefreshCw, ChevronUp, ChevronDown } from 'lucide-react';
import type { CameraManager } from '../motion/camera';
import type { MotionFrame } from '../core/types';
import { inspectHand } from '../motion/hands';
import { isDrawableLandmark } from '../motion/landmarks';
import { headPitch } from '../motion/nod';
import { Modal } from './Modal';
export const HAND_CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
export const POSE_CONNECTIONS = [[0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],[9,10],[11,12],[11,13],[13,15],[15,17],[15,19],[15,21],[17,19],[12,14],[14,16],[16,18],[16,20],[16,22],[18,20],[11,23],[12,24],[23,24],[23,25],[25,27],[27,29],[29,31],[27,31],[24,26],[26,28],[28,30],[30,32],[28,32]];
export const FRAME_MAX_AGE = 650;
export function landmarkPixel(p: {x:number;y:number}, width:number, height:number) { return {x:p.x*width,y:p.y*height}; }

function Preview({camera,frame,tracking,fresh}:{camera:CameraManager;frame:MotionFrame|null;tracking:boolean;fresh:boolean}) {
  const video = useRef<HTMLVideoElement>(null), overlay = useRef<HTMLCanvasElement>(null);
  const [dimensions,setDimensions] = useState({width:640,height:480});
  useEffect(() => {
    const v=video.current!;
    const measure=()=>{if(v.videoWidth&&v.videoHeight)setDimensions({width:v.videoWidth,height:v.videoHeight});};
    v.addEventListener('loadedmetadata',measure);v.addEventListener('resize',measure);
    v.srcObject=camera.stream;if(camera.stream)void v.play().catch(()=>{});measure();
    return()=>{v.removeEventListener('loadedmetadata',measure);v.removeEventListener('resize',measure);v.srcObject=null;};
  },[camera.stream]);
  const width=frame?.width||dimensions.width,height=frame?.height||dimensions.height;
  useEffect(()=>{
    const c=overlay.current!,ctx=c.getContext('2d')!;ctx.clearRect(0,0,c.width,c.height);
    if(!frame||!fresh||!tracking||camera.status!=='ready')return;
    const draw=(points:MotionFrame['pose'],connections:number[][],color:string,kind:'hand'|'pose')=>{
      const visible=(i:number)=>(kind==='hand'||camera.mode!=='tetris'||i<=12)&&isDrawableLandmark(points[i],kind);
      const unit=Math.max(1,width/640);ctx.lineCap='round';ctx.lineJoin='round';
      for(const [a,b] of connections){if(!visible(a)||!visible(b))continue;const p=landmarkPixel(points[a],width,height),q=landmarkPixel(points[b],width,height);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.strokeStyle='#282120';ctx.lineWidth=5*unit;ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=2.5*unit;ctx.stroke();}
      points.forEach((p,i)=>{if(!visible(i))return;const pos=landmarkPixel(p,width,height);ctx.beginPath();ctx.arc(pos.x,pos.y,3.5*unit,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#282120';ctx.lineWidth=1.5*unit;ctx.stroke();});
    };
    frame.hands.filter(h=>h.confidence>=.65).forEach(h=>draw(h.points,HAND_CONNECTIONS,h.side===camera.settings.hand?'#fd7122':'#f3e9d2','hand'));
    if(frame.pose.length)draw(frame.pose,POSE_CONNECTIONS,'#fd7122','pose');
  },[frame,fresh,tracking,camera.status,camera.settings.hand,width,height]);
  return <div className="camera-screen" style={{aspectRatio:`${width} / ${height}`}}>
    <video ref={video} muted playsInline aria-label="좌우 반전된 카메라 영상"/><canvas ref={overlay} width={width} height={height} aria-label="실제 인식 관절점과 연결선"/>
    {camera.status!=='ready'&&<div className="camera-empty"><CameraOff size={30}/><strong>{camera.status==='loading'?'인식 모델 준비 중':camera.status==='requesting'?'카메라 권한을 기다려요':'카메라 연결 대기'}</strong><p>{camera.message||'내 손과 몸의 움직임을 여기서 확인해요.'}</p></div>}
    {camera.status==='ready'&&<span className={`camera-badge ${fresh?'':'tracking-lost'}`}>{fresh?(camera.mode==='tetris'?'손·고개 인식 중':camera.mode==='hand'?(frame?.hands.length?'손 인식 중':'손을 찾는 중'):(frame?.pose.length?'몸 인식 중':'몸을 찾는 중')):'인식 중단 · 자세를 확인해주세요'}</span>}
  </div>;
}
export function CameraPanel({camera,frame,connect,large=false,compact=false}:{camera:CameraManager;frame:MotionFrame|null;connect:()=>void;large?:boolean;compact?:boolean}) {
  const [collapsed,setCollapsed]=useState(false),bodyId=useId();
  const [tracking,setTracking]=useState(true),[expanded,setExpanded]=useState(false),[now,setNow]=useState(()=>performance.now());
  useEffect(()=>{
    if(!frame||camera.status!=='ready')return;
    const timer=window.setTimeout(()=>setNow(performance.now()),Math.max(0,FRAME_MAX_AGE-(performance.now()-frame.time)));
    return()=>clearTimeout(timer);
  },[frame,camera.status]);
  const fresh=!!frame&&camera.status==='ready'&&Math.max(now,performance.now())-frame.time<FRAME_MAX_AGE;
  const hand=fresh?frame.hands.find(h=>h.side===camera.settings.hand):undefined,shape=inspectHand(hand,frame?frame.width/frame.height:4/3).shape;
  const detectedHands=fresh?[...new Set(frame.hands.map(h=>h.side==='Right'?'오른손':'왼손'))].join('·'):'';
  const poseVisible=fresh&&[11,12,23,24].every(i=>frame.pose[i]&&(frame.pose[i].visibility??1)>=.55&&(frame.pose[i].presence??1)>=.55);
  const faceVisible=fresh&&headPitch(frame.pose,frame.width/frame.height)!==null;
  const hint=camera.status!=='ready'?'밝은 곳에서 카메라를 연결해주세요.':camera.mode==='tetris'?faceVisible&&frame?.hands.length===2?'얼굴·양손 인식 중':'얼굴과 양손을 보여주세요.':camera.mode==='pose'?poseVisible?'어깨와 골반을 찾았어요. 편하게 움직여보세요.':'몸 전체가 보이게 카메라에서 조금 떨어져주세요.':compact?(fresh&&frame.hands.length===2?'양손 인식 중':'양손 전체를 보여주세요.'):shape==='unknown'?`${camera.settings.hand==='Right'?'오른손':'왼손'} 전체가 보이게 해주세요.`:shape==='open'?'손 인식 중 · 카드를 가리킨 뒤 주먹을 쥐세요.':'손을 펴주세요. 다음 선택을 준비할 수 있어요.';
  const content=<>
    <Preview camera={camera} frame={frame} tracking={tracking} fresh={fresh}/><p className="tracking-hint" role="status">{hint}</p>
    {camera.status==='ready'&&camera.mode==='hand'&&<p className="privacy-note detected-hands">감지된 손: {detectedHands||'없음'} · 조작 손: {camera.settings.hand==='Right'?'오른손':'왼손'}</p>}
    <div className="camera-tools">{(!compact||camera.status==='ready')&&<><label className="inline-check"><input type="checkbox" checked={tracking} onChange={e=>setTracking(e.target.checked)}/>관절 표시</label><button data-hand className="small-button" onClick={()=>setExpanded(true)}><Maximize2 size={20}/>확대</button></>}{!['ready','requesting','loading'].includes(camera.status)&&<button data-hand className="small-button" onClick={connect}><RefreshCw size={20}/>연결</button>}</div>
    {!compact&&<p className="privacy-note">영상은 이 기기에서만 처리해요. 녹화·업로드하지 않아요.</p>}
  </>;
  return <section className={`camera-panel ${large?'large':''} ${compact?'compact':''} ${collapsed?'collapsed':''}`} aria-label="카메라 확인 영역">
    <div className="panel-heading"><span><Camera size={20}/>내 움직임 확인</span>{!compact&&<span className="tiny-status">{camera.status==='ready'?'연결됨':'연결 대기'}</span>}{compact&&<button data-hand className="camera-fold" aria-expanded={!collapsed} aria-controls={bodyId} aria-label={collapsed?'카메라 펼치기':'카메라 접기'} onClick={()=>setCollapsed(v=>!v)}>{collapsed?<ChevronDown size={20}/>:<ChevronUp size={20}/>}<span>{collapsed?'펼치기':'접기'}</span></button>}</div>
    {compact?<div className="camera-body" id={bodyId} hidden={collapsed}>{content}</div>:content}
    <Modal open={expanded} onClose={()=>setExpanded(false)} title="카메라 크게 보기" wide><Preview camera={camera} frame={frame} tracking={tracking} fresh={fresh}/><p className="tracking-hint">{hint}</p><label className="inline-check"><input type="checkbox" checked={tracking} onChange={e=>setTracking(e.target.checked)}/>관절 표시 켜기</label></Modal>
  </section>;
}

