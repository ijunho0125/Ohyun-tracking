import { forwardRef, useImperativeHandle, useRef, useState, type PointerEvent } from 'react';
import { Eraser, Pencil, RotateCcw } from 'lucide-react';

export type DrawingPadHandle = { snapshot:()=>Promise<Blob|null> };
export const DrawingPad=forwardRef<DrawingPadHandle,{disabled:boolean;onDrawingChange:(drawing:boolean)=>void;onChange:()=>void}>(function DrawingPad({disabled,onDrawingChange,onChange},ref){
  const canvas=useRef<HTMLCanvasElement>(null), pointer=useRef<number|null>(null), previous=useRef({x:0,y:0});
  const [color,setColor]=useState('#800020'),[width,setWidth]=useState(18),[erase,setErase]=useState(false);
  useImperativeHandle(ref,()=>({snapshot:async()=>{
    const source=canvas.current;if(!source)return null;
    const context=source.getContext('2d',{willReadFrequently:true});if(!context)return null;
    const {data}=context.getImageData(0,0,source.width,source.height);
    let left=source.width,top=source.height,right=-1,bottom=-1;
    for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++)if(data[(y*source.width+x)*4+3]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    if(right<left)return null;
    // Keep a transparent margin and trim empty space so the drawing fills the game character.
    const margin=12,output=document.createElement('canvas');
    output.width=right-left+1+margin*2;output.height=bottom-top+1+margin*2;
    output.getContext('2d')!.drawImage(source,left,top,right-left+1,bottom-top+1,margin,margin,right-left+1,bottom-top+1);
    return new Promise((resolve,reject)=>output.toBlob(blob=>blob?resolve(blob):reject(new Error('그림을 준비하지 못했어요. 다시 저장해주세요.')),'image/png'));
  }}),[]);
  const point=(event:PointerEvent<HTMLCanvasElement>)=>{
    const element=event.currentTarget,rect=element.getBoundingClientRect();
    return {x:(event.clientX-rect.left)*element.width/rect.width,y:(event.clientY-rect.top)*element.height/rect.height};
  };
  const stroke=(event:PointerEvent<HTMLCanvasElement>,start=false)=>{
    const context=event.currentTarget.getContext('2d');if(!context)return;
    const next=point(event);
    context.globalCompositeOperation=erase?'destination-out':'source-over';
    context.strokeStyle=color;context.fillStyle=color;context.lineWidth=erase?width*2:width;context.lineCap='round';context.lineJoin='round';
    if(start){context.beginPath();context.arc(next.x,next.y,context.lineWidth/2,0,Math.PI*2);context.fill();}
    else{context.beginPath();context.moveTo(previous.current.x,previous.current.y);context.lineTo(next.x,next.y);context.stroke();}
    previous.current=next;
  };
  const finish=(event:PointerEvent<HTMLCanvasElement>)=>{
    if(pointer.current!==event.pointerId)return;
    pointer.current=null;onDrawingChange(false);onChange();
  };
  return <div className="drawing-pad">
    <fieldset className="drawing-tools" disabled={disabled} aria-label="그리기 도구">
      <button type="button" className={`small-button ${!erase?'active':''}`} aria-pressed={!erase} onClick={()=>setErase(false)}><Pencil size={20}/>펜</button>
      <button type="button" className={`small-button ${erase?'active':''}`} aria-pressed={erase} onClick={()=>setErase(true)}><Eraser size={20}/>지우개</button>
      <label>색상<input aria-label="펜 색상" type="color" value={color} onChange={event=>{setColor(event.target.value);setErase(false);}}/></label>
      <label className="drawing-width">굵기<input aria-label="펜 굵기" type="range" min="4" max="48" value={width} onChange={event=>setWidth(+event.target.value)}/></label>
      <button type="button" className="small-button" onClick={()=>{if(pointer.current!==null)return;canvas.current?.getContext('2d')?.clearRect(0,0,768,768);onChange();}}><RotateCcw size={20}/>모두 지우기</button>
    </fieldset>
    <div className="drawing-surface"><canvas ref={canvas} width={768} height={768} aria-label="캐릭터 그리기 영역" role="img"
      onPointerDown={event=>{if(disabled||pointer.current!==null||event.button!==0)return;event.preventDefault();pointer.current=event.pointerId;event.currentTarget.setPointerCapture(event.pointerId);onDrawingChange(true);stroke(event,true);}}
      onPointerMove={event=>{if(pointer.current===event.pointerId&&!disabled){event.preventDefault();stroke(event);}}}
      onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}/></div>
  </div>;
});
