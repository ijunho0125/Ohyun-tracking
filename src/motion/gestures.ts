import type { Landmark, Settings, Command } from '../core/types';
export { MenuSelector, HandControls, inspectHand, palmCenter } from './hands';
export const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
export type PoseMetrics = { shoulderY: number; hipY: number; size: number; lean: number; wristY: number; };
export function poseMetrics(p: Landmark[], aspect: number): PoseMetrics | null {
  if (p.length < 25 || [11, 12, 23, 24].some(i => (p[i].visibility ?? 1) < .55 || (p[i].presence ?? 1) < .55)) return null;
  const sx = (p[11].x + p[12].x) / 2, sy = (p[11].y + p[12].y) / 2;
  const hx = (p[23].x + p[24].x) / 2, hy = (p[23].y + p[24].y) / 2;
  const size = Math.hypot((sx - hx) * aspect, hy - sy);
  if (size < .08 || hy <= sy) return null;
  return { shoulderY: sy, hipY: hy, size, lean: -(sx - hx) * aspect / size, wristY: Math.min(...[15, 16].filter(i => (p[i].visibility ?? 1) > .55).map(i => p[i].y), 1) };
}
export class PoseControls {
  baseline: PoseMetrics | null = null; samples: PoseMetrics[] = []; calibrating = false;
  previous: PoseMetrics | null = null; filtered: PoseMetrics | null = null; previousTime = 0;
  jumpArmed = true; riseFrames = 0; neutralFrames = 0; duck = false; tilt = 0;
  beginCalibration() { this.baseline = null; this.samples = []; this.calibrating = true; this.reset(); }
  reset() { this.previous = null; this.filtered = null; this.previousTime = 0; this.jumpArmed = false; this.riseFrames = 0; this.neutralFrames = 0; this.duck = false; this.tilt = 0; }
  update(p: Landmark[], now: number, aspect: number, s: Settings, grounded: boolean) {
    const raw = poseMetrics(p, aspect);
    const commands: Command[] = [];
    const wristLost=s.dinoMode==='seated'&&[15,16].every(i=>!p[i]||(p[i].visibility??1)<.55||(p[i].presence??1)<.55);
    if (!raw||wristLost) { this.reset(); if (this.calibrating) this.samples = []; return { valid: false, commands: [{ type: 'duck', value: false }, { type: 'tilt', value: 0 }] as Command[], progress: 0 }; }
    if (this.calibrating) {
      if (this.samples.length && (Math.abs(raw.shoulderY - this.samples[0].shoulderY) > .035 || Math.abs(raw.lean - this.samples[0].lean) > .1)) this.samples = [];
      this.samples.push(raw);
      if (this.samples.length >= 30) {
        const avg = (k: keyof PoseMetrics) => this.samples.reduce((a, v) => a + v[k], 0) / this.samples.length;
        this.baseline = { shoulderY: avg('shoulderY'), hipY: avg('hipY'), size: avg('size'), lean: avg('lean'), wristY: avg('wristY') };
        this.calibrating = false; this.reset();
      }
      return { valid: true, commands, progress: this.samples.length / 30 };
    }
    if (!this.baseline) return { valid: true, commands, progress: 0 };
    const alpha = s.smoothing;
    const m = this.filtered ? Object.fromEntries(Object.keys(raw).map(k => [k, this.filtered![k as keyof PoseMetrics] + alpha * (raw[k as keyof PoseMetrics] - this.filtered![k as keyof PoseMetrics])])) as PoseMetrics : raw;
    this.filtered = m;
    const b = this.baseline, dt = Math.max(.01, (now - this.previousTime) / 1000);
    const upS = (b.shoulderY - m.shoulderY) / b.size, upH = (b.hipY - m.hipY) / b.size;
    const velocity = this.previous ? (this.previous.shoulderY - m.shoulderY) / b.size / dt : 0;
    const handRaised = m.wristY < m.shoulderY - b.size * .32;
    const neutral = s.dinoMode === 'seated' ? !handRaised : Math.abs(upS) < .1 && Math.abs(upH) < .1;
    this.neutralFrames = neutral ? this.neutralFrames + 1 : 0;
    if (this.neutralFrames >= 3 && grounded) this.jumpArmed = true;
    const rising = s.dinoMode === 'seated' ? handRaised : upS > .14 && upH > .1 && velocity > .08;
    this.riseFrames = rising ? this.riseFrames + 1 : 0;
    if (this.riseFrames >= 2 && this.jumpArmed && grounded) { commands.push({ type: 'jump' }); this.jumpArmed = false; }
    const down = -upS;
    this.duck = s.dinoMode === 'body' && (this.duck ? down > .14 : down > .25);
    commands.push({ type: 'duck', value: this.duck });
    const lean = m.lean - b.lean, dead = .045;
    const target = Math.abs(lean) < dead ? 0 : clamp((lean - Math.sign(lean) * dead) * 1.6, -.38, .38);
    this.tilt += alpha * (target - this.tilt);
    commands.push({ type: 'tilt', value: this.tilt });
    this.previous = m; this.previousTime = now;
    return { valid: true, commands, progress: 1 };
  }
}

