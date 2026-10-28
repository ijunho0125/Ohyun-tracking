// Render the gentle lobby arrangement to .tmp/arrangement.wav. Encode the result as public/audio/lobby-bgm.mp3.
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

// All times and durations are in beats; pitches are MIDI numbers (middle C = 60).
const score = {
  bpm: 74,
  bars: 16,
  beatsPerBar: 4,
  // A gentle variation on the source song's D–B♭–C–B♭–A–G–F motif.
  melody: [
    [0,1.5,74],[1.5,.5,70],[2,1,72],[3,1,70],
    [4,1.5,69],[5.5,.5,67],[6,2,65],
    [8,1,69],[9,1,70],[10,1.5,72],[11.5,.5,70],
    [12,1,69],[13,1,67],[14,2,65],
    [16,1.5,74],[17.5,.5,70],[18,1,72],[19,1,70],
    [20,1,69],[21,1,67],[22,1,65],[23,1,67],
    [24,1,69],[25,1,72],[26,1,70],[27,1,69],
    [28,1,67],[29,1,69],[30,2,65],
    [32,2,74],[34,1,72],[35,1,70],
    [36,1,69],[37,1,67],[38,2,65],
    [40,1,69],[41,1,70],[42,1.5,72],[43.5,.5,74],
    [44,1,72],[45,1,70],[46,2,69],
    [48,1.5,74],[49.5,.5,70],[50,1,72],[51,1,70],
    [52,1.5,69],[53.5,.5,67],[54,2,65],
    [56,1,69],[57,1,70],[58,1,72],[59,1,70],
    [60,1,69],[61,1,67],[62,1.5,65],
  ],
  chords: [
    [0,4,[53,57,60,65]],[4,4,[46,53,58,62]],[8,4,[48,55,60,64]],[12,4,[50,57,62,65]],
    [16,4,[53,57,60,65]],[20,4,[46,53,58,62]],[24,4,[48,55,60,64]],[28,4,[53,57,60,65]],
    [32,4,[50,57,62,65]],[36,4,[46,53,58,62]],[40,4,[53,57,60,65]],[44,4,[48,55,60,64]],
    [48,4,[53,57,60,65]],[52,4,[46,53,58,62]],[56,4,[48,55,60,64]],[60,4,[53,57,60,65]],
  ],
};

const browser = await chromium.launch({channel:'chrome',headless:true});
try {
  const page = await browser.newPage();
  const base64 = await page.evaluate(async score => {
    const sampleRate=44100, secPerBeat=60/score.bpm;
    const duration=score.bars*score.beatsPerBar*secPerBeat;
    const ctx=new OfflineAudioContext(2,Math.ceil(duration*sampleRate),sampleRate);
    const master=ctx.createGain(); master.gain.value=.72;
    const compressor=ctx.createDynamicsCompressor();
    compressor.threshold.value=-15; compressor.knee.value=12; compressor.ratio.value=2; compressor.attack.value=.01; compressor.release.value=.25;
    master.connect(compressor).connect(ctx.destination);

    // A subtle early-reflection room, deterministic to make builds reproducible.
    const impulse=ctx.createBuffer(2,Math.floor(sampleRate*1.8),sampleRate);
    let seed=12837;
    for(let ch=0;ch<2;ch++) {const channel=impulse.getChannelData(ch);for(let i=0;i<channel.length;i++){seed=(seed*1664525+1013904223)>>>0;channel[i]=(seed/2147483648-1)*Math.pow(1-i/channel.length,2.8);}}
    const reverb=ctx.createConvolver(); reverb.buffer=impulse;
    const wet=ctx.createGain(); wet.gain.value=.18; reverb.connect(wet).connect(master);
    const bus=ctx.createGain(); bus.connect(master); bus.connect(reverb);

    const freq = midi => 440*Math.pow(2,(midi-69)/12);
    function piano(midi, beat, beats, loudness=.14) {
      const t=beat*secPerBeat, length=beats*secPerBeat, f=freq(midi);
      const env=ctx.createGain();env.gain.setValueAtTime(0,t);env.gain.linearRampToValueAtTime(loudness,t+.018);env.gain.exponentialRampToValueAtTime(loudness*.32,t+Math.min(.45,length*.75));env.gain.setValueAtTime(loudness*.32,t+length);env.gain.exponentialRampToValueAtTime(.0001,t+length+.38);env.connect(bus);
      // Three restrained partials with a soft attack; no harsh square wave.
      for(const [partial,amount] of [[1,1],[2,.25],[3,.08]]) {const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=f*partial;g.gain.value=amount;o.connect(g).connect(env);o.start(t);o.stop(t+length+.4);}
    }
    function pad(midi, beat, beats, loudness=.025) {
      const t=beat*secPerBeat, length=beats*secPerBeat;
      const env=ctx.createGain();env.gain.setValueAtTime(.0001,t);env.gain.linearRampToValueAtTime(loudness,t+Math.min(.65,length*.3));env.gain.setValueAtTime(loudness,t+length);env.gain.linearRampToValueAtTime(0,t+length+.8);env.connect(bus);
      const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=850;filter.connect(env);
      for(const detune of [-5,5]) {const o=ctx.createOscillator(),g=ctx.createGain();o.type='triangle';o.frequency.value=freq(midi);o.detune.value=detune;g.gain.value=.5;o.connect(g).connect(filter);o.start(t);o.stop(t+length+.81);}
    }
    function bass(midi, beat, beats) {
      const t=beat*secPerBeat, length=beats*secPerBeat;
      const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=freq(midi-12);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.055,t+.08);g.gain.setValueAtTime(.04,t+length);g.gain.linearRampToValueAtTime(0,t+length+.25);o.connect(g).connect(bus);o.start(t);o.stop(t+length+.26);
    }
    score.chords.forEach(([beat, beats, notes])=>{notes.forEach(n=>pad(n,beat,beats));bass(notes[0],beat,beats);[0,1,2,3,2,1,2,3].forEach((index,i)=>piano(notes[index]+12,beat+i*.5,.32,.018));});
    score.melody.forEach(([beat,beats,note])=>piano(note,beat,beats));
    // Fade the render boundary to eliminate clicks during HTML audio looping.
    // Adjust the rendered samples at each boundary.
    const rendered=await ctx.startRendering();
    const output=new ArrayBuffer(44+rendered.length*4),view=new DataView(output);
    const str=(offset,s)=>[...s].forEach((c,i)=>view.setUint8(offset+i,c.charCodeAt(0)));
    str(0,'RIFF');view.setUint32(4,36+rendered.length*4,true);str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*4,true);view.setUint16(32,4,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,rendered.length*4,true);
    const left=rendered.getChannelData(0),right=rendered.getChannelData(1);
    for(let i=0;i<rendered.length;i++){const fade=Math.min(1,i/(sampleRate*.18),(rendered.length-i)/(sampleRate*.7));view.setInt16(44+i*4,Math.max(-1,Math.min(1,left[i]*fade*2.2))*32767,true);view.setInt16(46+i*4,Math.max(-1,Math.min(1,right[i]*fade*2.2))*32767,true);}
    const a=new Uint8Array(output),chunks=[];for(let i=0;i<a.length;i+=32768)chunks.push(String.fromCharCode(...a.subarray(i,i+32768)));return btoa(chunks.join(''));
  }, score);
  await writeFile('.tmp/arrangement.wav',Buffer.from(base64,'base64'));
  console.log(`Rendered .tmp/arrangement.wav (${score.bars} bars at ${score.bpm} bpm)`);
} finally {await browser.close();}
