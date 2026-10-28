import dinoHtml from '../../temp_gameFile/dino-game.html?raw';
import tetrisHtml from './tetris-festival.html?raw';
import runnerHtml from '../runner_balance_walk_with_picture_guide.html?raw';
import type { Command, GameAdapter, GameEvent, GameState, Settings } from '../core/types';
import { drawCharacter, type CharacterVisual } from './character';

type SourceId = 'dino' | 'tetris' | 'balance';
type Snapshot = { state: string; score: number; coins?: number; grounded: boolean; angle?: number; angularVelocity?: number };
type SourceAPI = {
  start(mode: string): void; pause(): void; resume(): void; reset(): void;
  command(command: Command): void; release(): void; advance(dt: number): void;
  snapshot(): Snapshot; practice(value: boolean): void; sound(value: boolean, context?: AudioContext, destination?: AudioNode): void;
  configure(settings: Settings, scene: string, motion?: boolean): void; dispose(): void;
  tetrisLeaderboard?(mode: string): {name:string; score:number; date:string}[];
  saveTetrisScore?(name: string, score: number, mode: string): void;
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
let hostSettings = { dinoSpeed:260, obstacleGap:1.3 }, hostMuted = true, hostMotion = false, hostNextEncounterAt = 0;
const hostMotionMaxSpeed = 12;
function hostBaseSpeed() { return (hostMotion ? 7.5 : 8) * hostSettings.dinoSpeed / 300; }
const originalDrawDino = drawDino;
drawDino = function () {
  if (!window.motionGame.drawCharacter?.(ctx, dino, hostTime / 1000)) originalDrawDino();
};
const originalStartGame = startGame;
startGame = function () { originalStartGame(); gameSpeed = hostBaseSpeed(); hostNextEncounterAt = hostTime + 2500; lastMilestone = -1; lastTime = hostTime; if (hostMuted) stopProceduralBgm(); };
const originalBeep = beep;
beep = function (...args) { if (!hostMuted) originalBeep(...args); };
window.motionGame = {
  start() { startGame(); },
  pause() { if (gameState === 'running') gameState = 'paused'; this.release(); bgmAudio.pause(); stopProceduralBgm(); },
  resume() { if (gameState === 'paused') { gameState = 'running'; lastTime = hostTime; if (!hostMuted) startProceduralBgm(); } },
  reset() { this.pause(); gameState = 'idle'; score = 0; coinCount = 0; distance = 0; groundOffset = 0; obstacles = []; items = []; resetDino(); updateReadouts(); },
  command(c) {
    if (gameState !== 'running') return;
    if (c.type === 'jump' && dino.state !== 'jump') {
      // A crouched sprite is shorter. Align its feet before restoring standing
      // height, otherwise the first physics step immediately lands the jump.
      dino.y = GROUND_Y - STAND_H;
      jump();
    }
    if (c.type === 'duck') {
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
      frame(hostTime);
    }
  },
  snapshot() { return { state:gameState, score:Math.floor(score), coins:coinCount, grounded:dino.state !== 'jump', dino:{...dino}, effects:{...effectTimers}, obstacles:obstacles.length, obstacleDetails:obstacles.map(ob=>({...ob})), speed:gameSpeed, time:hostTime, scene:currentBackgroundId, audio:{enabled:!hostMuted,context:audioCtx?.state??'off',music:bgmPlaying} }; },
  dispose() { this.pause(); gameState = 'disposed'; if(!hostSharedAudio) audioCtx?.close(); this.drawCharacter = undefined; }
};
frame(0);
`;
const tetrisBridge = `${sharedBridge}
// Keep the original live readouts and artwork while the host owns controls.
const hostPanel = document.createElement('section'); hostPanel.id = 'festival-panel';
const hostStats = document.createElement('div'); hostStats.id = 'festival-stats';
for (const [label, id] of [['SCORE','ui-score'], ['HIGH','ui-highscore'], ['LINES','ui-lines'], ['SPEED','ui-speed']]) {
  const stat = document.createElement('div'), name = document.createElement('span');
  name.textContent = label; stat.append(name, document.getElementById(id)); hostStats.append(stat);
}
const hostGauge = document.createElement('div'); hostGauge.id = 'festival-gauge';
const gaugeLabel = document.createElement('strong'); gaugeLabel.textContent = 'TIGER FEVER GAUGE';
hostGauge.append(gaugeLabel, document.getElementById('tiger-gauge-dots'));
const hostAlerts = document.createElement('div'); hostAlerts.id = 'festival-alerts';
hostAlerts.append(document.getElementById('fever-alert'), document.getElementById('obstacle-alert'));
const hostPlay = document.createElement('div'); hostPlay.id = 'festival-play';
const hostNext = document.createElement('aside'); hostNext.id = 'festival-next';
const hostNextLabel = document.createElement('strong'); hostNextLabel.textContent = 'NEXT';
hostNext.append(hostNextLabel, nextCanvas, hostStats);
// The source applies its line-clear and drop shakes to this ID.
document.getElementById('board-container').id = 'source-board-container';
const hostBoard = document.createElement('div'); hostBoard.id = 'board-container'; hostBoard.append(canvas);
const hostInfo = document.createElement('aside'); hostInfo.id = 'source-info';
const hostTigerLabel = document.createElement('strong'); hostTigerLabel.textContent = 'DANCING TIGER';
const hostModeLabel = document.createElement('span'); hostModeLabel.textContent = 'MODE';
const hostMode = document.createElement('div'); hostMode.id = 'festival-mode';
hostMode.append(hostModeLabel, document.getElementById('ui-mode-badge'));
hostInfo.append(hostTigerLabel, danceCanvas, hostMode, hostGauge, hostAlerts);
hostPlay.append(hostNext, hostBoard, hostInfo);
hostPanel.append(hostPlay); hostSurface.append(hostPanel);
let pressingDown = false, softDropLocked = false, hostSoftDropMs = 0;
audioEngine.sfxEnabled = false;
window.motionGame = {
  tetrisLeaderboard(mode) { return getLeaderboard(mode); },
  saveTetrisScore(name, score, mode) { saveLeaderboardScore(name, score, mode); },
  start(mode) { game.startGame(mode); particles = []; this.release(); hideOverlay(); if(audioEngine.ctx && audioEngine.sfxEnabled) { void audioEngine.ctx.resume(); audioEngine.startBGM(); } },
  pause() { if(game.state === 'playing') game.state = 'paused'; this.release(); audioEngine.stopBGM(); if(audioEngine.ctx && !hostSharedAudio) void audioEngine.ctx.suspend(); },
  resume() { if(game.state === 'paused') { game.state = 'playing'; if(audioEngine.ctx) void audioEngine.ctx.resume(); if(audioEngine.sfxEnabled)audioEngine.startBGM(); } },
  reset() { this.pause(); game.reset(); particles = []; updateUI(); updateInjahMoodUI(); drawNextPiece(); },
  command(c) {
    if(game.state !== 'playing') return;
    if(c.type === 'move') game.goSide(c.value);
    if(c.type === 'rotate') game.rotate();
    if(c.type === 'hardDrop') game.hardDrop();
    if(c.type === 'softDrop') { if(!c.value) { pressingDown = false; softDropLocked = false; hostSoftDropMs = 0; } else if(!pressingDown) { pressingDown = true; hostSoftDropMs = 0; if(game.goDown()) { game.score++; updateUI(); } } }
  },
  release() { pressingDown = false; softDropLocked = false; hostSoftDropMs = 0; },
  practice(value) { hostPractice = value; document.body.classList.toggle('practice',value); },
  configure() {},
  sound(value, context, destination) { if(context && !audioEngine.ctx) { audioEngine.ctx = context; hostSharedAudio = true; hostDestination = destination; } audioEngine.sfxEnabled = value; if(value) { audioEngine.init(); audioEngine.startBGM(); } else audioEngine.stopBGM(); },
  advance(dt) { hostAccumulator += Math.min(dt,.05); while(hostAccumulator >= 1/60) { hostAccumulator -= 1/60; if(hostPractice && game.mode === 'HARD') game.obstacleTimer = 30; if(game.state === 'playing' && pressingDown) { hostSoftDropMs += 1000/60; if(hostSoftDropMs >= 50) { hostSoftDropMs -= 50; if(game.goDown()) { game.score++; updateUI(); } } } game.update(1000/60); updateParticles(); drawBoard(); drawMascotCharacter(); } },
  snapshot() { return {state:game.state,score:game.score,grounded:game.isGrounded,lines:game.linesCleared,mode:game.mode,figure:game.currentPiece?{x:game.currentPiece.x,y:game.currentPiece.y,matrix:game.currentPiece.matrix.map(row=>[...row])}:null,field:game.field.map(row=>[...row]),obstacleTimer:game.obstacleTimer,pressingDown,softDropLocked,audio:{enabled:audioEngine.sfxEnabled,context:audioEngine.ctx?.state??'off',music:audioEngine.isPlayingBGM}}; },
  dispose() { this.pause(); game.state = 'disposed'; if(!hostSharedAudio) audioEngine.ctx?.close(); }
};
updateUI(); updateTigerGaugeUI(0); drawBoard(); drawNextPiece(); drawMascotCharacter();
`;

const runnerBridge = `
let hostAccumulator = 0, hostPractice = false, hostPausedAt = 0, hostTilt = 0, hostMotion = false;
let hostLeanFrames = 0, hostLeanDirection = 0, hostBalancedFrames = 0, hostDashFrames = 0, hostDashCount = 0, hostSegment = 0, hostNoticeFrames = 0;
let hostDestination = null;
const hostRunnerHud = document.createElement('div'); hostRunnerHud.id = 'runner-host-hud';
const hostRunnerBalance = document.createElement('span');
const hostRunnerSpeed = document.createElement('span');
const hostRunnerSegment = document.createElement('span');
hostRunnerHud.append(hostRunnerBalance, hostRunnerSpeed, hostRunnerSegment); document.body.append(hostRunnerHud);
function hostResetRun() {
  hostLeanFrames = hostLeanDirection = hostBalancedFrames = hostDashFrames = hostDashCount = hostSegment = hostNoticeFrames = 0;
  hostUpdateHud();
}
function hostUpdateHud() {
  hostRunnerBalance.textContent = hostDashFrames > 0 ? '⚡ 질주 ' + (hostDashFrames / 60).toFixed(1) + '초' : '균형 질주 ' + (hostBalancedFrames / 60).toFixed(1) + ' / 3초';
  hostRunnerBalance.classList.toggle('dash', hostDashFrames > 0);
  hostRunnerSpeed.textContent = '속도 ' + (runner.baseForwardSpeed * (runner.hasSpeedBoost() ? 1.72 : 1) * 60 / 80).toFixed(1) + ' m/s';
  hostRunnerSegment.textContent = hostNoticeFrames > 0 ? '✓ ' + (hostSegment * 50) + 'm 구간 통과 · 균형 안정' : '다음 구간 ' + Math.min(200, (hostSegment + 1) * 50) + 'm';
}
function hostAdvanceRunner() {
  const direction = Math.abs(hostTilt) > .025 ? Math.sign(hostTilt) : 0;
  if (direction !== hostLeanDirection) { hostLeanDirection = direction; hostLeanFrames = 0; }
  if (direction) hostLeanFrames = Math.min(60, hostLeanFrames + 1);
  if (hostDashFrames > 0) { hostDashFrames--; hostBalancedFrames = 0; }
  else if (Math.abs(runner.angle) < .28) {
    if (++hostBalancedFrames >= 180) { hostBalancedFrames = 0; hostDashFrames = 180; hostDashCount++; playSound('pickup'); }
  } else hostBalancedFrames = 0;
  // Running speed increases gradually through the course. A short dash rewards
  // keeping balance; speed shoes still apply their own multiplier afterwards.
  const progress = Math.max(0, Math.min(1, (runner.x - 180) / (200 * 80)));
  runner.baseForwardSpeed = (5.2 + progress * 1.6) * (hostDashFrames > 0 ? 1.25 : 1);
  if (!hostPractice && hostSegment < 3 && runner.x >= 180 + (hostSegment + 1) * 50 * 80) {
    hostSegment++; hostNoticeFrames = 180;
    runner.activatePowerup('stability'); playSound('pickup');
  } else if (hostNoticeFrames > 0) hostNoticeFrames--;
  hostUpdateHud();
}
window.motionGame = {
  start(mode) { selectedDifficulty = mode === 'HARD' ? 'hard' : 'easy'; restartGame(); hostResetRun(); this.release(); },
  pause() { if (gameState === 'PLAYING') { gameState = 'PAUSED'; hostPausedAt = performance.now(); } this.release(); },
  resume() { if (gameState === 'PAUSED') { const elapsed = performance.now() - hostPausedAt; if (runner.speedBoostUntil) runner.speedBoostUntil += elapsed; if (runner.stabilityBoostUntil) runner.stabilityBoostUntil += elapsed; for (const item of powerups) item.createdAt += elapsed; lastPowerupRollAt += elapsed; gameState = 'PLAYING'; } },
  reset() { this.pause(); returnToMenu(); currentDistance = 0; cameraX = 0; hostResetRun(); this.release(); updateUI(); },
  command(c) { if (gameState !== 'PLAYING' || c.type !== 'tilt') return; hostTilt = Math.max(-1, Math.min(1, c.value / (hostMotion ? .38 : .28))); },
  release() { hostTilt = 0; hostLeanFrames = 0; hostLeanDirection = 0; keys.left = false; keys.right = false; },
  practice(value) { hostPractice = value; window.runnerHostPractice = value; },
  configure(settings, scene, motion = false) { hostMotion = motion; },
  sound(value, context, destination) { isMuted = !value; if (context) { audioCtx = context; hostDestination = destination; } },
  advance(dt) { runner.groundY = height - (hostPractice ? 190 : 120); hostAccumulator += Math.min(dt, .05); while (hostAccumulator >= 1/60) { hostAccumulator -= 1/60; if (gameState === 'PLAYING') hostAdvanceRunner(); gameLoop(); if (hostPractice && Math.abs(runner.angle) > 1.1) { runner.angle = Math.sign(runner.angle) * 1.1; if (runner.angularVelocity * runner.angle > 0) runner.angularVelocity = 0; } } },
  snapshot() { return { state:gameState === 'GAMEOVER' || gameState === 'FINISHED' ? 'gameover' : gameState, score:Math.round(currentDistance * 10), grounded:true, angle:runner.angle, angularVelocity:runner.angularVelocity, tilt:hostTilt, leanFrames:hostLeanFrames, speed:runner.baseForwardSpeed * (runner.hasSpeedBoost() ? 1.72 : 1) * 60 / 80, balancedFrames:hostBalancedFrames, dashFrames:hostDashFrames, dashCount:hostDashCount, segment:hostSegment }; },
  dispose() { this.pause(); gameState = 'DISPOSED'; }
};
gameLoop();
`;

export function sourceDocument(id: SourceId): string {
  let html = id === 'dino' ? dinoHtml : id === 'tetris' ? tetrisHtml : runnerHtml;
  // The host owns styling, keyboard input and the one animation clock. No CDN
  // requests, independent keyboard listeners, or iframe animation loops remain.
  html = html.replace(/<script\b[^>]*\bsrc=[^>]*>[\s\S]*?<\/script>/gi, '')
    .replaceAll('gain.connect(audioCtx.destination)', 'gain.connect(hostDestination ?? audioCtx.destination)')
    .replaceAll('bgmMasterGain.connect(audioCtx.destination)', 'bgmMasterGain.connect(hostDestination ?? audioCtx.destination)')
    .replaceAll('gain.connect(this.ctx.destination)', 'gain.connect(hostDestination ?? this.ctx.destination)')
    .replace('if (!this.bgmEnabled || !this.ctx) return;', 'if (!this.bgmEnabled || !this.ctx || this.ctx.state !== "running") return;')
    .replace(/@import\s+url\([^;]+;/g, '')
    .replace(/requestAnimationFrame\((?:frame|render|gameLoop)\);/g, '')
    .replace(/window\.addEventListener\((['"])key(down|up)\1,/g, 'window.addEventListener("source-disabled-key",');
  if (id === 'dino') {
    // Lift the original music in the hosted game without boosting individual effects.
    html = html.replace('bgmMasterGain.gain.linearRampToValueAtTime(0.42, audioCtx.currentTime + 0.4);', 'bgmMasterGain.gain.linearRampToValueAtTime(1, audioCtx.currentTime + 0.4);')
      .replace('let gameSpeed = 6;', 'let gameSpeed = 6; let hostPlayTimeMs = 0;')
      .replace('function startGame() {', 'function startGame() { hostPlayTimeMs = 0;')
      .replace('if (effectTimers.jump > 0) effectTimers.jump -= dtRealMs;', 'if (!hostPractice) hostPlayTimeMs += Math.max(0, dtRealMs);\n      if (effectTimers.jump > 0) effectTimers.jump -= dtRealMs;')
      .replace('gameSpeed = Math.min(MAX_SPEED, 6 + score / 220);', 'gameSpeed = Math.min(hostMotion ? hostMotionMaxSpeed : MAX_SPEED, hostBaseSpeed() + hostPlayTimeMs / 25000);')
      .replace('dino.legTimer += dt;', 'dino.legTimer += dt * Math.max(1, gameSpeed / 6);')
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
  } else if (id === 'tetris') {
    // The parent owns the camera, keyboard and audio context. Strip the
    // standalone camera controller and its automatic onload initialization.
    html = html.replace(/        \/\/ Camera pose controls:[\s\S]*?        \/\/ Loop/, '        // Loop')
      .replace(/document\.addEventListener\((['"])key(down|up)\1,/g, 'document.addEventListener("source-disabled-key",')
      .replace(/window\.onload = \(\) => \{[\s\S]*?\n        \};/, '')
      .replace('document.body.appendChild(el);', 'hostSurface.appendChild(el);')
      .replace('document.body.appendChild(flash);', 'hostSurface.appendChild(flash);');
    const end = html.lastIndexOf('</script>');
    html = html.slice(0, end) + tetrisBridge + html.slice(end);
  } else {
    html = html.replace('const audioCtx = new (window.AudioContext || window.webkitAudioContext)();', 'let audioCtx = null;')
      // Keep the ground and runner above the host's practice controls.
      .replaceAll('height - 120', 'height - (window.runnerHostPractice ? 190 : 120)')
      .replace('            updatePowerups(now);', "            if (gameState === 'PLAYING') updatePowerups(now);")
      .replace(/if \(isMuted\) return;\s+if \(audioCtx\.state/, 'if (isMuted || !audioCtx) return;\n            if (audioCtx.state')
      // Preserve the magnitude of a lean. The standalone keyboard physics
      // applies full force to either key and is too abrupt for camera input.
      .replace('controlPower: 0.020', 'controlPower: 0.0028')
      .replace('controlPower: 0.016', 'controlPower: 0.0026')
      .replace(/damping: 0\.90,\s+maxSafeAngle: 1\.50/, 'damping: 0.93,\n                maxSafeAngle: 1.50')
      .replace('damping: 0.80,', 'damping: 0.90,')
      .replace('(this.angle < 0 && keys.right) || (this.angle > 0 && keys.left)', '(this.angle < 0 && hostTilt > 0) || (this.angle > 0 && hostTilt < 0)')
      .replace(/if \(keys\.left\) userTorque -= baseTorquePower;\s+if \(keys\.right\) userTorque \+= baseTorquePower;/, 'userTorque = hostTilt * baseTorquePower * (this.angle * hostTilt < 0 ? 1 : .7 + Math.min(.5, hostLeanFrames / 120));')
      // A modest corrective lean must overcome the gravity that is already
      // pulling the runner outward. Fade that destabilizing pull while the
      // player actively corrects; neutral input keeps the original challenge.
      .replace('const totalTorque = userTorque + this.driftTorque - backwardAccel + (this.angle < 0 ? -downwardGravityAccel : downwardGravityAccel);', `
        const gravityTorque = -backwardAccel + (this.angle < 0 ? -downwardGravityAccel : downwardGravityAccel);
        const correction = this.angle * hostTilt < 0 ? Math.min(1, Math.abs(hostTilt) * 10) : 0;
        const totalTorque = userTorque * (correction > 0 ? 2.4 : 1) + this.driftTorque + gravityTorque * (1 - correction);`)
      // Turning against a lean brakes accumulated momentum promptly, so a
      // small camera correction remains useful even with faster acceleration.
      .replace('this.angularVelocity *= stabilityBoostActive ? 0.72 : difficulty.damping;', 'this.angularVelocity *= this.angle * hostTilt < 0 ? 0.60 : stabilityBoostActive ? 0.72 : difficulty.damping;')
      .replace('if (Math.abs(this.angle) > this.maxSafeAngle) {', 'if (!hostPractice && Math.abs(this.angle) > this.maxSafeAngle) {')
      .replace(/setTimeout\(\(\) => \{\s*triggerGameOver\(\);\s*\}, 600\);/, 'triggerGameOver();')
      // Enlarge the runner around the feet while leaving world coordinates and
      // collision physics unchanged. Limit the scale on shorter viewports.
      .replace('runner.draw(ctx, cameraX);', `
        ctx.save();
        const runnerScale = Math.max(1, Math.min(1.6, (runner.groundY - 100) / 160));
        ctx.translate(runner.x - cameraX, runner.groundY);
        ctx.scale(runnerScale, runnerScale);
        ctx.translate(-(runner.x - cameraX), -runner.groundY);
        runner.draw(ctx, cameraX);
        ctx.restore();`);
    const end = html.lastIndexOf('</script>');
    html = html.slice(0, end) + runnerBridge + html.slice(end);
  }
  if (id === 'balance') {
    const css = `
      html,body{width:100%;height:100%;margin:0;padding:0!important;overflow:hidden;background:#a8d9ef;font-family:system-ui,sans-serif}
      #game-card{position:relative;width:100%;height:100%;min-height:0;max-height:none;max-width:none;border:0;border-radius:0;overflow:hidden}
      #gameCanvas{display:block;width:100%;height:100%}
      #game-card>div{display:none!important} #game-card>#top-hud{display:flex!important;position:absolute;top:80px;left:50%;right:auto;transform:translateX(-50%);pointer-events:none;z-index:2}
      #distance-box,#best-wrapper{display:none!important}
      #balance-panel{display:flex;flex-direction:column;align-items:center;width:min(360px,50vw);min-width:180px;background:#172536e8;border:2px solid #475569;border-radius:14px;color:white;padding:8px 12px!important}
      .balance-labels{display:flex;width:100%;justify-content:space-between;font-size:11px;font-weight:700;gap:8px}
      #balance-panel>.relative{position:relative;width:100%;height:14px;margin-top:5px;border-radius:10px;background:linear-gradient(90deg,#e85c68,#74ddab,#e85c68)}
      #balance-panel>.relative>div:not(#gauge-pointer){display:none}
      #gauge-pointer{position:absolute;top:-2px;bottom:-2px;width:12px;background:white;border:2px solid #1e293b;border-radius:12px;transform:translateX(-50%)}
      .status-row{width:100%;display:flex;justify-content:space-between;margin-top:5px;font-size:10px} .hidden{display:none!important}
      #game-card>#powerup-hud{display:flex!important;position:absolute;top:150px;left:50%;transform:translateX(-50%);gap:5px;pointer-events:none}
      .powerup-pill{padding:5px 8px;background:#172536dd;color:white;border-radius:8px;font-size:11px}
      #runner-host-hud{position:absolute;top:180px;left:50%;transform:translateX(-50%);display:flex;gap:6px;justify-content:center;flex-wrap:wrap;width:min(520px,70%);z-index:3;pointer-events:none;font:700 12px system-ui,sans-serif}
      #runner-host-hud span{background:#172536e8;color:#fff;border:1px solid #71869a;border-radius:8px;padding:5px 8px;white-space:nowrap}
      #runner-host-hud .dash{background:#824714;color:#fff1b8;border-color:#ffcb68}
    `;
    return html.replace('</head>', `<style>${css}</style></head>`);
  }
  const css = `
    *{box-sizing:border-box}html,body{margin:0!important;padding:0!important;width:100%;height:100%;overflow:hidden!important;min-width:0;font-family:system-ui,sans-serif}
    body{display:block!important;background:${id === 'tetris' ? '#120305' : '#e8f4ff'}!important;color:#d1e6f5}
    ${id === 'tetris' ? `body{background-image:radial-gradient(circle at 50% 20%,rgba(239,68,68,.28),transparent 60%),radial-gradient(circle at 80% 80%,rgba(234,179,8,.2),transparent 50%),linear-gradient(to bottom,#180406,#0d0102)!important}
    body.fever-mode-active{background-image:radial-gradient(circle at 50% 20%,rgba(234,179,8,.45),transparent 60%),radial-gradient(circle at 80% 80%,rgba(239,68,68,.45),transparent 50%),linear-gradient(to bottom,#2a0505,#180000)!important}` : ''}
    body> :not(#arcade-surface){display:none!important}
    #arcade-surface{position:absolute;inset:0;display:flex;justify-content:center;align-items:center;gap:32px;padding:80px 24px 70px;overflow:hidden}
    .practice #arcade-surface{padding-bottom:180px}
    #gameCanvas{display:block;width:100%!important;height:auto!important;max-height:100%;object-fit:contain;border:0!important;border-radius:0!important;box-shadow:none!important;aspect-ratio:3/1}
    #festival-panel{width:min(680px,100%);height:100%;min-height:0;display:flex;flex-direction:column;align-items:stretch;gap:5px;padding:7px 10px 10px;color:#fcd34d;background:rgba(26,8,11,.94);border:1px solid rgba(239,68,68,.65);border-radius:18px;box-shadow:0 0 30px rgba(239,68,68,.25),inset 0 0 20px rgba(234,179,8,.1)}
    #festival-panel h1{flex:none;margin:0;text-align:center;color:#facc15;font-size:20px;line-height:1.1;font-weight:900;letter-spacing:.12em;text-shadow:0 0 8px #ef4444,0 0 20px rgba(234,179,8,.6)}
    #festival-stats{flex:none;display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
    #festival-stats>div{display:flex;flex-direction:column;align-items:center;padding:3px;background:rgba(69,10,10,.8);border:1px solid rgba(239,68,68,.4);border-radius:8px;font-weight:900;line-height:1.15}
    #festival-stats>div>span:first-child{font-size:9px;color:#fca5a5} #festival-stats>div>span:last-child{font-size:15px}
    #festival-gauge{flex:none;display:flex;align-items:center;justify-content:space-between;gap:6px;padding:3px 9px;background:#0c0a09;border:1px solid rgba(234,179,8,.5);border-radius:8px;color:#facc15}
    #festival-gauge strong{font-size:10px;letter-spacing:.08em} #tiger-gauge-dots{display:flex;align-items:center;gap:5px} #tiger-gauge-dots canvas{width:20px;height:20px;image-rendering:pixelated} #tiger-gauge-dots .opacity-30{opacity:.3}
    #fever-alert,#obstacle-alert{padding:4px 8px;background:#450a0a;border:1px solid #eab308;border-radius:7px;color:#fde68a;font-size:11px;font-weight:700} #fever-alert>div,#obstacle-alert{display:flex;justify-content:space-between;gap:8px} .hidden{display:none!important}
    #festival-play{display:flex;justify-content:center;align-items:stretch;gap:8px;flex:1;min-height:0;overflow:hidden}
    #board-container{height:100%;min-width:0;display:flex;justify-content:center;border:2px solid rgba(239,68,68,.7);border-radius:12px;overflow:hidden;background:#0c0a09;box-shadow:0 0 25px rgba(239,68,68,.35)}
    #tetrisCanvas{display:block;height:100%;width:auto;max-width:100%;object-fit:contain;aspect-ratio:1/2;image-rendering:pixelated}
    #festival-next,#source-info{width:100px;flex:0 1 100px;min-width:0;display:flex;flex-direction:column;align-items:center;gap:6px;padding:7px;background:rgba(12,10,9,.9);border:1px solid rgba(234,179,8,.5);border-radius:12px;color:#facc15}
    #festival-next{align-self:flex-start} #festival-next strong,#source-info strong{font-size:10px;letter-spacing:.08em;text-align:center} #nextCanvas{width:min(70px,100%);height:auto;aspect-ratio:1;background:#1c1917;border-radius:8px;image-rendering:pixelated}
    #danceCanvas{width:100%;height:100%;min-height:0;object-fit:contain;image-rendering:pixelated} #festival-mode{width:100%;padding:4px;text-align:center;background:#1c1917;border-radius:6px;font-size:10px} #festival-mode span{display:block;color:#a8a29e;font-size:8px} #ui-mode-badge{color:#facc15;font-weight:900}
    @media(max-height:700px){#arcade-surface{gap:24px;padding:76px 20px 66px}.practice #arcade-surface{padding-bottom:180px}#festival-panel{gap:3px;padding:5px 8px 7px}#festival-panel h1{font-size:15px}#festival-stats>div{padding:2px}#festival-gauge{padding:1px 7px}#tiger-gauge-dots canvas{width:16px;height:16px}}
    @media(max-height:450px){#arcade-surface{padding-top:66px}.practice #arcade-surface{padding-bottom:180px}#festival-panel h1{display:none}#festival-next,#source-info{width:70px;flex-basis:70px;padding:4px}}
    ${id === 'tetris' ? `
    /* Keep the board full height; the supporting readouts sit beside it. */
    #arcade-surface{padding:56px 16px 54px}
    .practice #arcade-surface{padding-bottom:116px}
    #festival-panel{width:min(900px,100%);padding:0;background:transparent;border:0;box-shadow:none}
    #festival-play{gap:8px;overflow:visible}
    #board-container{height:100%;aspect-ratio:1 / 2;flex:0 0 auto}
    #tetrisCanvas{width:100%;height:100%}
    #festival-next,#source-info{width:160px;flex:0 0 160px;align-self:flex-start;gap:5px;padding:6px}
    #nextCanvas{width:min(130px,100%)}
    #festival-stats{width:100%;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px}
    #festival-stats>div{padding:3px 1px}
    #festival-stats>div>span:first-child{font-size:8px}
    #festival-stats>div>span:last-child{font-size:13px}
    /* Preserve the mascot canvas proportions so its animated artwork grows
       without distortion, while leaving room for the fever and mode readouts. */
    #danceCanvas{height:clamp(170px,33vh,280px);flex:none}
    #festival-gauge{width:100%;flex-direction:column;gap:2px;padding:4px 2px}
    #festival-gauge strong{font-size:8px;text-align:center}
    #tiger-gauge-dots{gap:2px}
    #tiger-gauge-dots canvas{width:15px;height:15px}
    #festival-alerts{width:100%}
    #fever-alert,#obstacle-alert{font-size:10px;line-height:1.2;padding:3px}
    #fever-alert>div,#obstacle-alert{flex-direction:column;gap:2px}
    @media(max-width:800px){#festival-next,#source-info{width:100px;flex-basis:100px;padding:4px}#nextCanvas{width:88px}#tiger-gauge-dots{gap:0}#tiger-gauge-dots canvas{width:12px;height:12px}}
    @media(max-height:500px){#danceCanvas{height:120px}#source-info strong{font-size:8px}}
    ` : ''}
  `;
  return html.replace('</head>', `<style>${css}</style></head>`);
}

export class SourceGame implements GameAdapter {
  state: GameState = 'ready'; score = 0; grounded = true;
  angle = 0; angularVelocity = 0;
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
  start() { if(this.state==='disposed'||!this.api)return;this.api.start(this.mode);this.grounded=this.api.snapshot().grounded;this.syncPractice();this.state='running'; }
  pause() { if(this.state==='running'){this.api?.pause();this.state='paused';} }
  resume() { if(this.state==='paused'){this.api?.resume();this.state='running';} }
  restart() { if(this.state==='disposed')return;this.api?.reset();this.grounded=this.api?.snapshot().grounded??true;this.score=0;this.state='ready'; }
  finish() { if(this.state==='disposed'||this.state==='over')return;this.api?.pause();this.state='over';this.emit({type:'over',score:this.score}); }
  dispose() { this.api?.dispose();this.api=null;this.state='disposed'; }
  command(command: Command) { if(this.state==='running'&&this.api){this.api.command(command);if(command.type==='jump')this.grounded=this.api.snapshot().grounded;} }
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
    const snapshot=this.api.snapshot();this.grounded=snapshot.grounded;this.angle=snapshot.angle??0;this.angularVelocity=snapshot.angularVelocity??0;
    if(this.score!==snapshot.score){this.score=snapshot.score;this.emit({type:'score',score:this.score});}
    if(snapshot.state==='gameover'&&this.state==='running')this.finish();
  }
  render() {}
}
