export type Crop = { left:number;top:number;right:number;bottom:number };
export function removeBackgroundPixels(data:Uint8ClampedArray,color:string,tolerance:number){
  const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
  const thresholdSquared=(tolerance*4.42)**2;
  for(let i=0;i<data.length;i+=4){
    const red=data[i]-rgb[0],green=data[i+1]-rgb[1],blue=data[i+2]-rgb[2];
    if(red*red+green*green+blue*blue<=thresholdSquared)data[i+3]=0;
  }
  return data;
}
export function processImage(source:CanvasImageSource,width:number,height:number,crop:Crop,background:{enabled:boolean;color:string;tolerance:number}){
  const result=document.createElement('canvas'),x=width*crop.left/100,y=height*crop.top/100,w=width*(crop.right-crop.left)/100,h=height*(crop.bottom-crop.top)/100;
  const scale=Math.min(1,1024/Math.max(w,h));result.width=Math.max(1,Math.round(w*scale));result.height=Math.max(1,Math.round(h*scale));
  const ctx=result.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(source,x,y,w,h,0,0,result.width,result.height);
  if(background.enabled){const pixels=ctx.getImageData(0,0,result.width,result.height);removeBackgroundPixels(pixels.data,background.color,background.tolerance);ctx.putImageData(pixels,0,0);}
  return result;
}
