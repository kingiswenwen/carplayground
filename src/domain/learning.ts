export const missingSpaces=(cars:number,spaces:number)=>Math.max(0,cars-spaces);
export const compareSpaces=(cars:number,spaces:number)=>spaces<cars?'不够':spaces===cars?'刚刚好':'有空位';
export const nextPattern=(sequence:string[])=>sequence.length%2===0?'red':'blue';
export const bridgeFits=(length:number,gap:number)=>length>=gap;
export type RoadShape='LR'|'UD'|'UR'|'RD'|'DL'|'LU';
export const roadShapes:RoadShape[]=['UD','LR','UR','RD','DL','LU'];
const dirs=[{key:'U',opposite:'D',dx:0,dy:-1},{key:'R',opposite:'L',dx:1,dy:0},{key:'D',opposite:'U',dx:0,dy:1},{key:'L',opposite:'R',dx:-1,dy:0}];
export function roadConnected(shapes:string[],width=3,start=0,end=8){const visited=new Set<number>();const queue=[start];while(queue.length){const i=queue.shift()!;if(i===end)return true;if(visited.has(i))continue;visited.add(i);for(const d of dirs){if(!shapes[i]?.includes(d.key))continue;const x=i%width+d.dx,y=Math.floor(i/width)+d.dy,j=y*width+x;if(x<0||x>=width||y<0||j>=shapes.length)continue;if(shapes[j]?.includes(d.opposite)&&!visited.has(j))queue.push(j);}}return false;}
