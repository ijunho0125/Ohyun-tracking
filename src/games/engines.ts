import type { Command, GameAdapter, GameEvent, GameId, GameState } from '../core/types';
import { clamp } from '../motion/gestures';
export const W = 900, H = 430;
abstract class BaseGame implements GameAdapter {
  abstract id: GameId; state: GameState = 'ready'; score = 0; elapsed = 0; lastScore = -1;
  constructor(public emit: (e: GameEvent) => void = () => {}) {}
  abstract reset(): void; abstract command(c: Command): void; abstract update(dt: number): void; abstract render(ctx: CanvasRenderingContext2D): void; abstract release(): void;
  prepare() { this.reset(); this.state = 'ready'; this.emit({ type: 'ready', score: 0 }); }
  start() { if (this.state === 'ready') this.state = 'running'; }
  pause() { if (this.state === 'running') this.state = 'paused'; this.release(); }
  resume() { if (this.state === 'paused') this.state = 'running'; }
  restart() { this.prepare(); }
  finish() { if (this.state === 'disposed' || this.state === 'over') return; this.state = 'over'; this.release(); this.emit({ type: 'over', score: this.score }); }
  dispose() { this.release(); this.state = 'disposed'; }
  report() { if (this.score !== this.lastScore) { this.lastScore = this.score; this.emit({ type: 'score', score: this.score }); } }
  background(ctx: CanvasRenderingContext2D) { ctx.fillStyle = '#fffaf1'; ctx.fillRect(0, 0, W, H); }
}
export class BalanceGame extends BaseGame {
  id = 'balance' as const; x = 0; velocity = 0; angle = 0; target = 0;
  constructor(emit?: (e: GameEvent) => void) { super(emit); this.prepare(); }
  reset() { this.elapsed = 0; this.score = 0; this.lastScore = -1; this.x = 0; this.velocity = 0; this.angle = 0; this.target = 0; }
  command(c: Command) { if (this.state === 'running' && c.type === 'tilt') this.target = clamp(c.value, -.38, .38); }
  release() { this.target = 0; }
  update(dt: number) { if (this.state !== 'running') return; this.elapsed += dt; this.angle += (this.target - this.angle) * (1 - Math.exp(-8 * dt)); this.velocity += (Math.sin(this.angle) * 480 + Math.sin(this.elapsed * 1.6) * 9) * dt; this.velocity *= Math.exp(-.28 * dt); this.x += this.velocity * dt; this.score = Math.floor(this.elapsed * 10); this.report(); if (Math.abs(this.x) > 274 || this.elapsed >= 60) this.finish(); }
  render(ctx: CanvasRenderingContext2D) {
    this.background(ctx); ctx.strokeStyle = '#eadcc3'; ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(450, 240, 55 + i * 32, Math.PI, 0); ctx.stroke(); }
    ctx.fillStyle = '#49302e'; ctx.beginPath(); ctx.moveTo(450, 248); ctx.lineTo(410, 348); ctx.lineTo(490, 348); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.translate(450, 240); ctx.rotate(this.angle); ctx.fillStyle = '#800020'; ctx.beginPath(); ctx.roundRect(-290,0,580,12,6); ctx.fill();
    ctx.strokeStyle = '#ffffff55'; ctx.beginPath(); ctx.moveTo(0,-12); ctx.lineTo(0,22); ctx.stroke();
    ctx.fillStyle = '#fd7122'; ctx.beginPath(); ctx.arc(this.x,-19,19,0,Math.PI*2); ctx.fill(); ctx.fillStyle = '#fffaf1'; ctx.beginPath(); ctx.arc(this.x-6,-25,5,0,Math.PI*2); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#6f625c'; ctx.font = '12px monospace'; ctx.fillText('BALANCE / 03',32,36); ctx.fillText('60초 동안 공을 지켜주세요',355,395);
  }
}
