/** Catch atlas neighbours left outside the main subject after transparent export. */
export function assertIllustrationSubject(data:Uint8Array,width:number,height:number,id:string){
 const seen=new Uint8Array(width*height),queue=new Int32Array(width*height);
 const parts:{left:number;right:number;top:number;bottom:number;pixels:number}[]=[];
 for(let start=0;start<seen.length;start++){
  if(seen[start]||data[start*4+3]<100)continue;
  let head=0,tail=1;queue[0]=start;seen[start]=1;
  const part={left:width,right:0,top:height,bottom:0,pixels:0};
  while(head<tail){
   const index=queue[head++],x=index%width,y=Math.floor(index/width);
   part.left=Math.min(part.left,x);part.right=Math.max(part.right,x);part.top=Math.min(part.top,y);part.bottom=Math.max(part.bottom,y);
   for(const [dx,dy]of [[-1,0],[1,0],[0,-1],[0,1]]){
    const nx=x+dx,ny=y+dy;if(nx<0||nx>=width||ny<0||ny>=height)continue;
    const next=ny*width+nx;if(!seen[next]&&data[next*4+3]>=100){seen[next]=1;queue[tail++]=next;}
   }
  }
  part.pixels=tail;parts.push(part);
 }
 parts.sort((a,b)=>b.pixels-a.pixels);const main=parts[0];
 if(!main)throw Error('车型插画主体为空 '+id);
 if(main.left<20||main.top<20||main.right>=width-20||main.bottom>=height-20)throw Error('车型插画缺少完整主体留白 '+id);
 // Detached wheels or highlights within the car's bounds are legitimate. A
 // substantial fragment entirely beyond those bounds needs visual review.
 const fragment=parts.slice(1).find(part=>part.pixels>main.pixels*.003&&
  (part.right<main.left||part.left>main.right||part.bottom<main.top||part.top>main.bottom));
 if(fragment)throw Error('车型插画主体外残留独立碎片 '+id);
}
