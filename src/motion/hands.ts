import type { Command, Hand, Landmark, Settings } from '../core/types';

export type HandShape = 'open' | 'closing' | 'fist' | 'unknown';
export type SelectionState = 'waiting' | 'moving' | 'hovering' | 'ready' | 'closing' | 'selected' | 'release';
const PALM = [0, 5, 9, 13, 17];
const FINGERS = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
const distance = (a: Landmark, b: Landmark, aspect: number) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);

export function palmCenter(points: Landmark[]) {
  return { x: PALM.reduce((sum, i) => sum + points[i].x, 0) / PALM.length,
    y: PALM.reduce((sum, i) => sum + points[i].y, 0) / PALM.length };
}

export function palmToScreen(palm:{x:number;y:number},width:number,height:number) {
  const clamp=(v:number)=>Math.max(0,Math.min(1,v));
  return {x:clamp((1-palm.x-.23)/.54)*width,y:clamp((palm.y-.28)/.54)*height};
}

function jointAngle(a: Landmark, b: Landmark, c: Landmark, aspect: number) {
  const ax = (a.x - b.x) * aspect, ay = a.y - b.y, cx = (c.x - b.x) * aspect, cy = c.y - b.y;
  const norm = Math.hypot(ax, ay) * Math.hypot(cx, cy);
  return norm < .00001 ? 0 : Math.acos(Math.max(-1, Math.min(1, (ax * cx + ay * cy) / norm))) * 180 / Math.PI;
}

export function inspectHand(hand: Hand | undefined, aspect: number) {
  const invalid = { shape: 'unknown' as HandShape, curled: 0, extended: 0, palm: null as {x:number;y:number}|null, size: 0 };
  if (!hand || hand.confidence < .65 || hand.points.length !== 21 || !Number.isFinite(aspect) || aspect <= 0) return invalid;
  const p = hand.points;
  if (p.some(v => !Number.isFinite(v.x) || !Number.isFinite(v.y) || v.x < .008 || v.x > .992 || v.y < .008 || v.y > .992)) return invalid;
  const size = distance(p[0], p[9], aspect), width = distance(p[5], p[17], aspect);
  // A tiny, cropped or collapsed landmark cloud is never a click.
  if (size < .055 || width < .035 || width / size < .22 || width / size > 2.5) return invalid;
  let curled = 0, extended = 0;
  for (const [mcp, pip, dip, tip] of FINGERS) {
    const angle = jointAngle(p[mcp], p[pip], p[dip], aspect);
    const base = distance(p[mcp], p[0], aspect), reach = distance(p[tip], p[0], aspect);
    if (angle < 145 && reach < base * 1.3 && distance(p[tip], p[mcp], aspect) < size * .9) curled++;
    if (angle > 150 && reach > base * 1.38) extended++;
  }
  const shape: HandShape = curled >= 3 ? 'fist' : extended >= 3 && curled === 0 ? 'open' : 'closing';
  return { shape, curled, extended, palm: palmCenter(p), size };
}

/** Each close cycle consumes exactly one target, even if tracking or navigation interrupts it. */
export class MenuSelector {
  state: SelectionState = 'waiting'; armed = false; locked: string | null = null;
  hover: string | null = null; hoverSince = 0; openCount = 0; fistCount = 0;
  closing = false; fistSince: number | null = null; progress = 0; selectedAt = -Infinity;
  reset() {
    this.state = 'waiting'; this.armed = false; this.locked = null; this.hover = null;
    this.hoverSince = 0; this.openCount = 0; this.fistCount = 0; this.closing = false;
    this.fistSince = null; this.progress = 0; this.selectedAt = -Infinity;
  }
  update(target: string | null, shape: HandShape, now: number, s: Settings): string | null {
    if (shape === 'unknown') { this.reset(); return null; }
    if (shape === 'open') {
      this.openCount++;
      this.fistCount = 0; this.fistSince = null; this.progress = 0;
      if (this.openCount >= s.openFrames) { this.armed = true; this.closing = false; this.locked = null; }
      if (!this.armed) { this.state = 'waiting'; return null; }
      if (this.hover !== target) { this.hover = target; this.hoverSince = now; }
      this.state = target ? now - this.hoverSince >= s.dwellMs ? 'ready' : 'hovering' : 'moving';
      return null;
    }
    this.openCount = 0;
    if (!this.armed) { this.state = now - this.selectedAt < 350 ? 'selected' : 'release'; return null; }
    if (!this.closing) {
      this.closing = true;
      this.locked = target && target === this.hover && now - this.hoverSince >= s.dwellMs ? target : null;
    }
    this.state = 'closing';
    if (shape !== 'fist') { this.fistCount = 0; this.fistSince = null; this.progress = 0; return null; }
    if (this.fistSince === null) this.fistSince = now;
    this.fistCount++;
    this.progress = Math.min(1, (now - this.fistSince) / s.fistHoldMs, this.fistCount / s.fistFrames);
    if (this.fistCount >= s.fistFrames && now - this.fistSince >= s.fistHoldMs) {
      this.armed = false;
      if (this.locked) { this.state = 'selected'; this.selectedAt = now; return this.locked; }
      this.state = 'release';
    }
    return null;
  }
}

export class HandControls {
  direction = 0; nextMove = 0; dropFired = false;
  armed = false; openCount = 0;
  candidate: 'left' | 'right' | 'drop' | null = null;
  candidateSince = 0; candidateFrames = 0;
  reset() { this.direction = 0; this.nextMove = 0; this.dropFired = false; this.armed = false; this.openCount = 0; this.candidate = null; this.candidateSince = 0; this.candidateFrames = 0; }
  update(hands: Hand[], now: number, aspect: number, s: Settings): {commands: Command[]; valid: boolean} {
    const left = hands.find(h => h.side === 'Left'), right = hands.find(h => h.side === 'Right');
    const l = inspectHand(left, aspect), r = inspectHand(right, aspect);
    if (!l.palm || !r.palm) { this.reset(); return { commands: [{type:'softDrop',value:false}], valid: false }; }
    const bothOpen = l.shape === 'open' && r.shape === 'open';
    if (bothOpen) {
      this.openCount++;
      if (this.openCount >= s.openFrames) { this.armed = true; this.dropFired = false; }
    } else this.openCount = 0;

    // Classify the whole pair before confirming it. The second fist suppresses
    // lateral movement immediately, even while the drop gesture is confirming.
    const candidate = !this.armed ? null
      : l.shape === 'fist' && r.shape === 'fist' ? 'drop'
      : l.shape === 'fist' && r.shape === 'open' ? 'left'
      : l.shape === 'open' && r.shape === 'fist' ? 'right' : null;
    if (candidate !== this.candidate) {
      this.candidate = candidate; this.candidateSince = now; this.candidateFrames = 0;
      this.direction = 0; this.nextMove = 0;
    }
    if (candidate) this.candidateFrames++;
    const confirmed = candidate !== null && this.candidateFrames >= s.fistFrames && now - this.candidateSince >= s.fistHoldMs;
    const commands: Command[] = [{type:'softDrop',value:false}];
    if(confirmed && candidate === 'drop' && !this.dropFired) { commands.push({type:'hardDrop'}); this.dropFired = true; }
    const direction = confirmed ? candidate === 'left' ? -1 : candidate === 'right' ? 1 : 0 : 0;
    if (direction && (direction !== this.direction || now >= this.nextMove)) {
      commands.push({type:'move',value:direction}); this.nextMove = now + (direction !== this.direction ? 350 : 150);
    }
    this.direction = direction;

    return {commands, valid:true};
  }
}

/** Open-palm activation is limited to explicitly marked tutorial buttons. */
export class PalmDwellSelector {
  target: string | null = null; since = 0; blocked = false; progress = 0;
  reset() { this.target = null; this.since = 0; this.blocked = false; this.progress = 0; }
  consume() { this.blocked = true; this.progress = 0; }
  update(target: string | null, open: boolean, now: number) {
    if (!target) { this.reset(); return null; }
    if (!open) { this.target = null; this.progress = 0; return null; }
    if (this.blocked) return null;
    if (this.target !== target) { this.target = target; this.since = now; }
    this.progress = Math.min(1,(now-this.since)/900);
    if (this.progress === 1) { this.consume(); return target; }
    return null;
  }
}
