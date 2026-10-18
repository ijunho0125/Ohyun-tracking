import type { ReactNode } from 'react';
export type TigerMood = 'idle' | 'guide' | 'success' | 'retry';
// Code-native pixel art: a separate tutorial character, never a replacement for the official logo.
const pixels = [
  '    KKKK        KKKK    ', '   KOOOKK      KKOOOK   ', '   KOWWOKKKKKKKKOWWOK   ',
  '   KOOOOKOOOOOOKOOOOK   ', '  KKOOOOKKOOOOKKOOOOKK  ', '  KOOOOOOKOOOOKOOOOOOK  ',
  ' KOOOOKOOOOOOOOOOKOOOOK ', ' KOOOOKKOOOOOOOOKKOOOOK ', ' KOOOOOKOOOOOOOOKOOOOOK ',
  ' KWWWWOOOOOOOOOOOOWWWWK ', ' KWWWKKKOOOOOOKKKWWWWWK ',
  ' KWWWKWKOOOOOOKWKWWWWWK ', ' KWWWWWWWKKKKWWWWWWWWK ', '  KWWWWWWKKKKWWWWWWWK  ',
  '   KWWWWWWKKWWWWWWWK   ', '    KWWWWWWWWWWWWWK    ', '     KKKWWWWWWKKKK     ',
  '      KOOOOWOOOOK      ', '    KKKOOKWWKOOKKKK    ', '   KOOOOKWWWWKOOOOKK   ',
  '   KOOOKWWWWWWKOOOOK   ', '    KKOKWWWWWWKOKKK    ', '     KOKWWWWWWKOK      ',
  '     KOOOKKKKOOOK      ', '    KOOOOK  KOOOOK     ', '    KWWWWK  KWWWWK     ', '    KKKKKK  KKKKKK     ',
];
const colors: Record<string,string> = {K:'#282120',O:'#fd7122',W:'#fffaf0'};
export function PixelTiger({mood='idle'}:{mood?:TigerMood}) {
  return <svg className={`pixel-tiger tiger-${mood}`} viewBox="0 0 24 28" role="img" aria-label={`픽셀 호랑이 안내자: ${mood==='success'?'성공':mood==='retry'?'다시 해봐요':'안내'}`} shapeRendering="crispEdges">
    {pixels.flatMap((row,y)=>[...row].map((c,x)=>colors[c]?<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={colors[c]}/>:null))}
    <g fill="#282120"><path d="M10 4h4v1h-1v1h-2V5h-1zm0 3h4v1h-4zM2 7h3v1H2zm1 2h3v1H3zm16-2h3v1h-3zm-1 2h3v1h-3zM5 19h3v1H5zm1 3h3v1H6zm10-3h3v1h-3zm-1 3h3v1h-3z"/></g>
    {mood==='success'&&<g fill="#282120"><path d="M6 11h1v-1h3v1h1v1H9v-1H8v1H6zm9 0h1v-1h3v1h1v1h-2v-1h-1v1h-2z"/><path d="M10 15h5v1h-1v1h-3v-1h-1z"/></g>}
    {mood==='retry'&&<g fill="#800020"><rect x="6" y="9" width="4" height="1"/><rect x="16" y="9" width="4" height="1"/></g>}
    {mood==='guide'&&<g fill="#fd7122" stroke="#282120" strokeWidth="1"><path d="M20 19h3v-4h-2v2h-2z"/></g>}
  </svg>;
}
export function TigerGuide({children,mood='guide'}:{children:ReactNode;mood?:TigerMood}) {
  return <div className={`tiger-guide mood-${mood}`}><PixelTiger mood={mood}/><div className="tiger-speech" role="status"><span className="guide-name">오현 호랑이</span><p>{children}</p></div></div>;
}

