import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Pause, Play, RotateCcw, Flag, Keyboard, ScanLine, Check, PersonStanding, Maximize2, Minimize2, Volume2, VolumeX, MoveHorizontal } from 'lucide-react';
import type { Character, Command, GameEvent, GameId, MotionFrame, Settings } from '../core/types';
import type { CameraManager } from '../motion/camera';
import { PoseControls } from '../motion/gestures';
import { SourceGame, sourceDocument } from '../games/source-games';
import { bestScore, recordScore } from '../core/storage';
import { CameraPanel } from './CameraPanel';
import { gameAudio } from '../games/audio';
import { TetrisControls } from '../motion/tetris';
import { gameInfo } from '../games/info';
export type Phase = 'setup' | 'calibration' | 'practice' | 'countdown' | 'running' | 'paused' | 'over';
export function GameView({ id,settings,frame,camera,character,connect,back,editCharacter,onPhase,onActivity = ()=>{},onPracticeComplete, immersive=false }: { id:GameId;settings:Settings;frame:MotionFrame|null;camera:CameraManager;character:Character|null;connect:()=>void;back:()=>void;editCharacter:()=>void;onPhase:(p:Phase)=>void;onActivity?:(c:Command)=>void;onPracticeComplete?:()=>void;immersive?:boolean }) {
  const [phase,setPhase]=useState<Phase>('setup'), [score,setScore]=useState(0), [reason,setReason]=useState(''), [count,setCount]=useState(3), [progress,setProgress]=useState(0), [feedback,setFeedback]=useState('조작을 준비해주세요'), [achievements,setAchievements]=useState<string[]>([]), [inputMode,setInputMode]=useState<'motion'|'keyboard'>(camera.status==='ready'?'motion':'keyboard');
  const [loaded,setLoaded]=useState(false),[loadError,setLoadError]=useState(false),[difficulty,setDifficulty]=useState('EASY'),[scene,setScene]=useState('day'),[sound,setSound]=useState(true),[soundBlocked,setSoundBlocked]=useState(false),[cameraSide,setCameraSide]=useState<'left'|'right'>('right'),[fullscreen,setFullscreen]=useState(!!document.fullscreenElement),[showBalanceGuide,setShowBalanceGuide]=useState(false);
  const [leaderboardOpen,setLeaderboardOpen]=useState(false), [leaderboardMode,setLeaderboardMode]=useState('EASY'), [leaderboard,setLeaderboard]=useState<{name:string;score:number;date:string}[]>([]), [playerName,setPlayerName]=useState(''), [canSaveScore,setCanSaveScore]=useState(false), [scoreSaved,setScoreSaved]=useState(false);
  const source=useMemo(()=>sourceDocument(id),[id]);
  const pose=useRef(new PoseControls()), tetris=useRef(new TetrisControls()), phaseRef=useRef(phase), lastValid=useRef(0), countdownStart=useRef(0), resume=useRef(false), keys=useRef(new Set<string>()), balanceCenter=useRef(0), actionSet=useRef(new Set<string>()), live=useRef(true);
  const settingsRef=useRef(settings); settingsRef.current=settings; phaseRef.current=phase;
  const changePhase=(next:Phase)=>{phaseRef.current=next;setPhase(next);};
  const motionHandler=useRef<(next:MotionFrame)=>void>(()=>{});
  // Retries recalibrate before countdown; initial setup still leads to practice.
  const calibrationNext=useRef<'practice'|'countdown'>('practice'), trackingValid=useRef(false), trackingStarted=useRef(0);
  const controlPhase=useRef({phase,inputMode});
  const keyboardChosen=useRef(false);
  const chooseInput=(mode:'motion'|'keyboard')=>{keyboardChosen.current=mode==='keyboard';setInputMode(mode);};
  useEffect(()=>{if(camera.status==='ready'&&phase==='setup'&&!keyboardChosen.current)setInputMode('motion');},[camera.status,phase]);
  const scoreId=id==='balance'?'runner-walk':id;
  const event=(e:GameEvent)=>{ if(!live.current)return; if(e.type==='score')setScore(e.score); if(e.type==='over'){setCanSaveScore(id==='tetris'&&phaseRef.current==='running'&&game.api?.snapshot().state==='gameover');setScoreSaved(false);setPlayerName('');recordScore(scoreId,e.score);setScore(e.score);changePhase('over');} };
  const game=useMemo(()=>{
    return new SourceGame(id,settings,event);
  },[id]);
  const mark=(key:string)=>{if(!actionSet.current.has(key)){actionSet.current.add(key);setAchievements([...actionSet.current]);}};
  const command=(c:Command)=>{
    if(phaseRef.current!=='running'&&phaseRef.current!=='practice')return;
    if(id==='balance'&&c.type!=='tilt')return;
    game.command(c); onActivity(c);
    if(c.type==='jump'){setFeedback('점프 인식됨');mark('jump');}
    if(c.type==='duck'&&c.value){setFeedback('숙이기 인식됨');mark('duck');}
    if(c.type==='move'){setFeedback(c.value<0?'왼쪽으로 이동':'오른쪽으로 이동');mark(c.value<0?'left':'right');}
    if(c.type==='rotate'){setFeedback('회전 인식됨');mark('rotate');}
    if(c.type==='hardDrop'){setFeedback('즉시 낙하 인식됨');mark('drop');}
    if(c.type==='softDrop'&&c.value){setFeedback('소프트 드롭 인식됨');mark('softDrop');}
    if(c.type==='tilt'&&Math.abs(c.value)>.06)mark('tilt');
  };
  const pause=(message='잠깐 쉬어가요')=>{if(!['running','practice','countdown'].includes(phaseRef.current))return;game.pause();game.release();keys.current.clear();pose.current.reset();tetris.current.reset();countdownStart.current=0;setReason(message);changePhase('paused');};
  const startPractice=()=>{if(game.state==='paused')game.resume();else{if(game.state==='over')game.restart();game.start();}lastValid.current=performance.now();changePhase('practice');};
  useEffect(()=>{live.current=true;gameAudio.ensure(id);return()=>{live.current=false;game.dispose();gameAudio.stop();};},[game]);
  useEffect(()=>{
    gameAudio.setEnabled(sound);
    if(['paused','over'].includes(phase)){if(game instanceof SourceGame)game.api?.sound(false);gameAudio.pause();return;}
    if(game instanceof SourceGame)game.api?.sound(sound,gameAudio.context??undefined,gameAudio.output??undefined);
    if(sound)void gameAudio.resume().then(ready=>{if(live.current)setSoundBlocked(!ready);});else setSoundBlocked(false);
  },[game,phase,sound,loaded]);
  const enableSound=()=>{gameAudio.setEnabled(true);setSound(true);if(['paused','over'].includes(phaseRef.current)){setSoundBlocked(false);return;}void gameAudio.resume().then(ready=>{if(live.current)setSoundBlocked(!ready);});if(game instanceof SourceGame)game.api?.sound(true,gameAudio.context??undefined,gameAudio.output??undefined);};
  useEffect(()=>{if(game instanceof SourceGame){game.settings=settings;game.mode=difficulty;game.scene=scene;game.motion=inputMode==='motion';game.configure();if(game.visual)game.visual.strength=settings.strength;}},[settings,game,difficulty,scene,inputMode]);
  useEffect(()=>{let wasFullscreen=!!document.fullscreenElement;const changed=()=>{const active=!!document.fullscreenElement;setFullscreen(active);if(wasFullscreen&&!active)pause('전체화면을 해제해 게임을 멈췄어요.');wasFullscreen=active;};document.addEventListener('fullscreenchange',changed);return()=>document.removeEventListener('fullscreenchange',changed);},[]);
  const toggleFullscreen=()=>{if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});else void document.documentElement.requestFullscreen?.().catch(()=>{});};
  useEffect(()=>{
    if(!(game instanceof SourceGame)||id!=='dino')return;
    if(!character){game.visual=null;return;}
    let active=true;const url=URL.createObjectURL(character.processed), image=new Image();image.onload=()=>{if(active)game.visual={image,flip:character.flip,footX:character.footX,footY:character.footY,size:character.size,strength:settingsRef.current.strength};};image.src=url;return()=>{active=false;URL.revokeObjectURL(url);};
  },[character,game]);
  useLayoutEffect(()=>{
    const was=controlPhase.current;
    // Countdown already observes neutral poses. Keep that preparation at GO.
    const prepared=was.phase==='countdown'&&phase==='running'&&was.inputMode===inputMode;
    controlPhase.current={phase,inputMode};
    onPhase(phase);game.release();keys.current.clear();
    if(!prepared){tetris.current.reset();pose.current.reset();}
    lastValid.current=0;trackingValid.current=false;trackingStarted.current=performance.now();countdownStart.current=0;
    camera.setMode(inputMode==='motion'&&['calibration','practice','countdown','running'].includes(phase)?'pose':'hand');
  },[phase,inputMode,id]);
  useEffect(()=>{if(inputMode==='motion'&&camera.status!=='ready'){game.release();tetris.current.reset();pose.current.reset();if(camera.status==='error'||camera.status==='off')pause('카메라 연결이 해제되어 멈췄어요.');}},[camera.status,inputMode]);
  useLayoutEffect(()=>{motionHandler.current=(frame:MotionFrame)=>{
    const phase=phaseRef.current;
    if(!live.current||document.hidden||inputMode!=='motion')return;
    // Consume results before React schedules preview/UI work. Stale inference
    // must not refresh tracking or complete an old gesture.
    if(camera.status!=='ready'||!Number.isFinite(frame.time)||performance.now()-frame.time>350){trackingValid.current=false;game.release();tetris.current.reset();pose.current.reset();if(phase==='calibration')setProgress(0);return;}
    if(phase==='calibration'){
      const result=id==='tetris'?tetris.current.update(frame.hands,frame.pose,frame.time,frame.width/frame.height,settings):pose.current.update(frame.pose,frame.time,frame.width/frame.height,id==='balance'?{...settings,dinoMode:'body'}:settings,true);setProgress(result.progress);setFeedback(result.valid?'편하게 선 자세를 유지해주세요':id==='tetris'?'양팔과 몸이 보이게 해주세요':'어깨·골반과 필요한 손목이 보이게 해주세요');
      if(result.valid)lastValid.current=frame.time;
      if(result.progress===1){if(calibrationNext.current==='countdown'){setFeedback('보정 완료! 잠시 후 시작해요');setCount(3);changePhase('countdown');}else{setFeedback('보정 완료! 동작을 연습해보세요');startPractice();}}return;
    }
    if(!['practice','countdown','running'].includes(phase))return;
    const result=id==='tetris'?tetris.current.update(frame.hands,frame.pose,frame.time,frame.width/frame.height,settings):pose.current.update(frame.pose,frame.time,frame.width/frame.height,id==='balance'?{...settings,dinoMode:'body'}:settings,game instanceof SourceGame?game.grounded:true);
    trackingValid.current=result.valid&&result.progress===1;
    if(trackingValid.current)lastValid.current=frame.time;else{game.release();setFeedback(id==='tetris'?'양팔과 몸을 화면 안에 넣어주세요':'어깨와 골반이 보이게 해주세요');}
    if(trackingValid.current)for(const c of result.commands)command(c);
  };});
  useLayoutEffect(()=>camera.subscribeFrame(next=>motionHandler.current(next)),[camera]);
  useEffect(()=>{
    let raf=0, previous=performance.now();
    const tick=(now:number)=>{
      const dt=Math.min(.05,(now-previous)/1000);previous=now;const p=phaseRef.current;
      const warming=inputMode==='motion'&&camera.status==='ready'&&!camera.hasResult;
      // Model warmup grants waiting time, without claiming a valid body result.
      if(camera.status==='loading'||warming)trackingStarted.current=now;
      if(inputMode==='motion'&&!warming&&camera.status!=='loading'&&['running','practice','countdown'].includes(p)&&now-Math.max(lastValid.current,trackingStarted.current)>1400)pause(camera.status==='error'?'카메라 연결을 확인해주세요':'인식이 잠시 끊겼어요. 자세를 확인하고 다시 시작해주세요.');
      if(p==='countdown'){
        if(inputMode==='keyboard'||camera.status==='ready'&&trackingValid.current&&now-lastValid.current<350){if(!countdownStart.current)countdownStart.current=now;setCount(Math.max(1,3-Math.floor((now-countdownStart.current)/1000)));if(now-countdownStart.current>=3000){if(resume.current)game.resume();else game.start();changePhase('running');setFeedback('좋아요, 시작해볼까요!');}}
        else {countdownStart.current=0;setCount(3);}
      }
      if(p==='running'||p==='practice'){
        if(id==='balance'&&inputMode==='keyboard'){const direction=(keys.current.has('ArrowRight')||keys.current.has('ArrowDown')||keys.current.has('d')||keys.current.has('s')?1:0)-(keys.current.has('ArrowLeft')||keys.current.has('ArrowUp')||keys.current.has('a')||keys.current.has('w')?1:0);game.command({type:'tilt',value:direction*.28});}
        if(p==='practice'&&id==='balance'&&actionSet.current.has('tilt')&&Math.abs(game.angle)<.3&&Math.abs(game.angularVelocity)<.5&&(inputMode==='keyboard'||now-lastValid.current<300)){balanceCenter.current+=dt;if(balanceCenter.current>1.2)mark('center');}else balanceCenter.current=0;
      }
      if(game instanceof SourceGame){game.practicing=p==='practice';game.update(dt);}
      raf=requestAnimationFrame(tick);
    };raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);
  },[game,inputMode]);
  useEffect(()=>{
    const down=(e:KeyboardEvent)=>{
      if((e.target as HTMLElement)?.matches('input,select,textarea'))return;
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key))e.preventDefault();
      if(e.key==='Escape'){pause();return;}if(!['running','practice'].includes(phaseRef.current))return;
      keys.current.add(e.key.toLowerCase().startsWith('arrow')?e.key:e.key.toLowerCase());if(e.repeat&&[' ','ArrowUp'].includes(e.key))return;
      if(id==='dino'){if(e.key===' '||e.key==='ArrowUp')command({type:'jump'});if(e.key==='ArrowDown')command({type:'duck',value:true});}
      if(id==='tetris'){if(e.key==='ArrowLeft'||e.key==='ArrowRight')command({type:'move',value:e.key==='ArrowLeft'?-1:1});if(e.key==='ArrowUp')command({type:'rotate'});if(e.key==='ArrowDown')command({type:'softDrop',value:true});if(e.key===' ')command({type:'hardDrop'});}
      if(id==='balance'&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','a','A','d','D','w','W','s','S'].includes(e.key))command({type:'tilt',value:['ArrowLeft','ArrowUp','a','A','w','W'].includes(e.key)?-.28:.28});
    };
    const up=(e:KeyboardEvent)=>{keys.current.delete(e.key.toLowerCase().startsWith('arrow')?e.key:e.key.toLowerCase());if(e.key==='ArrowDown'){command({type:'duck',value:false});command({type:'softDrop',value:false});}if(id==='balance'&&!keys.current.size)command({type:'tilt',value:0});};
    const hidden=()=>{if(document.hidden)pause('탭을 벗어나 게임을 일시정지했어요.');};const blur=()=>pause('화면 포커스를 벗어나 일시정지했어요.');
    const modalPause=()=>pause('설정이나 미리보기를 확인하는 동안 게임을 멈췄어요.');
    const release=()=>{keys.current.clear();game.release();};window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);window.addEventListener('motion-dialog-open',modalPause);document.addEventListener('visibilitychange',hidden);
    return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);window.removeEventListener('motion-dialog-open',modalPause);document.removeEventListener('visibilitychange',hidden);release();};
  },[game,inputMode]);
  const openLeaderboard=(mode=difficulty)=>{if(['running','practice','countdown'].includes(phaseRef.current))pause('순위판을 보는 동안 게임을 멈췄어요.');setLeaderboardMode(mode);setLeaderboard(game.api?.tetrisLeaderboard?.(mode)??[]);setLeaderboardOpen(true);};
  const saveTetrisScore=()=>{if(!canSaveScore||scoreSaved||!game.api?.saveTetrisScore)return;game.api.saveTetrisScore(playerName,score,difficulty);setScoreSaved(true);openLeaderboard(difficulty);};
  const beginCalibration=(next:'practice'|'countdown')=>{game.pause();game.release();keys.current.clear();calibrationNext.current=next;if(id==='tetris')tetris.current.beginCalibration();else pose.current.beginCalibration();setProgress(0);setFeedback('몸을 새로 인식하고 있어요. 기준 자세를 유지해주세요');changePhase('calibration');};
  const prepare=()=>{if(!loaded)return;if(sound)enableSound();actionSet.current.clear();setAchievements([]);balanceCenter.current=0;if(inputMode==='motion'&&camera.status!=='ready'){connect();return;}if(inputMode==='motion')beginCalibration('practice');else{startPractice();setFeedback('화면의 조작을 직접 해보세요');}};
  const startCountdown=(isResume=false,mode=inputMode)=>{if(mode==='motion'&&camera.status!=='ready'){connect();return;}game.release();tetris.current.reset();pose.current.reset();resume.current=isResume;if(!isResume){game.restart();setScore(0);}setCount(3);if(mode==='motion'&&phaseRef.current!=='practice')beginCalibration('countdown');else changePhase('countdown');};
  const prepareMotion=()=>{chooseInput('motion');beginCalibration('practice');};
  const info=gameInfo[id], control=id==='dino'&&inputMode==='motion'&&settings.dinoMode==='seated'?'손목을 어깨 위로 올려 점프 · 손을 내리면 다음 점프 준비':id==='balance'&&inputMode==='keyboard'?'캐릭터가 기운 반대 방향의 키를 눌러 바로잡기':info.control;
  const required=id==='dino'?(inputMode==='motion'&&settings.dinoMode==='seated'?[['jump','손 올려 점프']]:[['jump','점프'],['duck','숙이기']]):id==='tetris'?[['left','왼쪽'],['right','오른쪽'],['softDrop','소프트 드롭'],['rotate','회전']]:[['tilt','몸 기울이기'],['center','균형 유지']];
  useEffect(()=>{if(required.every(([key])=>achievements.includes(key))){onPracticeComplete?.();if(onPracticeComplete&&!immersive&&phaseRef.current==='practice')pause('연습을 마쳤어요. 아래의 연습 마치기를 선택해주세요.');}},[achievements]);
  return <section className={`game-view ${immersive?'immersive':'embedded'}`} data-phase={phase} data-input={inputMode} data-source={`temp_gameFile/${id==='dino'?'공룡게임':id==='tetris'?'정보축전 2026 - 오현고 테트리스':'runner_balance_walk_with_picture_guide'}.html`}>
  <header className="game-heading"><button data-hand className="back-button" onClick={back}><ArrowLeft size={17}/>로비</button><div><h1>{info.name}</h1></div><div className="game-score" aria-label={id==='balance'?'이동 거리':'현재 점수'}><span>{id==='balance'?'이동 거리':'점수'}</span><strong>{id==='balance'?(score/10).toFixed(1)+'m':String(score).padStart(5,'0')}</strong></div><div className="game-score best"><span>최고 기록</span><strong>{id==='balance'?(bestScore(scoreId)/10).toFixed(1)+'m':String(bestScore(scoreId)).padStart(5,'0')}</strong></div><div className="game-actions">{id==='tetris'&&<button data-hand className="small-button" onClick={()=>openLeaderboard()} disabled={!loaded}>순위판</button>}<button data-hand className="small-button" aria-label="일시정지" disabled={!['running','practice','countdown'].includes(phase)} onClick={()=>pause()}><Pause size={18}/><span>일시정지</span></button><button data-hand className="small-button sound-button" aria-label={soundBlocked?'소리 시작':sound?'소리 끄기':'소리 켜기'} aria-pressed={sound&&!soundBlocked} onClick={()=>{if(!sound||soundBlocked)enableSound();else setSound(false);}}>{sound&&!soundBlocked?<Volume2 size={22}/>:<VolumeX size={22}/>}<span>{soundBlocked?'소리 시작':sound?'소리 켜짐':'소리 꺼짐'}</span></button>{immersive&&<button data-hand className="small-button" aria-label={fullscreen?'전체화면 해제':'전체화면'} onClick={toggleFullscreen}>{fullscreen?<Minimize2 size={18}/>:<Maximize2 size={18}/>}</button>}</div></header>
  <div className="play-layout"><section className="play-main"><div className={`game-stage ${info.color} ${id}`}><aside className={`play-side camera-floating camera-${cameraSide}`} aria-label="게임 위 카메라"><button data-hand className="camera-position" onClick={()=>setCameraSide(side=>side==='right'?'left':'right')} aria-label="카메라 위치 바꾸기"><MoveHorizontal size={20}/><span>위치 바꾸기</span></button><CameraPanel camera={camera} frame={frame} connect={connect} compact/></aside><iframe className="source-game" title={`${info.name} 원본 게임`} srcDoc={source} tabIndex={-1} onLoad={e=>{const ready=game.attach(e.currentTarget);setLoaded(ready);setLoadError(!ready);}}/>
  {phase==='setup'&&<div className="game-overlay"><div className="overlay-card"><span className={`tag ${info.color}`}>READY TO PLAY</span><h2>{info.description}</h2><p>{control}{id==='dino'&&<><br/>노란 코인 하나당 20점!</>}</p><div className="segmented"><button data-hand className={inputMode==='motion'?'active':''} onClick={()=>chooseInput('motion')}><ScanLine size={15}/>모션으로</button><button data-hand className={inputMode==='keyboard'?'active':''} onClick={()=>chooseInput('keyboard')}><Keyboard size={15}/>키보드로</button></div>{(id==='tetris'||id==='balance')&&<div className="segmented difficulty-choice" aria-label={`${info.name} 난이도`}>{id==='tetris'&&<button data-hand className={difficulty==='VERY_EASY'?'active':''} onClick={()=>setDifficulty('VERY_EASY')}>매우 쉬움</button>}<button data-hand className={difficulty==='EASY'?'active':''} onClick={()=>setDifficulty('EASY')}>쉬움</button><button data-hand className={difficulty==='HARD'?'active':''} onClick={()=>setDifficulty('HARD')}>{id==='tetris'?'어려움 · 방해 블록':'어려움'}</button></div>}{id==='dino'&&<label className="scene-choice">배경<select value={scene} onChange={e=>setScene(e.target.value)}><option value="day">낮</option><option value="spring">봄낮</option><option value="beach">바다</option><option value="bright-night">초저녁</option><option value="desert">사막 노을</option></select></label>}{id==='dino'&&<button data-hand className="text-button" onClick={editCharacter}>현재 캐릭터: {character?.name??'원본 병아리'} · 바꾸기 →</button>}{id==='balance'&&<button data-hand className="text-button" onClick={()=>setShowBalanceGuide(true)}>그림으로 게임 방법 보기</button>}<button data-hand className="primary" disabled={!loaded} onClick={prepare}><Play size={17}/>{loadError?'게임을 불러오지 못했어요':!loaded?'게임 불러오는 중…':inputMode==='motion'&&camera.status!=='ready'?'카메라 연결하기':'조작 준비하기'}</button></div></div>}
  {phase==='setup'&&id==='balance'&&showBalanceGuide&&<div className="game-overlay balance-guide" role="dialog" aria-modal="true" aria-label="사람 균형 달리기 방법"><div className="overlay-card"><h2>그림으로 배우는 균형 달리기</h2><div className="balance-guide-steps"><div><span aria-hidden="true">🏃 ↶</span><strong>앞으로 넘어질 때</strong><p>왼쪽으로 기울이거나 A / ← 키를 눌러요.</p></div><div><span aria-hidden="true">🏃 ↷</span><strong>뒤로 넘어질 때</strong><p>오른쪽으로 기울이거나 D / → 키를 눌러요.</p></div><div><span aria-hidden="true">🏃 → 🏠</span><strong>목표는 200m</strong><p>균형을 잡고 집까지 도착해요.</p></div></div><p>몸을 바로 세우거나 키를 놓으면 조작이 멈춰요. 이미 기운 캐릭터는 반대 방향으로 바로잡아 주세요.</p><p>⚡ 3초간 균형을 유지하면 3초간 질주해요. 50m 구간을 통과하면 5초간 균형이 안정돼요.</p><p>👟 신발은 5초간 속도를 높이고, 🥤 음료는 5초간 균형을 안정시켜요.</p><button data-hand className="primary" onClick={()=>setShowBalanceGuide(false)}>확인했어요</button></div></div>}
  {phase==='calibration'&&<div className="game-overlay"><div className="overlay-card"><PersonStanding size={38}/><h2>기준 자세를 맞춰요</h2><p>{settings.dinoMode==='seated'&&id==='dino'?'앉은 자세로 어깨와 골반이 보이게 해주세요.':id==='tetris'?'양팔과 몸이 보이도록 편하게 서주세요.':'어깨와 골반이 보이도록 편하게 서주세요.'}</p><progress max="1" value={progress}/><span>{Math.round(progress*100)}% · {feedback}</span><button data-hand className="small-button" onClick={()=>{chooseInput('keyboard');if(calibrationNext.current==='countdown')changePhase('countdown');else startPractice();}}>{calibrationNext.current==='countdown'?'키보드로 이어하기':'키보드 연습으로 전환'}</button></div></div>}
  {phase==='countdown'&&<div className="countdown"><strong>{inputMode==='motion'&&(camera.status!=='ready'||!camera.hasResult)?'준비 중':count}</strong><span>편하게 준비해주세요</span></div>}
  {phase==='paused'&&<div className="game-overlay"><div className="overlay-card"><Pause size={32}/><h2>잠깐 쉬어가요</h2><p>{reason}</p><button data-hand className="primary" onClick={()=>startCountdown(game.state==='paused')}><Play size={16}/>카운트다운 후 재개</button><button data-hand className="small-button" onClick={()=>startCountdown(false)}><RotateCcw size={16}/>처음부터 다시</button><button data-hand className="text-button" aria-label="이번 게임 종료" onClick={()=>game.finish()}><Flag size={16}/>이번 게임 종료</button>{camera.status==='ready'&&<button data-hand className="small-button" onClick={prepareMotion}><ScanLine size={16}/>{inputMode==='motion'?'모션 조작 다시 준비':'모션으로 전환'}</button>}{inputMode==='motion'&&<button data-hand className="text-button" onClick={()=>{chooseInput('keyboard');startCountdown(game.state==='paused','keyboard');}}>키보드로 이어하기</button>}</div></div>}
  {phase==='over'&&<div className="game-overlay"><div className="overlay-card"><span className="tag purple">NICE PLAY!</span><h2>{id==='balance'&&score>=2000?'200m 도착 성공!':'멋진 플레이였어요'}</h2><strong className="result-score">{id==='balance'?(score/10).toFixed(1)+'m':score+'점'}</strong>{id==='dino'&&<p>모은 코인 {game.api?.snapshot().coins??0}개</p>}{id==='tetris'&&canSaveScore&&<div className="tetris-score-save"><label htmlFor="tetris-player-name">순위판에 이름을 남겨요</label><div><input id="tetris-player-name" maxLength={8} value={playerName} onChange={e=>setPlayerName(e.target.value)} placeholder="이름 (최대 8자)" disabled={scoreSaved}/><button data-hand className="small-button" onClick={saveTetrisScore} disabled={scoreSaved||!game.api?.saveTetrisScore}>{scoreSaved?'저장됨':'기록 저장'}</button></div></div>}<div className="button-row"><button data-hand className="primary" onClick={()=>startCountdown(false)}><RotateCcw size={16}/>다시 하기</button><button data-hand className="small-button" onClick={back}>로비로</button></div></div></div>}
  {id==='tetris'&&leaderboardOpen&&<div className="game-overlay tetris-leaderboard" role="dialog" aria-modal="true" aria-labelledby="tetris-leaderboard-title"><div className="tetris-leaderboard-card"><div className="tetris-leaderboard-heading"><h2 id="tetris-leaderboard-title">난이도별 순위판</h2><button data-hand className="small-button" onClick={()=>setLeaderboardOpen(false)} aria-label="순위판 닫기">닫기</button></div><div className="segmented" aria-label="순위판 난이도">{[['VERY_EASY','매우 쉬움'],['EASY','쉬움'],['HARD','어려움']].map(([mode,label])=><button data-hand key={mode} className={leaderboardMode===mode?'active':''} aria-pressed={leaderboardMode===mode} onClick={()=>openLeaderboard(mode)}>{label}</button>)}</div>{leaderboard.length===0?<p className="tetris-leaderboard-empty">등록된 기록이 없습니다.</p>:<ol className="tetris-leaderboard-list">{leaderboard.map((entry,index)=><li key={index}><span className="tetris-rank">{index+1}</span><strong>{entry.name}</strong><span>{entry.score.toLocaleString()}점</span><time>{entry.date}</time></li>)}</ol>}<p className="tetris-leaderboard-note">기록은 이 기기에 저장됩니다.</p></div></div>}
  </div>
  {phase==='practice'&&<div className="practice-strip"><div><strong>먼저 가볍게 연습해요</strong><div className="practice-checks">{required.map(([key,label])=><span key={key} className={achievements.includes(key)?'complete':''}><Check size={14}/>{label}</span>)}</div></div><button data-hand className="primary" onClick={()=>startCountdown(false)}>{required.every(([key])=>achievements.includes(key))?'연습 완료 · 게임 시작':'연습 건너뛰고 시작'}<ArrowRight size={15}/></button></div>}
  <div className="play-toolbar"><span className="input-feedback" role="status"><i/>{feedback}</span><span className="motion-guide">{inputMode==='motion'?control:'키보드 조작 중'}</span><span className="key-guide"><Keyboard size={15}/>{info.keys}</span><span className="pause-hint">Esc 일시정지</span></div>
  </section></div></section>;
}
