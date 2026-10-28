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
  private musicStep = 0;
  private nextStep = 0;
  private resumeTask: Promise<boolean> | null = null;
  enter(id: GameId) {
    this.stop(); this.id = id; this.enabled = true;
    try {
      this.context = new AudioContext();
      this.output = this.context.createGain(); this.output.gain.value = 1;
      // Keep the louder music clear when drums and game effects overlap.
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -9; compressor.knee.value = 6;
      compressor.ratio.value = 12; compressor.attack.value = .003; compressor.release.value = .15;
      this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 256;
      this.output.connect(compressor); compressor.connect(this.analyser); this.analyser.connect(this.context.destination);
      void this.resume();
      [523.25,659.25,783.99].forEach((frequency,i)=>this.note(frequency,i*.09,.22));
      if(id==='balance') {
        // A four-bar, minor-key chase theme: urgent eighth-note synths,
        // a low pulse and clipped percussion. Scheduling against the audio
        // clock avoids uneven rhythm when the rendering thread is busy.
        this.musicStep=0;this.nextStep=this.context.currentTime+.12;
        this.timer=window.setInterval(()=>this.scheduleRunnerMusic(),50);
      }
    } catch { this.stop(); this.id = id; }
  }
  ensure(id: GameId) { if(this.id!==id||!this.context)this.enter(id); }
  async resume() {
    const context=this.context;
    if(!this.enabled||!context||context.state==='closed')return false;
    if(context.state==='running')return true;
    const task=context.resume().then(()=>context.state==='running',()=>false);
    this.resumeTask=task;
    void task.finally(()=>{if(this.resumeTask===task)this.resumeTask=null;});
    return task;
  }
  pause() { if(this.context?.state==='running')void this.context.suspend().catch(()=>{}); }
  setEnabled(value: boolean) {
    this.enabled=value;
    if(this.output&&this.context)this.output.gain.setValueAtTime(value ? 1 : 0,this.context.currentTime);
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
  private scheduleRunnerMusic() {
    const context=this.context;
    if(!context||this.id!=='balance')return;
    if(!this.enabled||context.state!=='running') { this.nextStep=context.currentTime+.05; return; }
    if(this.nextStep<context.currentTime-.1)this.nextStep=context.currentTime+.03;
    const melody=[
      293.66,349.23,440,349.23,293.66,329.63,392,440,
      261.63,329.63,392,329.63,261.63,293.66,349.23,392,
      233.08,293.66,349.23,293.66,233.08,261.63,329.63,349.23,
      220,277.18,329.63,392,440,392,329.63,277.18
    ];
    const bass=[146.83,130.81,116.54,110];
    while(this.nextStep<context.currentTime+.12) {
      const step=this.musicStep%32, time=this.nextStep;
      this.musicTone(melody[step],time,.15,'triangle',.064);
      if(step%4===0)this.musicTone(bass[Math.floor(step/8)],time,.25,'sawtooth',.04);
      if(step%8===0||step%8===4)this.musicKick(time);
      if(step%8===2||step%8===6)this.musicTick(time,.028);
      else this.musicTick(time,.012);
      this.musicStep++;this.nextStep+=60/152/2;
    }
  }
  private musicTone(frequency:number,start:number,duration:number,type:OscillatorType,level:number) {
    const context=this.context,output=this.output;if(!context||!output)return;
    const oscillator=context.createOscillator(),gain=context.createGain();
    oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,start);
    gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(level,start+.01);
    gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    oscillator.connect(gain);gain.connect(output);oscillator.start(start);oscillator.stop(start+duration+.01);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  }
  private musicKick(start:number) {
    const context=this.context,output=this.output;if(!context||!output)return;
    const oscillator=context.createOscillator(),gain=context.createGain();
    oscillator.type='sine';oscillator.frequency.setValueAtTime(130,start);
    oscillator.frequency.exponentialRampToValueAtTime(48,start+.12);
    gain.gain.setValueAtTime(.10,start);gain.gain.exponentialRampToValueAtTime(.0001,start+.16);
    oscillator.connect(gain);gain.connect(output);oscillator.start(start);oscillator.stop(start+.17);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  }
  private musicTick(start:number,level:number) {
    const context=this.context,output=this.output;if(!context||!output)return;
    const oscillator=context.createOscillator(),gain=context.createGain();
    oscillator.type='square';oscillator.frequency.setValueAtTime(1800,start);
    oscillator.frequency.exponentialRampToValueAtTime(600,start+.025);
    gain.gain.setValueAtTime(level,start);gain.gain.exponentialRampToValueAtTime(.0001,start+.035);
    oscillator.connect(gain);gain.connect(output);oscillator.start(start);oscillator.stop(start+.04);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  }
  stop() {
    if(this.timer!==null)window.clearInterval(this.timer);this.timer=null;
    const context=this.context;
    this.context=null;this.output=null;this.analyser=null;this.id=null;
    if(context&&context.state!=='closed') {
      const close=()=>{if(context.state!=='closed')void context.close().catch(()=>{});};
      const pending=this.resumeTask;
      this.resumeTask=null;
      if(pending)void pending.then(close,close);else close();
    } else this.resumeTask=null;
  }
}
export const gameAudio = new GameAudio();
