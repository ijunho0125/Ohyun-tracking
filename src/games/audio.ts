import type { GameId } from '../core/types';

/** Created on the game-card click so browsers can unlock sound immediately.
 * The original games route their music/effects through the same audio bus. */
class GameAudio {
  id: GameId | null = null;
  context: AudioContext | null = null;
  output: GainNode | null = null;
  analyser: AnalyserNode | null = null;
  enabled = true;
  private timer: number | null = null;
  enter(id: GameId) {
    this.stop(); this.id = id; this.enabled = true;
    try {
      this.context = new AudioContext();
      this.output = this.context.createGain(); this.output.gain.value = .5;
      this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 256;
      this.output.connect(this.analyser); this.analyser.connect(this.context.destination);
      void this.resume();
      [523.25,659.25,783.99].forEach((frequency,i)=>this.note(frequency,i*.09,.22));
      if(id==='balance') {
        let beat=0; const notes=[261.63,329.63,392,329.63,293.66,349.23,440,349.23];
        this.timer=window.setInterval(()=>{if(this.enabled&&this.context?.state==='running')this.note(notes[beat++%notes.length],0,.28);},420);
      }
    } catch { this.stop(); this.id = id; }
  }
  ensure(id: GameId) { if(this.id!==id||!this.context)this.enter(id); }
  async resume() {
    if(!this.enabled||!this.context||this.context.state==='closed')return false;
    try { if(this.context.state!=='running')await this.context.resume();return this.context.state==='running'; } catch { return false; }
  }
  pause() { if(this.context?.state==='running')void this.context.suspend().catch(()=>{}); }
  setEnabled(value: boolean) {
    this.enabled=value;
    if(this.output&&this.context)this.output.gain.setValueAtTime(value ? .5 : 0,this.context.currentTime);
  }
  note(frequency: number, delay=0, duration=.12) {
    const context=this.context,output=this.output;
    if(!context||!output||!this.enabled||context.state==='closed')return;
    const oscillator=context.createOscillator(),gain=context.createGain(),start=context.currentTime+delay;
    oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,start);
    gain.gain.linearRampToValueAtTime(.12,start+.015);gain.gain.exponentialRampToValueAtTime(.001,start+duration);
    oscillator.connect(gain);gain.connect(output);oscillator.start(start);oscillator.stop(start+duration+.02);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  }
  stop() {
    if(this.timer!==null)window.clearInterval(this.timer);this.timer=null;
    const context=this.context;
    this.context=null;this.output=null;this.analyser=null;this.id=null;
    if(context&&context.state!=='closed')void context.close().catch(()=>{});
  }
}
export const gameAudio = new GameAudio();
