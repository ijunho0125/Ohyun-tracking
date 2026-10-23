import type { Landmark, Settings, Command } from '../core/types';
export { MenuSelector, HandControls, inspectHand, palmCenter } from './hands';
export const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
export type PoseMetrics = { shoulderY: number; hipY: number; size: number; lean: number; wristY: number; };
const visible = (p: Landmark | undefined) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 && (p.visibility ?? 1) >= .55 && (p.presence ?? 1) >= .55;
export function kneeAngle(p: Landmark[], aspect: number): number | null {
  const angles: number[] = [];
  for (const [hip,knee,ankle] of [[23,25,27],[24,26,28]]) {
    if (![hip,knee,ankle].every(i=>visible(p[i]))) continue;
    const ax=(p[hip].x-p[knee].x)*aspect, ay=p[hip].y-p[knee].y;
    const bx=(p[ankle].x-p[knee].x)*aspect, by=p[ankle].y-p[knee].y;
    const length=Math.hypot(ax,ay)*Math.hypot(bx,by);
    if(length>.0001)angles.push(Math.acos(clamp((ax*bx+ay*by)/length,-1,1))*180/Math.PI);
  }
  return angles.length ? angles.reduce((a,b)=>a+b,0)/angles.length : null;
}
export function poseMetrics(p: Landmark[], aspect: number): PoseMetrics | null {
  if (!Number.isFinite(aspect) || aspect <= 0 || p.length < 25 || [11, 12, 23, 24].some(i => !visible(p[i]))) return null;
  const sx = (p[11].x + p[12].x) / 2, sy = (p[11].y + p[12].y) / 2;
  const hx = (p[23].x + p[24].x) / 2, hy = (p[23].y + p[24].y) / 2;
  const size = Math.hypot((sx - hx) * aspect, hy - sy);
  if (size < .08 || hy <= sy) return null;
  return { shoulderY: sy, hipY: hy, size, lean: -(sx - hx) * aspect / size, wristY: Math.min(...[15, 16].filter(i => visible(p[i])).map(i => p[i].y), 1) };
}
export class PoseControls {
  baseline: PoseMetrics | null = null; samples: PoseMetrics[] = []; calibrating = false;
  previous: PoseMetrics | null = null; previousRaw: PoseMetrics | null = null; filtered: PoseMetrics | null = null; previousTime = 0; lastJumpTime = -Infinity;
  jumpArmed = true; riseFrames = 0; neutralFrames = 0; duck = false; tilt = 0;
  beginCalibration() { this.baseline = null; this.samples = []; this.calibrating = true; this.reset(); }
  reset() { this.previous = null; this.previousRaw = null; this.filtered = null; this.previousTime = 0; this.jumpArmed = false; this.riseFrames = 0; this.neutralFrames = 0; this.duck = false; this.tilt = 0; this.lastJumpTime = -Infinity; }
  update(p: Landmark[], now: number, aspect: number, s: Settings, grounded: boolean) {
    const raw = poseMetrics(p, aspect);
    const commands: Command[] = [];
    const wristLost=s.dinoMode==='seated'&&[15,16].every(i=>!visible(p[i]));
    if (!raw||wristLost||!Number.isFinite(now)) { this.reset(); if (this.calibrating) this.samples = []; return { valid: false, commands: [{ type: 'duck', value: false }, { type: 'tilt', value: 0 }] as Command[], progress: 0 }; }
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
    // Cursor smoothing must not delay a short body gesture. Keep a similar
    // response at different camera rates and discard gesture history after a gap.
    // Duplicate or reordered captures cannot confirm or cancel a fresh gesture.
    if (this.previous && now <= this.previousTime) return { valid: true, commands, progress: 1 };
    if (this.previous && now - this.previousTime > 350) this.reset();
    const dt = this.previous ? (now - this.previousTime) / 1000 : .05;
    const alpha = 1 - Math.pow(1 - Math.max(.65, s.smoothing), dt / .05);
    const m = this.filtered ? Object.fromEntries(Object.keys(raw).map(k => [k, this.filtered![k as keyof PoseMetrics] + alpha * (raw[k as keyof PoseMetrics] - this.filtered![k as keyof PoseMetrics])])) as PoseMetrics : raw;
    this.filtered = m;
    const b = this.baseline;
    const upS = (b.shoulderY - m.shoulderY) / b.size, upH = (b.hipY - m.hipY) / b.size;
    const rawUpS = (b.shoulderY - raw.shoulderY) / b.size, rawUpH = (b.hipY - raw.hipY) / b.size;
    const handRaised = raw.wristY < raw.shoulderY - b.size * .2;
    // Standing or crouching on the ground can prepare the next jump. Requiring
    // an exact standing height would miss landing into a crouch and jumping again.
    // Raw and filtered heights must both be below the takeoff thresholds.
    const neutral = s.dinoMode === 'seated' ? !handRaised : upS < .03 && upH < .03 && rawUpS < .03 && rawUpH < .03;
    this.neutralFrames = neutral && grounded ? this.neutralFrames + 1 : 0;
    if (this.neutralFrames >= 3) this.jumpArmed = true;
    // Inspired by hop-hop-jump-detection: use body-center velocity for an early
    // takeoff. Both torso levels must rise across two samples, so a single
    // shoulder movement or one isolated landmark spike cannot trigger it.
    // Normalize takeoff height and speed by torso size, including distant players.
    const centerRise=(rawUpS+rawUpH)/2;
    const centerVelocity=this.previousRaw ? (this.previousRaw.shoulderY+this.previousRaw.hipY-raw.shoulderY-raw.hipY)/2/b.size/dt : 0;
    // Confirm two actual raised captures, without waiting for cursor smoothing.
    // Filter residue after one bad sample must never count as another capture.
    // Keep the initial takeoff speed check, but allow a stationary second sample
    // at the apex so a brief, small jump is still detected at low camera rates.
    const elevated = s.dinoMode === 'seated' ? handRaised : rawUpS > .06 && rawUpH > .04;
    const rising = s.dinoMode === 'seated' || this.riseFrames > 0 || centerVelocity > .3;
    this.riseFrames = elevated && rising ? this.riseFrames + 1 : 0;
    const onset=this.previousRaw && b.shoulderY-this.previousRaw.shoulderY>b.size*.005 && b.hipY-this.previousRaw.hipY>b.size*.005;
    const earlyJump=s.dinoMode==='body' && onset && rawUpS>.025 && rawUpH>.025 && centerRise>.04 && centerVelocity>.3;
    // A confirmed takeoff overrides the preceding crouch, which can linger in
    // the smoothed pose. Release duck before sending jump to the game.
    const jumping = (this.riseFrames >= 2 || earlyJump) && this.jumpArmed && grounded && now-this.lastJumpTime>=160;
    if (jumping) { this.jumpArmed = false; this.neutralFrames=0; this.lastJumpTime=now; }
    const down = -upS;
    const knees=kneeAngle(p,aspect), centerDrop=-centerRise*b.size;
    const bentKnees=knees!==null && knees<145 && centerDrop>.025;
    const holdKnees=knees!==null && knees<160 && centerDrop>.008;
    this.duck = s.dinoMode === 'body' && now-this.lastJumpTime>=150 && (this.duck ? down > .1 || holdKnees : down > .18 || bentKnees);
    commands.push({ type: 'duck', value: this.duck });
    if (jumping) commands.push({ type: 'jump' });
    const lean = m.lean - b.lean, dead = .045;
    const target = Math.abs(lean) < dead ? 0 : clamp((lean - Math.sign(lean) * dead) * 1.6, -.38, .38);
    this.tilt += alpha * (target - this.tilt);
    commands.push({ type: 'tilt', value: this.tilt });
    this.previous = m; this.previousRaw=raw; this.previousTime = now;
    return { valid: true, commands, progress: 1 };
  }
}

