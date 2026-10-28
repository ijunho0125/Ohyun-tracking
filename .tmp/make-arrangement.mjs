import {readFile,writeFile} from 'node:fs/promises';
const p='.tmp/arrangement-template.mjs';
let s=await readFile(p,'utf8');
const start=s.indexOf('const score = {'); const end=s.indexOf('\n\nconst browser =',start);
const replacement=`const score = {
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
};`;
s=s.slice(0,start)+replacement+s.slice(end);
s=s.replace("score.chords.forEach(([beat, beats, notes])=>{notes.forEach(n=>pad(n,beat,beats));bass(notes[0],beat,beats);});", "score.chords.forEach(([beat, beats, notes])=>{notes.forEach(n=>pad(n,beat,beats));bass(notes[0],beat,beats);[0,1,2,3,2,1,2,3].forEach((index,i)=>piano(notes[index]+12,beat+i*.5,.32,.018));});");
s=s.replace("const edge=ctx.createGain(); // separate gain would need to precede destination; adjust rendered samples below instead.", "// Adjust the rendered samples at each boundary.");
await writeFile('.tmp/arrangement-ohyun.mjs',s,'utf8');
