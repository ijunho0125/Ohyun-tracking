import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Hand, RotateCcw, Target, Camera, Keyboard } from 'lucide-react';
import type { Character, GameId, MotionFrame, Settings } from '../core/types';
import type { CameraManager } from '../motion/camera';
import { poseMetrics, PoseControls } from '../motion/gestures';
import { inspectHand, type HandShape, type SelectionState } from '../motion/hands';
import { CameraPanel } from './CameraPanel';
import { TigerGuide } from './TigerGuide';
import { GameView, type Phase } from './GameView';
import { gameInfo } from '../games/info';
import { defaultImage } from '../games/character';
export type Cursor = {x:number;y:number;rawX:number;rawY:number;visible:boolean;tracked:boolean;shape:HandShape;state:SelectionState;progress:number;activation:number;activationTarget:string|null;label?:string};
export function tutorialAdvance(step:number, input:{tracked:boolean;shape:HandShape;armed:boolean;moved:boolean;inside:boolean;selected:boolean}) {
  if(!input.tracked)return step;
  if(step===0&&input.shape==='open'&&input.armed)return 1;
  if(step===1&&input.shape==='open'&&input.moved&&input.inside)return 2;
  if(step===2&&input.selected)return 3;
  if(step===3&&input.shape==='open'&&input.armed)return 4;
  return step;
}
export function Tutorial({settings,camera,frame,cursor,character,connect,onPhase,onStage,initialGame,done}:{settings:Settings;camera:CameraManager;frame:MotionFrame|null;cursor:Cursor;character:Character|null;connect:()=>void;onPhase:(p:Phase)=>void;onStage:(step:number)=>void;initialGame:GameId;done:()=>void}) {
  const [manualSteps,setManualSteps]=useState<number[]>([]);
  const [step,setStep]=useState(0),[game,setGame]=useState(initialGame),[practiceDone,setPracticeDone]=useState(false),[skipped,setSkipped]=useState(false),[notice,setNotice]=useState('');
  const target=useRef<HTMLButtonElement>(null),origin=useRef<{x:number;y:number}|null>(null),moved=useRef(false),startActivation=useRef(cursor.activation);
  const names=['손 보여주기','커서 이동','주먹으로 선택','손 펴기','게임 조작 연습'];
  useEffect(()=>{onStage(step);if(step<4){onPhase('setup');camera.setMode('hand');}origin.current=null;moved.current=false;startActivation.current=cursor.activation;setNotice('');},[step]);
  useEffect(()=>{
    if(step>=4)return;
    if(cursor.tracked&&step===1){if(!origin.current)origin.current={x:cursor.x,y:cursor.y};else if(Math.hypot(cursor.x-origin.current.x,cursor.y-origin.current.y)>35)moved.current=true;}
    const b=target.current?.getBoundingClientRect(),inside=!!b&&cursor.x>=b.left&&cursor.x<=b.right&&cursor.y>=b.top&&cursor.y<=b.bottom;
    const armed=['moving','hovering','ready'].includes(cursor.state);
    const selected=cursor.activation>startActivation.current&&cursor.activationTarget==='tutorial-fist-target';
    const next=tutorialAdvance(step,{tracked:cursor.tracked,shape:cursor.shape,armed,moved:moved.current,inside,selected});
    if(next!==step)setStep(next);
  },[cursor,step]);
  const nextStep=()=>{setManualSteps(v=>v.includes(step)?v:[...v,step]);setSkipped(true);setStep(v=>Math.min(4,v+1));};
  const replay=()=>{setManualSteps([]);setStep(0);setSkipped(false);setPracticeDone(false);};
  const messages=['안녕! 손을 펴서 카메라에 보여줘.','손바닥을 움직여 빛나는 카드 위로 커서를 옮겨봐.','카드 위에서 잠깐 멈춘 뒤 주먹을 쥐어봐.','잘했어! 손을 펴면 다시 선택할 수 있어.','이제 선택한 게임의 조작을 연습해보자.'];
  const retry=step<4&&camera.status==='ready'&&!cursor.tracked;
  if(step===5)return <section className="tutorial-finished panel"><TigerGuide mood="success">{skipped?'게임 연습을 마쳤어. 손 조작은 나중에 다시 연습해도 좋아.':'손 조작과 게임 연습을 모두 마쳤어. 이제 함께 놀아볼까?'}</TigerGuide><h1>플레이할 준비 완료</h1><p>{skipped?'일부 손 안내는 직접 넘겼어요.':'실제 손 입력으로 네 가지 안내를 완료했어요.'} 게임 연습에서는 직접 조작한 결과를 확인했어요.</p><div className="button-row"><button data-hand data-palm-next data-hand-id="tutorial-done" className="primary" onClick={done}>게임 로비로<ArrowRight size={20}/></button><button data-hand className="small-button" onClick={replay}><RotateCcw size={18}/>다시 연습</button></div></section>;
  return <><div className="page-heading"><div><h1>호랑이와 함께, 하나씩</h1><p>동작으로 연습하거나 손바닥 커서로 다음 안내를 선택해요.</p></div><button data-hand className="small-button" onClick={replay}><RotateCcw size={18}/>다시 설명 보기</button></div>
    <ol className="tutorial-steps">{names.map((name,i)=><li key={name} className={i===step?'current':i<step?'past':''} aria-current={i===step?'step':undefined}><span>{i<step?<Check size={18}/>:i+1}</span>{name}{i<step&&(manualSteps.includes(i)||skipped&&step===4&&manualSteps.length===0)&&<small>직접 넘김</small>}</li>)}</ol>
    <TigerGuide mood={practiceDone?'success':retry?'retry':step===3?'success':'guide'}>{retry?'손 전체가 보이게 해줘. 손을 편 뒤 다시 시도해봐.':messages[step]}</TigerGuide>
    {step<4?<div className="tutorial-layout"><section className="panel exercise" data-tutorial-step={step}><h2>{names[step]}</h2><p>{step===0?'설정한 조작 손을 펴주세요. 손목부터 손가락 끝까지 보여야 해요.':step===1?'손가락 끝 대신 손바닥 중심이 커서를 움직여요.':step===2?'주먹을 유지해도 선택은 한 번만 실행돼요.':'주먹을 천천히 펴주세요. 다음 선택을 준비해요.'}</p>
      {step===0?<div className="open-hand-demo"><Hand size={72}/><span>{settings.hand==='Right'?'오른손':'왼손'}을 보여주세요</span></div>:<button ref={target} data-hand={step===1||step===2?true:undefined} data-hand-id="tutorial-fist-target" className={`tutorial-target ${step===3?'complete':''}`} onClick={()=>setNotice('이 단계는 실제 손 동작으로 확인해요. 카메라가 없으면 아래에서 건너뛸 수 있어요.')}><span>{step===3?<Check size={42}/>:<Target size={42}/>}</span><strong>{step===1?'이 카드로 이동':step===2?'주먹으로 선택':'선택 완료 · 손을 펴주세요'}</strong></button>}
      <p className="exercise-result" role="status">{notice|| (camera.status==='ready'?retry?'손이 가려졌어요. 손 전체를 보여주세요.':'카메라의 실제 손 입력을 기다리고 있어요.':'카메라를 연결하거나 손 조작 안내를 건너뛰세요.')}</p>{camera.status!=='ready'&&<button data-hand className="primary" onClick={connect}><Camera size={20}/>카메라 연결</button>}</section><CameraPanel camera={camera} frame={frame} connect={connect}/></div>:<><div className="practice-game-choice" aria-label="연습할 게임">{(['dino','tetris','balance'] as const).map(id=><button data-hand key={id} className={`small-button ${game===id?'active':''}`} onClick={()=>{setGame(id);setPracticeDone(false);}}>{gameInfo[id].name}</button>)}</div><GameView key={game} id={game} settings={settings} camera={camera} frame={frame} character={character} connect={connect} back={done} editCharacter={done} onPhase={onPhase} onPracticeComplete={()=>setPracticeDone(true)}/></>}
    <div className="tutorial-footer"><span>{step<4?'다음 버튼 위에 손바닥 커서를 0.9초 올려두면 넘어가요.':practiceDone?'연습 마치기도 손바닥 커서로 선택할 수 있어요.':'조작 준비하기를 누르고 연습 체크를 채워주세요.'}</span><div className="button-row"><button data-hand className="text-button" onClick={done}>나중에 연습하기</button>{step<4?<><button data-hand className="text-button" onClick={()=>{setSkipped(true);setManualSteps([0,1,2,3]);setStep(4);}}>손 안내 건너뛰기</button><button data-hand data-palm-next data-hand-id="tutorial-next" className="primary tutorial-next" onClick={nextStep}>다음<ArrowRight size={20}/></button></>:<button data-hand data-palm-next data-hand-id="tutorial-finish" className="primary" disabled={!practiceDone} onClick={()=>setStep(5)}>연습 마치기<Check size={18}/></button>}</div></div>
  </>;
}

export function Lab({camera,frame,settings,apply,connect}:{camera:CameraManager;frame:MotionFrame|null;settings:Settings;apply:(s:Settings)=>void;connect:()=>void}) {
  const [tab,setTab]=useState('tracking');
  const [mode,setMode]=useState<'hand'|'pose'>('hand'),[smooth,setSmooth]=useState(settings.smoothing),[filtered,setFiltered]=useState<{x:number;y:number}|null>(null),[sx,setSx]=useState(1),[sy,setSy]=useState(1),[applied,setApplied]=useState(false),[progress,setProgress]=useState(0),[baseline,setBaseline]=useState<ReturnType<typeof poseMetrics>>(null);
  const pose=useRef(new PoseControls());
  useEffect(()=>{camera.setMode(mode);setFiltered(null);return()=>camera.setMode('hand');},[mode]);
  const info=inspectHand(frame?.hands.find(h=>h.side===settings.hand),frame?frame.width/frame.height:4/3),point=info.palm,metrics=frame?poseMetrics(frame.pose,frame.width/frame.height):null;
  useEffect(()=>{if(point)setFiltered(v=>v?{x:v.x+smooth*((1-point.x)-v.x),y:v.y+smooth*(point.y-v.y)}:{x:1-point.x,y:point.y});else setFiltered(null);if(mode==='pose'&&frame&&pose.current.calibrating){const result=pose.current.update(frame.pose,frame.time,frame.width/frame.height,{...settings,dinoMode:'body'},true);setProgress(result.progress);setBaseline(pose.current.baseline);}},[frame,smooth]);
  return <><div className="page-heading"><div><h1>움직임이 게임이 되는 과정</h1><p>AI의 위치 추정과 프로그램의 동작 판정을 구분해 살펴봐요.</p></div><div className="view-tabs"><button data-hand className={tab==="tracking"?"active":""} onClick={()=>setTab("tracking")}>모션 추적</button><button data-hand className={tab==="drawing"?"active":""} onClick={()=>setTab("drawing")}>그림 움직임</button></div></div><TigerGuide>AI는 관절의 위치를 찾아. 프로그램은 손가락의 굽힘과 시간을 보고 주먹인지 판단하지.</TigerGuide>
    <div className="lab-grid" hidden={tab!=="tracking"}><div><CameraPanel camera={camera} frame={frame} connect={connect} large/><div className="panel lab-mode"><span>인식할 움직임</span><div className="segmented"><button data-hand className={mode==='hand'?'active':''} onClick={()=>setMode('hand')}>손</button><button data-hand className={mode==='pose'?'active':''} onClick={()=>setMode('pose')}>몸</button></div></div></div><section className="panel experiment"><h2>좌표에서 동작으로</h2>{mode==='hand'?<><div className="metric-pair"><div><span>접힌 손가락</span><strong>{point?`${info.curled} / 4`:'—'}</strong></div><div><span>현재 규칙 판정</span><strong>{({open:'펴짐',fist:'주먹',closing:'접는 중',unknown:'손 대기'})[info.shape]}</strong></div></div><p>손목과 네 손가락의 뿌리 관절 평균이 손바닥 중심이에요. 세 손가락 이상의 굽힘을 확인하고 연속 프레임과 유지 시간을 적용해요.</p><div className="coordinate-table"><span>AI가 찾은 손바닥 중심</span><code>{point?`x ${point.x.toFixed(3)} / y ${point.y.toFixed(3)}`:'—'}</code><span>반전·보정한 좌표</span><code>{filtered?`x ${filtered.x.toFixed(3)} / y ${filtered.y.toFixed(3)}`:'—'}</code><span>현재 선택 규칙</span><strong>{settings.fistFrames}프레임 · {settings.fistHoldMs}ms</strong></div><label>좌표 보정 계수 {smooth.toFixed(2)}<input type="range" min=".1" max=".9" step=".05" value={smooth} onChange={e=>{setSmooth(+e.target.value);setApplied(false);}}/></label><div className="coordinate-preview">{point&&<i className="raw-dot" style={{left:`${(1-point.x)*100}%`,top:`${point.y*100}%`}}/>}{filtered&&<i className="smooth-dot" style={{left:`${filtered.x*100}%`,top:`${filtered.y*100}%`}}/>}<span>○ 원래 중심　● 보정 중심</span></div><button data-hand className="small-button" onClick={()=>{apply({...settings,smoothing:smooth});setApplied(true);}}>{applied?<Check size={18}/>:<ArrowRight size={18}/>}게임 설정에 적용</button></>:<><p>어깨와 골반의 높이 변화로 점프를, 두 중심의 상대 위치로 상체 기울기를 추정해요.</p><div className="coordinate-table"><span>현재 어깨 높이</span><code>{metrics?.shoulderY.toFixed(3)??'—'}</code><span>기준 어깨 높이</span><code>{baseline?.shoulderY.toFixed(3)??'보정 전'}</code><span>몸통 길이로 나눈 상승량</span><code>{baseline&&metrics?((baseline.shoulderY-metrics.shoulderY)/baseline.size).toFixed(3):'—'}</code><span>기준 대비 상체 기울기</span><code>{baseline&&metrics?(metrics.lean-baseline.lean).toFixed(3):'—'}</code></div><button data-hand className="small-button" onClick={()=>{pose.current.beginCalibration();setProgress(0);setBaseline(null);}}>중립 자세 보정</button><progress max="1" value={progress}/><p className="subtle">높이 변화, 상승 방향, 연속 프레임, 기준 자세 복귀를 함께 확인해요. 실제 점프 높이나 무게중심을 정밀하게 측정하는 기능은 아니에요.</p></>}<div className="inference-stat"><span>모델 처리 시간</span><strong>{frame&&camera.status==='ready'?frame.inferenceMs.toFixed(1)+' ms':'측정 대기'}</strong></div></section></div>
    <div className="pipeline"><span><Camera size={24}/>카메라 영상</span><ArrowRight/><span><Target size={24}/>AI의 관절 위치 추정</span><ArrowRight/><span><Hand size={24}/>좌표와 시간으로 동작 판정</span><ArrowRight/><span><Keyboard size={24}/>게임 명령</span></div>
    <section className="panel squash-lab" hidden={tab!=="drawing"}><div><h2>그림 한 장의 움직임</h2><p>발 기준점을 고정하고 가로·세로 비율을 바꿔봐요.</p><label>가로 비율 {sx.toFixed(2)}<input type="range" min=".6" max="1.5" step=".01" value={sx} onChange={e=>setSx(+e.target.value)}/></label><label>세로 비율 {sy.toFixed(2)}<input type="range" min=".5" max="1.5" step=".01" value={sy} onChange={e=>setSy(+e.target.value)}/></label></div><div className="squash-character checker"><img src={defaultImage().src} alt="비율 변형 체험용 병아리 캐릭터" style={{transform:`scale(${sx},${sy})`}}/><i/></div></section><p className="subtle lab-note">사전 학습된 MediaPipe 모델을 사용해요. 실험의 보정 계수는 ‘게임 설정에 적용’을 눌러야 저장돼요.</p>
  </>;
}
