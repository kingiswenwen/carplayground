import {distance,type Point,type Rect} from './direct-play';
import type {Mark} from '../services/storage';

export const treadShapes=['stripe','zigzag','circle'] as const;
export const treadNames=['横条轮纹','折线轮纹','圆点轮纹'] as const;
export type TreadShape=typeof treadShapes[number];

export function addTreadMarks(
  marks:Mark[],from:Point,to:Point,paper:Rect,height:number,shape:TreadShape,color:string,
){
  const count=Math.floor(distance(from,to)/19);
  if(!count)return from;
  const length=distance(from,to);
  const dx=(to.x-from.x)/length,dy=(to.y-from.y)/length;
  for(let i=1;i<=count;i++){
    const x=from.x+dx*i*19,y=from.y+dy*i*19;
    for(const side of [-1,1]){
      const markX=x-side*dy*14,markY=y+side*dx*14;
      if(Math.abs(markX-paper.x)>paper.w/2-15||Math.abs(markY-paper.y)>paper.h/2-15)continue;
      marks.push({x:markX/1000,y:markY/height,color,shape});
    }
  }
  return {x:from.x+dx*count*19,y:from.y+dy*count*19};
}
