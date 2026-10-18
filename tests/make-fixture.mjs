// Small deterministic PNG for testing upload, cropping and white background removal.
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
const w=80,h=100,raw=Buffer.alloc((w*4+1)*h);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*(w*4+1)+1+x*4;
  let c=[255,255,255,255];
  if(x>=20&&x<60&&y>=12&&y<80||y>=75&&y<95&&(x>=20&&x<32||x>=48&&x<60))c=[196,243,107,255];
  if(x>=47&&x<53&&y>=25&&y<31)c=[21,57,50,255];
  for(let j=0;j<4;j++)raw[i+j]=c[j];
}
function chunk(type,data){const t=Buffer.from(type),body=Buffer.concat([t,data]);let crc=0xffffffff;for(const v of body){crc^=v;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}const head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([head,body,tail]);}
const header=Buffer.alloc(13);header.writeUInt32BE(w);header.writeUInt32BE(h,4);header[8]=8;header[9]=6;
await mkdir('tests/fixtures',{recursive:true});
await writeFile('tests/fixtures/character.png',Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
