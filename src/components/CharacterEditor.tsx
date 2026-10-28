import { useEffect, useRef, useState } from 'react';
import { Upload, RotateCcw, Save, FlipHorizontal2, Trash2, Check, Bird } from 'lucide-react';
import type { Character, Settings } from '../core/types';
import { characters, deleteCharacter, saveCharacter } from '../core/storage';
import { newCharacterId, selectSharedCharacter } from '../core/shared-characters';
import { processImage } from '../core/images';
import { defaultImage, drawCharacter, type AnimationState, type CharacterVisual } from '../games/character';
export function CharacterEditor({ settings, selected, onSelect, onActivity = () => {},onStrengthChange }: { settings: Settings; selected: Character | null; onSelect: (c: Character | null) => void; onActivity?: (s: string) => void;onStrengthChange?:(v:number)=>void }) {
  const [tab,setTab]=useState('basic'),[shelf,setShelf]=useState(false),[shelfPage,setShelfPage]=useState(0);
  const [saved,setSaved] = useState<Character[]>([]), [original,setOriginal] = useState<Blob|null>(null), [source,setSource] = useState<HTMLImageElement>(defaultImage), [output,setOutput] = useState<HTMLImageElement>(defaultImage);
  const [name,setName] = useState('나의 첫 캐릭터'), [flip,setFlip] = useState(false), [size,setSize] = useState(1), [footX,setFootX] = useState(.5), [footY,setFootY] = useState(1);
  const [crop,setCrop] = useState({ left: 0, top: 0, right: 100, bottom: 100 }), [remove,setRemove] = useState(false), [color,setColor] = useState('#ffffff'), [tolerance,setTolerance] = useState(25);
  const [state,setState] = useState<AnimationState>('run'), [hitbox,setHitbox] = useState(false), [message,setMessage] = useState(''), [strength,setStrength] = useState(settings.strength), [working,setWorking] = useState(false), [processing,setProcessing] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null), file = useRef<HTMLInputElement>(null), processed = useRef<Blob|null>(null), revision=useRef(0), uploadVersion=useRef(0);
  const loadSaved = () => characters().then(setSaved).catch(() => setMessage('그림 저장 서버에 연결하지 못했어요. 연결을 확인해주세요.'));
  useEffect(() => { void loadSaved(); }, []);
  useEffect(() => { setShelfPage(page=>Math.min(page,Math.max(0,Math.ceil(saved.length/3)-1))); }, [saved.length]);
  useEffect(() => {
    let active = true; const token=++revision.current;
    setProcessing(true); processed.current = null;
    if (!source.complete || !source.naturalWidth) { source.onload = () => {if(active&&token===revision.current)setSource(source.cloneNode() as HTMLImageElement);}; return()=>{active=false;}; }
    const result=processImage(source,source.naturalWidth,source.naturalHeight,crop,{enabled:remove,color,tolerance});
    result.toBlob(blob => { if (!active||token!==revision.current) return; if(!blob){setProcessing(false);setMessage('그림을 처리하지 못했어요. 다시 등록해주세요.');return;} const img = new Image(); const url = URL.createObjectURL(blob); img.onload = () => { URL.revokeObjectURL(url); if (active&&token===revision.current) {processed.current = blob;setOutput(img);setProcessing(false);} }; img.onerror=()=>{URL.revokeObjectURL(url);if(active&&token===revision.current){setProcessing(false);setMessage('그림 미리보기를 준비하지 못했어요. 다시 등록해주세요.');}};img.src = url; },'image/png');
    return () => { active = false; };
  }, [source,crop,remove,color,tolerance]);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    let raf = 0; const start = performance.now();
    const draw = (now: number) => {
      const t = (now-start)/1000;
      ctx.clearRect(0,0,650,390); ctx.strokeStyle = '#a4a1b944'; ctx.beginPath(); ctx.moveTo(40,295); ctx.lineTo(610,295); ctx.stroke();
      const jumpTime = t % 1.6, jumpY = state === 'jump' ? Math.max(0,360*jumpTime-500*jumpTime*jumpTime) : 0;
      const visual: CharacterVisual = { image: output,flip,size,footX,footY,strength };
      drawCharacter(ctx,visual,325,295-jumpY,state === 'jump' && jumpTime>.12 && jumpY>0 ? 'air' : state,state === 'land' ? t%1 : t,150);
      if (hitbox) { const ratio=150/62,w=state==='duck'?58:44,h=state==='duck'?26:44;ctx.strokeStyle = '#800020'; ctx.setLineDash([5,5]); ctx.strokeRect(325-(w/2-5)*ratio,295-jumpY-(h-5)*ratio,(w-10)*ratio,(h-10)*ratio); ctx.setLineDash([]); }
      ctx.fillStyle = '#800020'; ctx.beginPath(); ctx.arc(325,295-jumpY,4,0,Math.PI*2); ctx.fill(); raf = requestAnimationFrame(draw);
    }; raf=requestAnimationFrame(draw); return () => cancelAnimationFrame(raf);
  }, [output,flip,size,footX,footY,strength,state,hitbox]);
  const upload = async (f?: File) => {
    if (!f) return; if (!['image/png','image/jpeg','image/webp'].includes(f.type) || f.size > 15*1024*1024) { setMessage('15MB 이하의 PNG, JPG, WebP 그림을 선택해주세요.'); return; }
    const uploadToken=++uploadVersion.current;revision.current++;setProcessing(true);processed.current=null;setMessage('그림을 읽고 있어요.');
    const url = URL.createObjectURL(f); const img=new Image();
    img.onload=() => { URL.revokeObjectURL(url);if(uploadToken!==uploadVersion.current)return; if (img.naturalWidth*img.naturalHeight>25000000) { setProcessing(false);setMessage('그림이 너무 커요. 2,500만 픽셀 이하로 줄여주세요.'); return; } setOriginal(f); setSource(img); setName(f.name.replace(/\.[^.]+$/,'').slice(0,40).replace(/[\uD800-\uDBFF]$/,'')); setCrop({left:0,top:0,right:100,bottom:100}); setRemove(false); setMessage('그림을 불러왔어요. 발 기준점을 맞춰보세요.'); onActivity('upload'); };
    img.onerror=() => { URL.revokeObjectURL(url);if(uploadToken!==uploadVersion.current)return;setProcessing(false);setMessage('그림을 읽지 못했어요. 다른 파일을 선택해주세요.'); }; img.src=url;
  };
  const save = async () => {
    if (working || processing || !original || !processed.current) { setMessage('그림 한 장을 등록하고 미리보기가 준비될 때까지 기다려주세요.'); return; }
    setWorking(true); try { const c: Character={ id:newCharacterId(),name:name.trim()||'나의 캐릭터',original,processed:processed.current,flip,size,footX,footY }; await saveCharacter(c); onSelect(c); setMessage('사이트에 저장하고 연결된 병아리 질주 게임에 적용했어요.'); onActivity('saved'); await loadSaved(); } catch(error) { setMessage(error instanceof Error?error.message:'그림을 저장하지 못했어요. 다시 시도해주세요.'); } finally { setWorking(false); }
  };
  const choose = async(c:Character|null)=>{try{await selectSharedCharacter(c);onSelect(c);setMessage('연결된 병아리 질주 게임의 캐릭터를 바꿨어요.');}catch{setMessage('캐릭터를 적용하지 못했어요. 서버 연결을 확인해주세요.');}};
  return <><div className="page-heading"><div><div className="eyebrow">CHARACTER STUDIO</div><h1>내 그림이 주인공이 되는 순간</h1><p>저장하면 연결된 병아리 질주 게임에 바로 적용돼요.</p></div><div className="button-row"><a className="small-button" href={`${import.meta.env.BASE_URL}draw`}>그림 패드 열기</a><div className="view-tabs"><button data-hand className={!shelf?"active":""} onClick={()=>setShelf(false)}>그림 편집</button><button data-hand className={shelf?"active":""} onClick={()=>setShelf(true)}>보관함 ({saved.length+1})</button></div></div></div>
  <div className="editor-grid" hidden={shelf}><section className="panel editor-preview"><div className="panel-heading"><span>움직임 미리보기</span><label className="inline-check"><input type="checkbox" checked={hitbox} onChange={e=>setHitbox(e.target.checked)}/>충돌 범위</label></div><div className="checker"><canvas ref={canvas} width={650} height={390}/></div><div className="animation-buttons">{([['run','달리기'],['jump','점프'],['land','착지'],['duck','숙이기'],['over','게임 종료']] as const).map(([id,label])=><button data-hand key={id} className={state===id?'active':''} onClick={()=>{setState(id);onActivity('preview');}}>{label}</button>)}</div><p className="subtle">버건디색 점이 발 기준점이에요. 그림이 변형돼도 충돌 범위는 유지돼요.</p></section>
  <section className={`panel editor-controls editor-tab-${tab}`}><div className="view-tabs" aria-label="그림 편집 도구">{[["basic","그림"],["crop","자르기·발 위치"],["background","배경 제거"]].map(([id,label])=><button data-hand key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}>{label}</button>)}</div><div className="editor-basic"><button data-hand className="upload-zone" onClick={()=>file.current?.click()}><Upload size={25}/><strong>내 그림 등록하기</strong><span>PNG · JPG · WebP / 최대 15MB</span></button><input ref={file} aria-label="캐릭터 그림 파일" type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>void upload(e.target.files?.[0])}/>
  <label>캐릭터 이름<input maxLength={40} value={name} onChange={e=>setName(e.target.value)}/></label>
  <div className="control-pair"><label>표시 크기<input type="range" min=".5" max="1.5" step=".05" value={size} onChange={e=>setSize(+e.target.value)}/></label><button data-hand className={`small-button ${flip?'active':''}`} onClick={()=>setFlip(!flip)}><FlipHorizontal2 size={16}/>좌우 뒤집기</button>  <label>움직임 강도<select value={strength} onChange={e=>{setStrength(+e.target.value);onStrengthChange?.(+e.target.value);}}><option value=".5">은은하게</option><option value="1">보통</option><option value="1.5">과장되게</option></select></label></div>
  </div><div className="editor-crop"><h3>잘라내기 · 발 기준점</h3><div className="control-pair">{(['left','top','right','bottom'] as const).map((key,i)=><label key={key}>{['왼쪽','위쪽','오른쪽','아래쪽'][i]} (%)<input type="number" min="0" max="100" value={crop[key]} onChange={e=>{ const next={...crop,[key]:Math.max(0,Math.min(100,+e.target.value))}; if (next.left<next.right && next.top<next.bottom) setCrop(next); }}/></label>)}</div><label>발 가로 위치<input type="range" min="0" max="1" step=".01" value={footX} onChange={e=>setFootX(+e.target.value)}/></label><label>발 세로 위치<input type="range" min=".3" max="1" step=".01" value={footY} onChange={e=>setFootY(+e.target.value)}/></label></div>
  <div className="editor-background"><h3>단색 배경 제거</h3><label className="inline-check"><input type="checkbox" checked={remove} onChange={e=>setRemove(e.target.checked)}/>배경색 제거 사용</label><div className="control-pair"><label>제거할 색<input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label><label>허용 범위 {tolerance}<input type="range" min="0" max="100" value={tolerance} onChange={e=>setTolerance(+e.target.value)}/></label></div><p className="subtle">단색 배경의 같은 색을 모두 지워요.</p></div>

  <div className="button-row"><button data-hand className="small-button" onClick={()=>{setCrop({left:0,top:0,right:100,bottom:100});setRemove(false);setFlip(false);setSize(1);setFootX(.5);setFootY(1);}}><RotateCcw size={15}/>원본으로</button><button data-hand className="primary" disabled={working||processing||!original} onClick={()=>void save()}><Save size={15}/>{working?'저장 중…':processing?'그림 준비 중…':'이미지 저장'}</button></div>
  <p role="status" className="status-message">{message}</p></section></div>
  <section className="saved-section" hidden={!shelf}><div className="section-heading"><h2>내 캐릭터 보관함 <span>{saved.length+1}</span></h2><div className="button-row"><button data-hand className="small-button" disabled={shelfPage===0} onClick={()=>setShelfPage(v=>v-1)}>이전</button><span>{shelfPage+1} / {Math.max(1,Math.ceil(saved.length/3))}</span><button data-hand className="small-button" disabled={(shelfPage+1)*3>=saved.length} onClick={()=>setShelfPage(v=>v+1)}>다음</button></div></div><div className="saved-grid"><button data-hand className={`saved-character ${!selected?'selected':''}`} onClick={()=>void choose(null)}><Bird className="original-character-icon" aria-hidden="true"/><strong>원본 병아리</strong><span>기본 캐릭터 {!selected&&<Check size={14}/>}</span></button>{saved.slice(shelfPage*3,shelfPage*3+3).map(c=><SavedCharacter key={c.id} character={c} selected={selected?.id===c.id} choose={()=>void choose(c)} remove={async()=>{try{await deleteCharacter(c.id);await loadSaved();if(selected?.id===c.id)onSelect(null);}catch{setMessage('삭제하지 못했어요. 서버 연결을 확인해주세요.');}}}/>)}</div></section></>;
}
function SavedCharacter({character,selected,choose,remove}:{character:Character;selected:boolean;choose:()=>void;remove:()=>void}) {
  const [url,setUrl]=useState(''); useEffect(()=>{const u=URL.createObjectURL(character.processed);setUrl(u);return()=>URL.revokeObjectURL(u);},[character]);
  return <div className={`saved-character ${selected?'selected':''}`}><button data-hand className="character-choice" onClick={choose}><img src={url} alt={character.name}/><strong>{character.name}</strong><span>{selected?'선택됨':'선택하기'}{selected&&<Check size={14}/>}</span></button><button data-hand className="delete-character" aria-label={`${character.name} 삭제`} onClick={remove}><Trash2 size={14}/></button></div>;
}


