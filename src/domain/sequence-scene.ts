export const sequenceScenes=[
  {
    name:'去公园',
    next:'换成洗车前',
    steps:[
      {name:'关车门',glyph:'garage',clip:'sequence-pack'},
      {name:'扣安全带',glyph:'belt',clip:'sequence-belt'},
      {name:'开车出发',glyph:'flag',clip:'sequence-go'},
    ],
    blocked:['车门还开着，小车停下来等。','安全带还没扣，小车停下来等。'],
  },
  {
    name:'洗车前',
    next:'换成去公园',
    steps:[
      {name:'关车窗',glyph:'garage',clip:undefined},
      {name:'停进洗车位',glyph:'flag',clip:undefined},
      {name:'打开喷头',glyph:'shower',clip:'rain'},
    ],
    blocked:['车窗还开着，先别喷水。','小车还没停进洗车位，先别喷水。'],
  },
] as const;

export function missingPrerequisite(order:readonly number[],index:number){
  if(order[index]!==2)return -1;
  return [0,1].find(step=>!order.slice(0,index).includes(step))??-1;
}
