import dinoHtml from '../../temp_gameFile/공룡게임.html?raw';
import tetrisHtml from '../../temp_gameFile/테트리스.html?raw';
import type { Command, GameAdapter, GameEvent, GameState, Settings } from '../core/types';
import { drawCharacter, type CharacterVisual } from './character';

type SourceId = 'dino' | 'tetris';
type Snapshot = { state: string; score: number; grounded: boolean };
type SourceAPI = {
  start(mode: string): void; pause(): void; resume(): void; reset(): void;
  command(command: Command): void; release(): void; advance(dt: number): void;
  snapshot(): Snapshot; practice(value: boolean): void; sound(value: boolean, context?: AudioContext, destination?: AudioNode): void;
  configure(settings: Settings, scene: string, motion?: boolean): void; dispose(): void;
  drawCharacter?: (ctx: CanvasRenderingContext2D, dino: { x:number; y:number; width:number; height:number; state:string; vy:number }, time:number) => boolean;
};

// Execute the supplied game's own script. The small bridge exposes its lifecycle
// and commands; original source files remain the single source of game rules.
const sharedBridge = `
let hostAccumulator = 0, hostTime = 0, hostPractice = false;
let hostDestination = null, hostSharedAudio = false;
const hostSurface = document.createElement('main');
hostSurface.id = 'arcade-surface';
document.body.append(hostSurface);
`;
const dinoBridge = `${sharedBridge}
hostSurface.append(canvas);
let hostSettings = { dinoSpeed:260, obstacleGap:3.2 }, hostMuted = true, hostMotion = false, hostNextEncounterAt = 0;
const hostMotionMaxSpeed = 10;
let hostProtectionMs = 0, hostSafeObstacles = new WeakSet(), hostPendingCollisions = new Map();
function hostBaseSpeed() { return (hostMotion ? 7.5 : 8) * hostSettings.dinoSpeed / 300; }
function hostProtect(duration) {
  hostProtectionMs = Math.max(hostProtectionMs, duration);
  for (const ob of hostPendingCollisions.keys()) hostSafeObstacles.add(ob);
  hostPendingCollisions.clear();
}
function hostResetAssist() {
  hostProtectionMs = 0;
  hostSafeObstacles = new WeakSet();
  hostPendingCollisions.clear();
}
function hostCollide(ob) {
  if (gameState !== 'running' || hostSafeObstacles.has(ob)) return;
  // Let a protected obstacle pass normally instead of making it disappear or
  // awarding the speed item's bonus. It stays safe until its trailing edge passes.
  if (hostProtectionMs > 0) { hostSafeObstacles.add(ob); return; }
  if (!hostMotion) { endGame(); return; }
  // Give an actual late gesture 140ms to arrive before committing a collision.
  if (!hostPendingCollisions.has(ob)) hostPendingCollisions.set(ob, 140);
}
function hostAdvanceAssist(dtMs) {
  hostProtectionMs = Math.max(0, hostProtectionMs - dtMs);
  for (const [ob, remaining] of hostPendingCollisions) {
    if (!obstacles.includes(ob)) hostPendingCollisions.delete(ob);
    else if (remaining <= dtMs) { hostPendingCollisions.clear(); endGame(); break; }
    else hostPendingCollisions.set(ob, remaining - dtMs);
  }
}
const originalDrawDino = drawDino;
drawDino = function () {
  if (!window.motionGame.drawCharacter?.(ctx, dino, hostTime / 1000)) originalDrawDino();
};
const originalStartGame = startGame;
startGame = function () { hostResetAssist(); originalStartGame(); hostProtect(2000); gameSpeed = hostBaseSpeed(); hostNextEncounterAt = hostTime + 2500; lastMilestone = -1; lastTime = hostTime; if (hostMuted) stopProceduralBgm(); };
const originalBeep = beep;
beep = function (...args) { if (!hostMuted) originalBeep(...args); };
window.motionGame = {
  start() { startGame(); },
  pause() { if (gameState === 'running') gameState = 'paused'; this.release(); bgmAudio.pause(); stopProceduralBgm(); },
  resume() { if (gameState === 'paused') { gameState = 'running'; lastTime = hostTime; hostProtect(1000); if (!hostMuted) startProceduralBgm(); } },
  reset() { this.pause(); hostResetAssist(); gameState = 'idle'; score = 0; distance = 0; groundOffset = 0; obstacles = []; items = []; resetDino(); updateReadouts(); },
  command(c) {
    if (gameState !== 'running') return;
    if (c.type === 'jump' && dino.state !== 'jump') { jump(); if (hostMotion) hostProtect(450); }
    if (c.type === 'duck') {
      if (hostMotion && c.value && !dino.duckHeld && dino.state !== 'jump') hostProtect(300);
      dino.duckHeld = c.value;
    }
  },
  release() { dino.duckHeld = false; },
  practice(value) { hostPractice = value; document.body.classList.toggle('practice',value); },
  configure(settings, scene, motion = false) { hostSettings = settings; hostMotion = motion; currentBackgroundId = scene; },
  sound(value, context, destination) { hostMuted = !value; if(context && !audioCtx) { audioCtx = context; hostSharedAudio = true; hostDestination = destination; setupBgmGraph(); } if (value) { ensureAudio(); startProceduralBgm(); } else { bgmAudio.pause(); stopProceduralBgm(); } },
  advance(dt) {
    hostAccumulator += Math.min(dt, .05);
    while (hostAccumulator >= 1/60) { hostAccumulator -= 1/60; hostTime += 1000/60;
      if (hostPractice) { obstacles = []; items = []; nextSpawnDistance = distance + 10000; }
      if (gameState === 'running') hostAdvanceAssist(1000/60);
      const wasJumping = dino.state === 'jump';
      frame(hostTime);
      if (hostMotion && gameState === 'running' && wasJumping && dino.state !== 'jump') hostProtect(180);
    }
  },
  snapshot() { return { state:gameState, score:Math.floor(score), grounded:dino.state !== 'jump', dino:{...dino}, effects:{...effectTimers}, obstacles:obstacles.length, obstacleDetails:obstacles.map(ob=>({...ob})), speed:gameSpeed, time:hostTime, scene:currentBackgroundId, assist:{protectionMs:hostProtectionMs,pendingCollisions:hostPendingCollisions.size}, audio:{enabled:!hostMuted,context:audioCtx?.state??'off',music:bgmPlaying} }; },
  dispose() { this.pause(); hostResetAssist(); gameState = 'disposed'; if(!hostSharedAudio) audioCtx?.close(); this.drawCharacter = undefined; }
};
frame(0);
`;
const tetrisBridge = `${sharedBridge}
const hostInfo = document.createElement('aside'); hostInfo.id = 'source-info';
const hostNextLabel = document.createElement('strong'); hostNextLabel.textContent = 'NEXT';
hostInfo.append(hostNextLabel, nextCanvas, document.getElementById('injah-panel'), document.getElementById('ui-mode-badge'), document.getElementById('obstacle-alert'));
hostSurface.append(canvas, hostInfo);
let hostPausedAt = 0;
audioEngine.sfxEnabled = false;
window.motionGame = {
  start(mode) { game.startGame(mode); dropCounter = 0; particles = []; this.release(); hideOverlay(); if(audioEngine.ctx && audioEngine.sfxEnabled) void audioEngine.ctx.resume(); },
  pause() { if(game.state === 'playing') { game.state = 'paused'; hostPausedAt = Date.now(); } this.release(); audioEngine.stopBGM(); if(audioEngine.ctx && !hostSharedAudio) void audioEngine.ctx.suspend(); },
  resume() { if(game.state === 'paused') { const elapsed = Date.now() - hostPausedAt; game.lastObstacleTime += elapsed; game.lastScoreTime += elapsed; game.state = 'playing'; if(audioEngine.ctx) void audioEngine.ctx.resume(); if(audioEngine.bgmEnabled)audioEngine.startBGM(); } },
  reset() { this.pause(); game.state = 'main_menu'; game.score = 0; game.linesCleared = 0; game.field = Array.from({length:20},()=>Array(10).fill(0)); game.figure = null; particles = []; updateUI(); },
  command(c) {
    if(game.state !== 'playing') return;
    if(c.type === 'move') game.goSide(c.value);
    if(c.type === 'rotate') game.rotate();
    if(c.type === 'hardDrop') game.hardDrop();
    if(c.type === 'softDrop') { if(!c.value) { pressingDown = false; softDropLocked = false; } else if(!pressingDown) { pressingDown = true; if(!softDropLocked) { game.goDown(); dropCounter = 0; } } }
  },
  release() { pressingDown = false; softDropLocked = false; },
  practice(value) { hostPractice = value; document.body.classList.toggle('practice',value); },
  configure() {},
  sound(value, context, destination) { if(context && !audioEngine.ctx) { audioEngine.ctx = context; hostSharedAudio = true; hostDestination = destination; } audioEngine.sfxEnabled = value; audioEngine.bgmEnabled = value; if(value) { audioEngine.init(); audioEngine.startBGM(); } else audioEngine.stopBGM(); },
  advance(dt) { hostAccumulator += Math.min(dt,.05); while(hostAccumulator >= 1/60) { hostAccumulator -= 1/60; if(hostPractice) game.lastObstacleTime = Date.now(); render(); } },
  snapshot() { return {state:game.state,score:game.score,grounded:true,lines:game.linesCleared,mode:game.mode,figure:game.figure?{x:game.figure.x,y:game.figure.y,rotation:game.figure.rotation}:null,field:game.field.map(row=>[...row]),obstacleTimer:game.obstacleTimer,pressingDown,softDropLocked,audio:{enabled:audioEngine.sfxEnabled,context:audioEngine.ctx?.state??'off',music:!!audioEngine.bgmTimer}}; },
  dispose() { this.pause(); game.state = 'disposed'; if(!hostSharedAudio) audioEngine.ctx?.close(); }
};
drawBoard(); drawNext(); drawInjahDance();
`;

export function sourceDocument(id: SourceId): string {
  let html = id === 'dino' ? dinoHtml : tetrisHtml;
  // The host owns styling, keyboard input and the one animation clock. No CDN
  // requests, independent keyboard listeners, or iframe animation loops remain.
  html = html.replace(/<script\b[^>]*\bsrc=[^>]*>[\s\S]*?<\/script>/gi, '')
    .replaceAll('gain.connect(audioCtx.destination)', 'gain.connect(hostDestination ?? audioCtx.destination)')
    .replaceAll('bgmMasterGain.connect(audioCtx.destination)', 'bgmMasterGain.connect(hostDestination ?? audioCtx.destination)')
    .replaceAll('gain.connect(this.ctx.destination)', 'gain.connect(hostDestination ?? this.ctx.destination)')
    .replace('if (!this.bgmEnabled || !this.ctx) return;', 'if (!this.bgmEnabled || !this.ctx || this.ctx.state !== "running") return;')
    .replace(/@import\s+url\([^;]+;/g, '')
    .replace(/requestAnimationFrame\((?:frame|render)\);/g, '')
    .replace(/window\.addEventListener\((['"])key(down|up)\1,/g, 'window.addEventListener("source-disabled-key",');
  if (id === 'dino') {
    html = html.replace('gameSpeed = Math.min(MAX_SPEED, 6 + score / 220);', 'gameSpeed = hostMotion ? Math.min(hostMotionMaxSpeed, hostBaseSpeed() + score / 1200) : Math.min(MAX_SPEED, hostBaseSpeed() + score / 220);')
      .replace('dino.legTimer += dt;', 'dino.legTimer += dt * Math.max(1, gameSpeed / 6);')
      .replace('            endGame();', '            hostCollide(ob);')
      .replace('const comboChance = 0.15 + difficulty * 0.4;', 'const comboChance = hostMotion ? 0 : 0.15 + difficulty * 0.4;')
      .replace('function randomSingleType() {', `function randomSingleType() {
        if (hostMotion && hostSettings.dinoMode === 'seated') return Math.random() < .5 ? 'cactus-small' : 'cactus-large';`)
      .replace('if (distance >= nextSpawnDistance) {', 'if (distance >= nextSpawnDistance && hostTime >= hostNextEncounterAt) {')
      .replace('nextSpawnDistance = distance + Math.max(160, gap) + encounterWidth;', `
        // Reserve a true time gap after the trailing edge at the maximum speed,
        // including speed boosts, so later acceleration cannot crowd obstacles.
        const maxTravelSpeed = (hostMotion ? hostMotionMaxSpeed : MAX_SPEED) * 1.3 * 60;
        nextSpawnDistance = distance + maxTravelSpeed * hostSettings.obstacleGap + encounterWidth;
        hostNextEncounterAt = hostTime + hostSettings.obstacleGap * 1000;`);
    html = html.replace('})();', `${dinoBridge}\n})();`);
  } else {
    const end = html.lastIndexOf('</script>');
    html = html.slice(0, end) + tetrisBridge + html.slice(end);
  }
  const css = `
    *{box-sizing:border-box}html,body{margin:0!important;padding:0!important;width:100%;height:100%;overflow:hidden!important;min-width:0;font-family:system-ui,sans-serif}
    body{display:block!important;background:${id === 'tetris' ? '#080c18' : '#e8f4ff'}!important;color:#d1e6f5}
    body> :not(#arcade-surface){display:none!important}
    #arcade-surface{position:absolute;inset:0;display:flex;justify-content:center;align-items:center;gap:32px;padding:80px 24px 70px;overflow:hidden}
    .practice #arcade-surface{padding-bottom:180px}
    #gameCanvas{display:block;width:100%!important;height:auto!important;max-height:100%;object-fit:contain;border:0!important;border-radius:0!important;box-shadow:none!important;aspect-ratio:3/1}
    #tetrisCanvas{height:100%;width:auto;max-width:calc(100% - 180px);object-fit:contain;aspect-ratio:1/2;image-rendering:pixelated;border:2px solid #22465b;border-radius:4px}
    #source-info{display:flex;flex-direction:column;align-self:flex-start;align-items:center;gap:18px;width:160px;flex-shrink:0;font-size:18px;padding-top:0}
    #nextCanvas,#danceCanvas{width:110px;height:110px;image-rendering:pixelated;background:#0e1525;border-radius:8px}
    #injah-panel{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
    #obstacle-alert{display:flex;flex-direction:column;gap:4px;color:#ffc3bc;font-size:18px;text-align:center} .hidden{display:none!important}
    #ui-mode-badge{font-weight:800;color:#a6ffea} #source-info strong{letter-spacing:.12em;font-size:20px}
    @media(max-height:700px){#source-info{gap:10px;font-size:18px}#nextCanvas,#danceCanvas{width:72px;height:72px}#arcade-surface{gap:24px;padding:76px 20px 66px}.practice #arcade-surface{padding-bottom:180px}}
    @media(max-height:450px){#injah-panel,#obstacle-alert{display:none!important}#arcade-surface{padding-top:66px}.practice #arcade-surface{padding-bottom:180px}}
  `;
  return html.replace('</head>', `<style>${css}</style></head>`);
}

export class SourceGame implements GameAdapter {
  state: GameState = 'ready'; score = 0; grounded = true;
  api: SourceAPI | null = null; visual: CharacterVisual | null = null;
  mode = 'EASY'; scene = 'day'; practicing = false;
  motion = false;
  private appliedPractice: boolean | null = null;
  constructor(public id: SourceId, public settings: Settings, private emit: (event:GameEvent)=>void = ()=>{}) {}
  attach(frame: HTMLIFrameElement) {
    this.api = (frame.contentWindow as (Window & { motionGame?: SourceAPI }) | null)?.motionGame ?? null;
    this.appliedPractice = null;
    if (!this.api) return false;
    this.configure();
    this.api.drawCharacter = (ctx,dino,time) => {
      if(!this.visual) return false;
      drawCharacter(ctx,this.visual,dino.x+dino.width/2,dino.y+dino.height,dino.state==='duck'?'duck':dino.state==='jump'?(dino.vy<0?'jump':'air'):'run',time,62);
      return true;
    };
    return true;
  }
  configure() { this.api?.configure(this.settings,this.scene,this.motion); }
  prepare() { this.restart(); }
  start() { if(this.state==='disposed'||!this.api)return;this.api.start(this.mode);this.syncPractice();this.state='running'; }
  pause() { if(this.state==='running'){this.api?.pause();this.state='paused';} }
  resume() { if(this.state==='paused'){this.api?.resume();this.state='running';} }
  restart() { if(this.state==='disposed')return;this.api?.reset();this.score=0;this.state='ready'; }
  finish() { if(this.state==='disposed'||this.state==='over')return;this.api?.pause();this.state='over';this.emit({type:'over',score:this.score}); }
  dispose() { this.api?.dispose();this.api=null;this.state='disposed'; }
  command(command: Command) { if(this.state==='running')this.api?.command(command); }
  release() { this.api?.release(); }
  private syncPractice() {
    if (this.api && this.appliedPractice !== this.practicing) {
      this.api.practice(this.practicing);
      this.appliedPractice = this.practicing;
    }
  }
  update(dt: number) {
    if(this.state==='disposed'||!this.api)return;
    this.syncPractice();this.api.advance(dt);
    const snapshot=this.api.snapshot();this.grounded=snapshot.grounded;
    if(this.score!==snapshot.score){this.score=snapshot.score;this.emit({type:'score',score:this.score});}
    if(snapshot.state==='gameover'&&this.state==='running')this.finish();
  }
  render() {}
}
