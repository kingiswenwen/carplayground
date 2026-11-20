import type {RoadShape} from './learning';

const directions = [
  {key:'U',opposite:'D',x:0,y:-1},
  {key:'R',opposite:'L',x:1,y:0},
  {key:'D',opposite:'U',x:0,y:1},
  {key:'L',opposite:'R',x:-1,y:0},
] as const;

export function traceRoad(shapes:RoadShape[],width:number,end:number,closed:number[]=[]){
  const exits=(index:number)=>directions.flatMap(direction=>{
    const x=index%width+direction.x,y=Math.floor(index/width)+direction.y,to=y*width+x;
    return shapes[index].includes(direction.key)&&x>=0&&x<width&&y>=0&&to<shapes.length
      ?[{to,opposite:direction.opposite}]:[];
  });
  const queue=[[0]],visited=new Set<number>();
  let furthest=[0];
  while(queue.length){
    const path=queue.shift()!,index=path.at(-1)!;
    if(index===end)return {path,reached:true,gap:undefined};
    if(visited.has(index))continue;
    visited.add(index);
    if(path.length>furthest.length)furthest=path;
    for(const {to,opposite}of exits(index)){
      if(!closed.includes(to)&&!visited.has(to)&&shapes[to].includes(opposite))queue.push([...path,to]);
    }
  }
  const last=furthest.at(-1)!,previous=furthest.at(-2);
  const gap=exits(last).find(({to,opposite})=>to!==previous&&(closed.includes(to)||!shapes[to].includes(opposite)))?.to;
  return {path:furthest,reached:false,gap};
}
