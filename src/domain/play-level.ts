import type {ActivityId} from './content';
export type ContentLevel='starter'|'discover';
export type PlayPart='wheel'|'door'|'light';
export function normalizeContentLevel(value?:ContentLevel):ContentLevel{return value==='starter'?'starter':'discover';}
const levels={
  starter:{colors:['red','blue'],parts:['wheel'],parkingCars:1},
  discover:{colors:['red','blue','white'],parts:['wheel','light','door'],parkingCars:2},
} as const;
/** Content changes the actual tasks, never the size of a child's touch target.
 * Only E01, E02/T01 and M01 have these stages; all other activities are unchanged. */
export function playLevel(value?:ContentLevel){return levels[normalizeContentLevel(value)];}
export function stageGoal(id:ActivityId,level?:ContentLevel):string|undefined{
  const starter=normalizeContentLevel(level)==='starter';
  if(id==='E01')return starter?'先玩红、蓝两色：按当前可见颜色给小车配对。':'探索红、蓝、白三色：按当前可见颜色给小车配对。';
  if(id==='E02'||id==='T01')return starter?'先找一个部件：触碰真实车轮，看看它的位置与反馈。':'探索三个部件：分别触碰车轮、车灯和车门。';
  if(id==='M01')return starter?'先停一辆车：把小车放进一个大车位。':'探索两辆车：让两辆小车分别停进车位。';
}
export function starterCompletion(id:ActivityId,level?:ContentLevel):string|undefined{
  if(normalizeContentLevel(level)!=='starter')return;
  if(id==='E01')return '红、蓝两种颜色都找到朋友了。';
  if(id==='E02'||id==='T01')return '你找到车轮了，看看它怎样帮助小车移动。';
  if(id==='M01')return '一辆小车停进自己的大车位了。';
}
export function starterInstruction(id:ActivityId,level?:ContentLevel):string|undefined{
  if(normalizeContentLevel(level)!=='starter')return;
  return id==='E01'?'color-red':id==='E02'||id==='T01'?'wheel':id==='M01'?'phrase-park':undefined;
}
