import { forwardRef, useImperativeHandle, useRef, useState, type PointerEvent } from 'react';
import { Circle, Eraser, Minus, PaintBucket, Pencil, Redo2, RectangleHorizontal, Trash2, Undo2 } from 'lucide-react';

type Tool = 'pen' | 'eraser' | 'line' | 'rectangle' | 'ellipse' | 'fill';
type Point = {x:number; y:number};
const colors = ['#800020', '#202124', '#ffffff', '#e84545', '#f38b36', '#f4cf4f', '#67a85b', '#4388c7', '#8054a5', '#e89ab4'];
const tools = [
  {id:'pen', name:'펜', icon:Pencil}, {id:'eraser', name:'지우개', icon:Eraser},
  {id:'line', name:'직선', icon:Minus}, {id:'rectangle', name:'사각형', icon:RectangleHorizontal},
  {id:'ellipse', name:'원', icon:Circle}, {id:'fill', name:'채우기', icon:PaintBucket},
] as const;

export type DrawingPadHandle = { snapshot:()=>Promise<Blob|null> };
export const DrawingPad=forwardRef<DrawingPadHandle,{disabled:boolean;onDrawingChange:(drawing:boolean)=>void;onChange:()=>void}>(function DrawingPad({disabled,onDrawingChange,onChange},ref){
  const canvas=useRef<HTMLCanvasElement>(null), pointer=useRef<number|null>(null), previous=useRef<Point>({x:0,y:0}), start=useRef<Point>({x:0,y:0});
  const beforeStroke=useRef<ImageData|null>(null), undoStack=useRef<ImageData[]>([]), redoStack=useRef<ImageData[]>([]);
  const [,setHistoryVersion]=useState(0);
  const [color,setColor]=useState('#800020'),[width,setWidth]=useState(18),[tool,setTool]=useState<Tool>('pen');
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
  const image=()=>{const el=canvas.current,ctx=el?.getContext('2d',{willReadFrequently:true});return el&&ctx?ctx.getImageData(0,0,el.width,el.height):null;};
  const commit=(before:ImageData|null)=>{
    if(!before)return;
    undoStack.current.push(before); if(undoStack.current.length>20)undoStack.current.shift();
    redoStack.current=[];setHistoryVersion(v=>v+1);onChange();
  };
  const travel=(direction:'undo'|'redo')=>{
    if(pointer.current!==null)return;
    const from=direction==='undo'?undoStack.current:redoStack.current,to=direction==='undo'?redoStack.current:undoStack.current;
    const state=from.pop(),current=image();if(!state||!current)return;
    to.push(current);canvas.current?.getContext('2d')?.putImageData(state,0,0);setHistoryVersion(v=>v+1);onChange();
  };
  const point=(event:PointerEvent<HTMLCanvasElement>)=>{
    const element=event.currentTarget,rect=element.getBoundingClientRect();
    return {x:(event.clientX-rect.left)*element.width/rect.width,y:(event.clientY-rect.top)*element.height/rect.height};
  };
  const stroke=(event:PointerEvent<HTMLCanvasElement>,first=false)=>{
    const context=event.currentTarget.getContext('2d');if(!context)return;
    const next=point(event);
    context.globalCompositeOperation=tool==='eraser'?'destination-out':'source-over';
    context.strokeStyle=color;context.fillStyle=color;context.lineWidth=tool==='eraser'?width*2:width;context.lineCap='round';context.lineJoin='round';
    if(tool==='pen'||tool==='eraser'){
      if(first){context.beginPath();context.arc(next.x,next.y,context.lineWidth/2,0,Math.PI*2);context.fill();}
      else{context.beginPath();context.moveTo(previous.current.x,previous.current.y);context.lineTo(next.x,next.y);context.stroke();}
    }else if(beforeStroke.current){
      context.putImageData(beforeStroke.current,0,0);context.beginPath();
      if(tool==='line'){context.moveTo(start.current.x,start.current.y);context.lineTo(next.x,next.y);}
      else if(tool==='rectangle')context.rect(start.current.x,start.current.y,next.x-start.current.x,next.y-start.current.y);
      else if(tool==='ellipse')context.ellipse((start.current.x+next.x)/2,(start.current.y+next.y)/2,Math.abs(next.x-start.current.x)/2,Math.abs(next.y-start.current.y)/2,0,0,Math.PI*2);
      context.stroke();
    }
    previous.current=next;
  };
  const fill=(event:PointerEvent<HTMLCanvasElement>)=>{
    const el=event.currentTarget,ctx=el.getContext('2d',{willReadFrequently:true});if(!ctx)return false;
    const p=point(event),x=Math.floor(p.x),y=Math.floor(p.y);if(x<0||y<0||x>=el.width||y>=el.height)return false;
    const pixels=ctx.getImageData(0,0,el.width,el.height),data=pixels.data,first=(y*el.width+x)*4;
    const target=[data[first],data[first+1],data[first+2],data[first+3]];
    const replacement=[parseInt(color.slice(1,3),16),parseInt(color.slice(3,5),16),parseInt(color.slice(5,7),16),255];
    if(target.every((value,i)=>value===replacement[i]))return false;
    const queue=new Uint32Array(el.width*el.height);let head=0,tail=0;
    const add=(index:number)=>{const offset=index*4;if(data[offset]!==target[0]||data[offset+1]!==target[1]||data[offset+2]!==target[2]||data[offset+3]!==target[3])return;data.set(replacement,offset);queue[tail++]=index;};
    add(y*el.width+x);
    while(head<tail){const index=queue[head++],column=index%el.width;if(column>0)add(index-1);if(column<el.width-1)add(index+1);if(index>=el.width)add(index-el.width);if(index<el.width*(el.height-1))add(index+el.width);}
    ctx.putImageData(pixels,0,0);return true;
  };
  const finish=(event:PointerEvent<HTMLCanvasElement>,cancel=false)=>{
    if(pointer.current!==event.pointerId)return;
    pointer.current=null;onDrawingChange(false);
    if(cancel&&beforeStroke.current)event.currentTarget.getContext('2d')?.putImageData(beforeStroke.current,0,0);
    else commit(beforeStroke.current);
    beforeStroke.current=null;
  };
  return <div className="drawing-pad">
    <div className="drawing-surface"><canvas ref={canvas} width={768} height={768} aria-label="캐릭터 그리기 영역" role="img"
      onPointerDown={event=>{if(disabled||pointer.current!==null||event.button!==0)return;event.preventDefault();const before=image();if(tool==='fill'){if(fill(event))commit(before);return;}beforeStroke.current=before;pointer.current=event.pointerId;event.currentTarget.setPointerCapture(event.pointerId);onDrawingChange(true);start.current=point(event);stroke(event,true);}}
      onPointerMove={event=>{if(pointer.current===event.pointerId&&!disabled){event.preventDefault();stroke(event);}}}
      onPointerUp={event=>finish(event)} onPointerCancel={event=>finish(event,true)} onLostPointerCapture={event=>finish(event,true)}/></div>
    <fieldset className="drawing-tools" disabled={disabled} aria-label="그리기 도구">
      <div className="drawing-tool-group" aria-label="도구 선택">
        {tools.map(({id,name,icon:Icon})=><button type="button" key={id} className={`small-button ${tool===id?'active':''}`} aria-pressed={tool===id} onClick={()=>setTool(id)}><Icon size={20}/>{name}</button>)}
      </div>
      <div className="drawing-history">
        <button type="button" className="small-button" disabled={!undoStack.current.length} onClick={()=>travel('undo')}><Undo2 size={20}/>실행 취소</button>
        <button type="button" className="small-button" disabled={!redoStack.current.length} onClick={()=>travel('redo')}><Redo2 size={20}/>다시 실행</button>
        <button type="button" className="small-button" onClick={()=>{if(pointer.current!==null)return;const before=image();canvas.current?.getContext('2d')?.clearRect(0,0,768,768);commit(before);}}><Trash2 size={20}/>모두 지우기</button>
      </div>
      <div className="drawing-color-group"><label>색상<input aria-label="펜 색상" type="color" value={color} onChange={event=>setColor(event.target.value)}/></label>
        <div className="drawing-swatches" aria-label="색상 팔레트">{colors.map(value=><button type="button" key={value} className={`drawing-swatch ${color===value?'active':''}`} style={{backgroundColor:value}} aria-label={`색상 ${value}`} aria-pressed={color===value} onClick={()=>setColor(value)}/>)}</div>
      </div>
      <label className="drawing-width">굵기<input aria-label="펜 굵기" type="range" min="1" max="80" value={width} onChange={event=>setWidth(+event.target.value)}/><output>{width}</output></label>
    </fieldset>
  </div>;
});
