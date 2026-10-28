import { useRef, useState } from 'react';
import { ArrowLeft, Save, Check } from 'lucide-react';
import { DrawingPad, type DrawingPadHandle } from './DrawingPad';
import { newCharacterId, saveSharedCharacter } from '../core/shared-characters';

export default function DrawingPage(){
  const pad=useRef<DrawingPadHandle>(null),saving=useRef(false);
  const [name,setName]=useState('나의 캐릭터'),[drawing,setDrawing]=useState(false),[working,setWorking]=useState(false),[message,setMessage]=useState(''),[saved,setSaved]=useState(false);
  const save=async()=>{
    if(saving.current||drawing)return;
    saving.current=true;setWorking(true);setSaved(false);setMessage('그림을 저장하고 있어요.');
    try{
      const image=await pad.current?.snapshot();
      if(!image){setMessage('빈 종이예요. 캐릭터를 먼저 그려주세요.');return;}
      const character={id:newCharacterId(),name:name.trim()||'나의 캐릭터',original:image,processed:image,flip:false,size:1,footX:.5,footY:1};
      await saveSharedCharacter(character);
      setSaved(true);setMessage('저장 완료! 병아리 질주 게임에 바로 적용됐어요. 게임 시작 버튼을 눌러주세요.');
    }catch(error){setMessage(error instanceof Error?error.message:'저장하지 못했어요. 다시 시도해주세요.');}
    finally{saving.current=false;setWorking(false);}
  };
  return <main className="drawing-page">
    <header className="drawing-heading"><div><span className="eyebrow">CHARACTER STUDIO</span><h1>내 그림으로 병아리 질주 게임</h1><p>그림을 저장하면 게임 컴퓨터에 바로 적용돼요.</p></div><a className="small-button" href={import.meta.env.BASE_URL}><ArrowLeft size={18}/>게임 로비</a></header>
    <DrawingPad ref={pad} disabled={working} onDrawingChange={setDrawing} onChange={()=>{setSaved(false);setMessage('');}}/>
    <section className="drawing-save" aria-label="그림 저장">
      <label>캐릭터 이름<input maxLength={40} value={name} disabled={working} onChange={event=>{setName(event.target.value);setSaved(false);}}/></label>
      <div className="drawing-save-message"><p role="status" className="status-message">{message||'이미지 저장 한 번이면 준비 끝. 게임은 컴퓨터의 시작 버튼을 눌러주세요.'}</p></div>
      <button className="primary" disabled={working||drawing} onClick={()=>void save()}>{saved?<Check size={22}/>:<Save size={22}/>} {working?'저장 중…':'이미지 저장'}</button>
    </section>
  </main>;
}
