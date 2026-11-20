import type {Mark} from '../services/storage';

export const standStamps=[
  {glyph:'lamp',shape:'sun',color:'#dca34d'},
  {glyph:'flag',shape:'stripe',color:'#9b6857'},
  {glyph:'tree',shape:'leaf',color:'#547e62'},
] as const satisfies readonly {glyph:string;shape:Mark['shape'];color:string}[];

export const standScenes=['#e5ddbe','#b5cabb','#cbb6aa'] as const;
export const standSceneNames=['暖色展厅','树荫展厅','晚霞展厅'] as const;

export const storyProps=[
  ['tree','friend','star'],
  ['flower','book','moon'],
] as const;

export type StoryAction={
  act:0|1;
  id:string;
  x:number;
  y:number;
};
