import type { Command, Hand, Landmark, Settings } from '../core/types';
import { PoseControls } from './gestures';
import { HandControls } from './hands';

/** Combine physical left/right fists with calibrated jump/crouch controls. */
export class TetrisControls {
  pose = new PoseControls();
  hands = new HandControls();

  beginCalibration() { this.hands.reset(); this.pose.beginCalibration(); }
  reset() { this.hands.reset(); this.pose.reset(); }

  update(hands: Hand[], points: Landmark[], now: number, aspect: number, settings: Settings) {
    const hand = this.hands.update(hands, now, aspect, settings);
    // The seated option belongs to Dino; Tetris always uses body movement.
    const body = this.pose.update(points, now, aspect, {...settings, dinoMode:'body'}, true);
    const released: Command[] = [{type:'softDrop', value:false}];
    if (!hand.valid || !body.valid) {
      if (this.pose.calibrating) this.pose.samples = [];
      this.reset();
      return {valid:false, commands:released, progress:0};
    }
    if (this.pose.calibrating || !this.pose.baseline) {
      return {valid:true, commands:released, progress:body.progress};
    }
    const commands: Command[] = hand.commands.filter(c => c.type === 'move' || c.type === 'hardDrop');
    for (const c of body.commands) {
      if (c.type === 'jump') commands.push({type:'rotate'});
      if (c.type === 'duck') commands.push({type:'softDrop', value:c.value});
    }
    return {valid:true, commands, progress:body.progress};
  }
}
