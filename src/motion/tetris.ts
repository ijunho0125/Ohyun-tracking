import type { Command, Hand, Landmark, Settings } from '../core/types';
import { PoseControls } from './gestures';

const visible = (p: Landmark | undefined) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y)
  && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1
  && (p.visibility ?? 1) >= .55 && (p.presence ?? 1) >= .55;

// Compare each wrist with its own shoulder in the shoulder's outward direction.
// This works with the unmirrored camera landmarks even though the preview is mirrored.
function armExtended(p: Landmark[], shoulder: number, elbow: number, wrist: number, otherShoulder: number) {
  const width = Math.abs(p[shoulder].x - p[otherShoulder].x);
  const direction = Math.sign(p[shoulder].x - p[otherShoulder].x);
  return direction !== 0 && (p[wrist].x - p[shoulder].x) * direction > width * .75
    && (p[elbow].x - p[shoulder].x) * direction > width * .25
    && Math.abs(p[wrist].y - p[shoulder].y) < width * 1.5;
}

/** Use outstretched arms for movement and calibrated body movement for rotation/drop. */
export class TetrisControls {
  pose = new PoseControls();
  private direction = 0;
  private candidate = 0;
  private candidateFrames = 0;
  private nextMove = 0;
  private lastTime = -Infinity;

  private resetArms() { this.direction = 0; this.candidate = 0; this.candidateFrames = 0; this.nextMove = 0; this.lastTime = -Infinity; }
  beginCalibration() { this.resetArms(); this.pose.beginCalibration(); }
  reset() { this.resetArms(); this.pose.reset(); }

  update(_hands: Hand[], points: Landmark[], now: number, aspect: number, settings: Settings) {
    const released: Command[] = [{type:'softDrop', value:false}];
    // Do not infer one arm is down when its landmarks are missing: both arms
    // extended should be neutral, and incomplete tracking should stop movement.
    if (![11,12,13,14,15,16].every(i => visible(points[i])) || Math.abs(points[11].x-points[12].x) < .035 || !Number.isFinite(now)) {
      this.reset();
      return {valid:false, commands:released, progress:0};
    }
    const body = this.pose.update(points, now, aspect, {...settings, dinoMode:'body'}, true);
    if (!body.valid) {
      this.reset();
      return {valid:false, commands:released, progress:0};
    }
    if (this.pose.calibrating || !this.pose.baseline) {
      this.resetArms();
      return {valid:true, commands:released, progress:body.progress};
    }
    const commands: Command[] = [];
    // Ignore duplicate/reordered samples and clear pending repeat after a gap.
    if (now > this.lastTime) {
      if (now - this.lastTime > 350) { this.direction = 0; this.candidate = 0; this.candidateFrames = 0; }
      this.lastTime = now;
      const left = armExtended(points,11,13,15,12), right = armExtended(points,12,14,16,11);
      const candidate = left === right ? 0 : left ? -1 : 1;
      if (candidate !== this.candidate) { this.candidate = candidate; this.candidateFrames = 0; this.direction = 0; }
      if (candidate) this.candidateFrames++;
      const direction = this.candidateFrames >= 2 ? candidate : 0;
      if (direction && (direction !== this.direction || now >= this.nextMove)) {
        commands.push({type:'move', value:direction});
        this.nextMove = now + (direction !== this.direction ? 300 : 150);
      }
      this.direction = direction;
    }
    for (const c of body.commands) {
      if (c.type === 'jump') commands.push({type:'rotate'});
      if (c.type === 'duck') commands.push({type:'softDrop', value:c.value});
    }
    return {valid:true, commands, progress:body.progress};
  }
}
