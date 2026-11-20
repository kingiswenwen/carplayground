import type {Mark} from '../services/storage';
const previewSize=64;
const previews=new Map<string,string>();

export function paintMarkPreview(shape:Mark['shape'],color:string){
 const key=shape+color;
 const cached=previews.get(key);if(cached)return cached;
 const image=document.createElement('canvas');image.width=image.height=previewSize;
 const ctx=image.getContext('2d');
 if(ctx){
  ctx.shadowColor='#38241932';ctx.shadowBlur=2;ctx.shadowOffsetY=1;
  paintMark(ctx,{shape,color,x:.5,y:.5},previewSize,previewSize);
 }
 const url=image.toDataURL();
 if(previews.size>=128){const first=previews.keys().next().value;if(first)previews.delete(first);}
 previews.set(key,url);
 return url;
}
export function paintMark(ctx:CanvasRenderingContext2D,mark:Mark,width:number,height:number,scale=1){const x=mark.x*width,y=mark.y*height;ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.fillStyle=mark.color;ctx.strokeStyle=mark.color;ctx.lineWidth=5;ctx.beginPath();if(mark.shape==='star'){for(let i=0;i<10;i++){const angle=i*Math.PI/5-Math.PI/2,r=i%2?10:24;const px=Math.cos(angle)*r,py=Math.sin(angle)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fill();}else if(mark.shape==='leaf'){ctx.ellipse(0,0,12,25,Math.PI/4,0,Math.PI*2);ctx.fill();}else if(mark.shape==='stripe'){for(let i=-2;i<=2;i++)ctx.fillRect(i*10-3,-27,5,54);}else if(mark.shape==='zigzag'){ctx.moveTo(-26,-20);ctx.lineTo(0,-8);ctx.lineTo(-20,6);ctx.lineTo(24,24);ctx.stroke();}else{ctx.arc(0,0,mark.shape==='sun'?21:15,0,Math.PI*2);ctx.fill();if(mark.shape==='sun')for(let i=0;i<8;i++){ctx.rotate(Math.PI/4);ctx.fillRect(26,-2,8,4);}}ctx.restore();}
