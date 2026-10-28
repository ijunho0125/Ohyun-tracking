import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, ArrowUpRight, Camera, Check, Hand, Keyboard, Settings2, ShieldCheck } from 'lucide-react';
import type { Character, GameId, MotionFrame, Page, Settings } from './core/types';
import { loadSettings, persistSettings } from './core/storage';
import { watchSelectedCharacter } from './core/shared-characters';
import { CameraManager } from './motion/camera';
import { inspectHand, MenuSelector, PalmDwellSelector, palmToScreen } from './motion/hands';
import type { Phase } from './components/GameView';
import type { Cursor } from './components/Experiences';
import { gameInfo } from './games/info';
import { SettingsView } from './components/SettingsView';
import { GameArtwork } from './components/Artwork';
import { CameraPanel, FRAME_MAX_AGE } from './components/CameraPanel';
import { TigerGuide } from './components/TigerGuide';
import { Modal } from './components/Modal';
import { gameAudio } from './games/audio';
import { LobbyMusic } from './components/LobbyMusic';
const CharacterEditor = lazy(() => import('./components/CharacterEditor').then(module => ({ default: module.CharacterEditor })));
const GameView = lazy(() => import('./components/GameView').then(module => ({ default: module.GameView })));
const Tutorial = lazy(() => import('./components/Experiences').then(module => ({ default: module.Tutorial })));
const Lab = lazy(() => import('./components/Experiences').then(module => ({ default: module.Lab })));
const initialCursor:Cursor={x:0,y:0,rawX:0,rawY:0,visible:false,tracked:false,shape:'unknown',state:'waiting',progress:0,activation:0,activationTarget:null};
const labels={waiting:'손을 펴주세요',moving:'카드를 가리켜요',hovering:'잠깐 머물러요',ready:'주먹으로 선택',closing:'주먹 확인 중',selected:'선택 완료',release:'손을 펴주세요'};
export default function App(){
  const [settings,setSettings]=useState(loadSettings),[camera]=useState(()=>new CameraManager(settings)),[,tick]=useState(0);
  const [frame,setFrame]=useState<MotionFrame|null>(null),[page,setPage]=useState<Page>('lobby'),[game,setGame]=useState<GameId>('dino'),[gamePhase,setGamePhase]=useState<Phase>('setup');
  const [character,setCharacter]=useState<Character|null>(null),[consent,setConsent]=useState(false),[showSettings,setShowSettings]=useState(false),[tutorialStage,setTutorialStage]=useState(0),[cursor,setCursor]=useState<Cursor>(initialCursor);
  const lobbyMusic=useRef<{pause:()=>void}>(null);
  const palmSelector=useRef(new PalmDwellSelector());
  const selector=useRef(new MenuSelector()),position=useRef<{x:number;y:number}|null>(null),hovered=useRef<HTMLElement|null>(null),handId=useRef(0),scope=useRef<Element|null>(null),activation=useRef(0),lastActivation=useRef<string|null>(null);
  const clearSelection=()=>{selector.current.reset();position.current=null;hovered.current?.removeAttribute('data-motion-state');hovered.current=null;};
  const updateSettings=(s:Settings)=>{setSettings(s);persistSettings(s);};
  useEffect(()=>watchSelectedCharacter(setCharacter),[]);
  useEffect(()=>{camera.onStatus=()=>{tick(v=>v+1);if(camera.status!=='ready'){setFrame(null);clearSelection();setCursor({...initialCursor,activation:activation.current});}};camera.onFrame=setFrame;return()=>{camera.onFrame=()=>{};camera.onStatus=()=>{};camera.stop();};},[camera]);
  useEffect(()=>{camera.settings=settings;},[settings,camera]);
  useEffect(()=>{clearSelection();setCursor({...initialCursor,activation:activation.current});if(page!=='game'&&page!=='lab'&&!(page==='tutorial'&&tutorialStage===4))camera.setMode('hand');},[page,gamePhase,settings.hand,settings.fistHoldMs,settings.fistFrames,consent,showSettings,tutorialStage]);
  useEffect(()=>{
    if(!frame)return;
    const timer=window.setTimeout(()=>{setFrame(null);clearSelection();setCursor({...initialCursor,activation:activation.current});},Math.max(0,FRAME_MAX_AGE-(performance.now()-frame.time)));
    return()=>clearTimeout(timer);
  },[frame]);
  useEffect(()=>{
    const dialogs=[...document.querySelectorAll('dialog[open]')],dialog=dialogs.at(-1)??null;
    if(scope.current!==dialog){clearSelection();scope.current=dialog;}
    const gameplay=(page==='game'||page==='tutorial')&&['practice','calibration','countdown','running'].includes(gamePhase)&&!dialog;
    const hand=frame?.hands.find(h=>h.side===settings.hand),info=inspectHand(hand,frame?frame.width/frame.height:4/3);
    if(gameplay||!frame||info.shape==='unknown'||!info.palm||camera.status!=='ready'||document.hidden||performance.now()-frame.time>FRAME_MAX_AGE){clearSelection();palmSelector.current.reset();setCursor({...initialCursor,activation:activation.current});return;}
    const screen=palmToScreen(info.palm,innerWidth,innerHeight),rawX=screen.x,rawY=screen.y;
    const previous=position.current;
    const pos=info.shape==='open'||!previous?{x:previous?previous.x+settings.smoothing*(rawX-previous.x):rawX,y:previous?previous.y+settings.smoothing*(rawY-previous.y):rawY}:previous;
    pos.x=Math.max(1,Math.min(innerWidth-2,pos.x));pos.y=Math.max(1,Math.min(innerHeight-2,pos.y));position.current=pos;
    let target=document.elementFromPoint(pos.x,pos.y)?.closest<HTMLElement>('[data-hand]')??null;
    if(target?.matches(':disabled')||target?.closest('[inert]')||(dialog&&!dialog.contains(target)))target=null;
    if(target&&!target.dataset.handId)target.dataset.handId=`hand-${++handId.current}`;
    let chosen=selector.current.update(target?.dataset.handId??null,info.shape,frame.time,settings);
    const palmTarget=target?.hasAttribute('data-palm-next')?target.dataset.handId??null:null;
    const palmChosen=palmSelector.current.update(palmTarget,info.shape==='open',frame.time);
    if(palmChosen)chosen=palmChosen;
    const active=selector.current.locked?document.querySelector<HTMLElement>(`[data-hand-id="${selector.current.locked}"]`):target;
    if(hovered.current!==active)hovered.current?.removeAttribute('data-motion-state');if(active)active.dataset.motionState=selector.current.state;hovered.current=active;
    if(chosen){activation.current++;lastActivation.current=chosen;palmSelector.current.consume();}
    setCursor({...pos,rawX,rawY,visible:true,tracked:true,shape:info.shape,state:chosen?'selected':palmTarget&&info.shape==='open'?'hovering':selector.current.state,label:!chosen&&palmTarget&&info.shape==='open'?(palmSelector.current.blocked?'커서를 옮겨주세요':'손바닥으로 선택 중'):undefined,progress:chosen?1:palmTarget&&info.shape==='open'?palmSelector.current.progress:selector.current.progress,activation:activation.current,activationTarget:lastActivation.current});
    if(chosen){const button=document.querySelector<HTMLElement>(`[data-hand-id="${chosen}"]`);if(button&&!button.matches(':disabled')&&(!dialog||dialog.contains(button)))button.click();}
  },[frame,page,gamePhase,settings,camera.status]);
  useEffect(()=>{const hide=()=>{if(document.hidden){clearSelection();setCursor({...initialCursor,activation:activation.current});}};document.addEventListener('visibilitychange',hide);return()=>document.removeEventListener('visibilitychange',hide);},[]);
  const navigate=(p:Page)=>{if(p!=='lobby')lobbyMusic.current?.pause();if(p!=='game')gameAudio.stop();setGamePhase('setup');setPage(p);if(p!=='game'&&document.fullscreenElement)void document.exitFullscreen().catch(()=>{});};
  const openGame=(id:GameId)=>{lobbyMusic.current?.pause();gameAudio.enter(id);setGame(id);navigate('game');if(!document.fullscreenElement)void document.documentElement.requestFullscreen?.().catch(()=>{});};
  const connect=()=>setConsent(true);
  const enableCamera=async()=>{await camera.start();if(camera.status==='loading'||camera.status==='ready')setConsent(false);};
  const cursorHost=[...document.querySelectorAll('dialog[open]')].at(-1)??document.body;
  return <div className={`app-shell page-${page}`}><a className="skip-link" href="#main-content">본문으로 이동</a>
    {page!=='game'&&<header className="site-header"><div className="header-inner"><button data-hand className="brand" aria-label="오현고 컴퓨팅 클럽 게임 로비" onClick={()=>navigate('lobby')}><img src={`${import.meta.env.BASE_URL}brand/logo-horizontal.png`} alt="OHYUN HIGH SCHOOL Computing Club" width="531" height="103"/></button>
      <nav aria-label="주요 메뉴">{([{id:'lobby',name:'게임 로비'},{id:'character',name:'내 그림'},{id:'tutorial',name:'튜토리얼'},{id:'lab',name:'기술 체험관'}] as const).map(n=><button data-hand key={n.id} aria-current={page===n.id?'page':undefined} onClick={()=>navigate(n.id)}>{n.name}</button>)}</nav>
      <button data-hand className="header-settings" onClick={()=>setShowSettings(true)}><Settings2 size={20}/><span>설정·도움말</span></button></div></header>}
    <main tabIndex={-1} id="main-content" className={`page-content content-${page}`}><Suspense fallback={<p role="status">화면을 불러오는 중…</p>}>
    {page==='lobby'?<>      <section className="lobby-games" aria-labelledby="games-title"><div className="section-heading"><div><h1 id="games-title">오늘은 어떤 게임을 할까요?</h1><p>손을 펴서 가리키고, 주먹으로 선택해요.</p></div><div className="lobby-status"><span className={`connection-state ${camera.status==='ready'?'connected':''}`}><span/>{camera.status==='ready'?'카메라 연결됨':'키보드로도 플레이 가능'}</span><LobbyMusic ref={lobbyMusic} active={page==='lobby'}/></div></div><div className="games-grid">{(['dino','tetris','balance'] as const).map(id=><button data-hand className={`game-card ${id}`} key={id} aria-label={`${gameInfo[id].name} 선택`} onClick={()=>openGame(id)}><div className="art-container"><GameArtwork id={id}/><span className="game-type">{id==='tetris'?'손과 몸으로':'몸을 움직여'}</span></div><div className="game-card-body"><div className="game-title"><h3>{gameInfo[id].name}</h3><span><ArrowUpRight size={24}/></span></div><p>{gameInfo[id].description}</p><div className="card-bottom"><span>{id==='dino'?'점프 · 숙이기':id==='tetris'?'팔 뻗기 · 점프 회전 · 앉기 낙하':'상체 기울이기 · 균형'}</span><span className="card-select-label">선택하기<ArrowRight size={16}/></span></div></div></button>)}</div></section>
      <section className="lobby-camera"><button data-hand className="primary camera-connect-action" disabled={['requesting','loading'].includes(camera.status)} onClick={connect}><Camera size={24}/>{camera.status==='ready'?'카메라 다시 연결':'카메라 연결하기'}</button><CameraPanel camera={camera} frame={frame} connect={connect}/></section>
    </>:page==='game'?<GameView immersive key={game} id={game} settings={settings} frame={frame} camera={camera} character={character} connect={connect} back={()=>navigate('lobby')} editCharacter={()=>navigate('character')} onPhase={setGamePhase}/>:page==='character'?<CharacterEditor settings={settings} selected={character} onSelect={setCharacter} onStrengthChange={value=>updateSettings({...settings,strength:value})}/>:page==='tutorial'?<Tutorial settings={settings} camera={camera} frame={frame} cursor={cursor} character={character} connect={connect} onPhase={setGamePhase} onStage={setTutorialStage} initialGame={game} done={()=>navigate('lobby')}/>:<Lab camera={camera} frame={frame} settings={settings} apply={updateSettings} connect={connect}/>}</Suspense></main>
    {page!=='game'&&<footer className="app-footer"><span>OHYUN HIGH SCHOOL <b>Computing Club</b></span><span><ShieldCheck size={17}/>카메라 영상은 내 기기에서만 처리해요.</span><button data-hand onClick={()=>setShowSettings(true)}>도움말<ArrowRight size={16}/></button></footer>}
    <Modal open={showSettings} onClose={()=>setShowSettings(false)} title="설정과 도움말" wide><SettingsView settings={settings} change={updateSettings} camera={camera} connect={connect}/></Modal>
    <Modal open={consent} onClose={()=>setConsent(false)} title="카메라 연결하기"><div className="consent-body"><TigerGuide>밝은 곳에서 손 전체가 보이도록 준비해줘.</TigerGuide><p>브라우저에서 카메라 권한을 허용해주세요.<br/>영상은 녹화하거나 서버로 보내지 않아요.</p>{camera.message&&<p role="status" className="status-message">{camera.message}</p>}<button data-hand className="primary" disabled={['requesting','loading'].includes(camera.status)} onClick={()=>void enableCamera()}><Camera size={20}/>{camera.status==='requesting'?'권한 허용을 기다리는 중…':camera.status==='error'?'다시 연결하기':'카메라 허용하고 시작'}</button><button data-hand className="text-button" onClick={()=>setConsent(false)}><Keyboard size={18}/>키보드로 계속하기</button></div></Modal>
    {cursor.visible&&createPortal(<div className={`hand-cursor cursor-${cursor.state}`} style={{transform:`translate3d(${cursor.x}px,${cursor.y}px,0)`}} aria-hidden="true"><div className="cursor-symbol">{cursor.state==='selected'?<Check size={26}/>:<Hand size={26}/>}<svg className="cursor-progress" viewBox="0 0 60 60"><circle cx="30" cy="30" r="27" pathLength="1" strokeDasharray={`${cursor.progress} 1`}/></svg></div><span>{cursor.label??labels[cursor.state]}</span></div>,cursorHost)}
  </div>;
}
