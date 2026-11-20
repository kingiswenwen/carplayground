import type {ComponentPropsWithoutRef} from 'react';
import {PlaySymbol} from './PlaySymbol';

type IconProps=Omit<ComponentPropsWithoutRef<'span'>,'children'> & {
  size?:number;
  fill?:string;
};

function icon(name:string,mirror=false){
  return function TownIcon({size,style,className='',fill:_fill,...props}:IconProps){
    const dimensions=size?{width:size,height:size}:undefined;
    return <PlaySymbol {...props} name={name}
      className={`town-icon${mirror?' town-icon-mirror':''} ${className}`}
      style={{...dimensions,...style}}/>;
  };
}

export const ArrowLeft=icon('arrow',true);
export const ArrowRight=icon('arrow');
export const Backpack=icon('bag');
export const BookOpen=icon('book');
export const Box=icon('cube');
export const Briefcase=icon('briefcase');
export const Camera=icon('camera');
export const Check=icon('check');
export const ChevronDown=icon('chevron');
export const CircleDashed=icon('wheel');
export const CircleHelp=icon('help');
export const CloudRain=icon('rain');
export const Download=icon('download');
export const Droplets=icon('bubbles');
export const Flag=icon('flag');
export const Hand=icon('hand');
export const HandHelping=icon('friend');
export const Landmark=icon('landmark');
export const Layers=icon('layers');
export const Minus=icon('minus');
export const MousePointer2=icon('pointer');
export const MoveHorizontal=icon('move');
export const Music2=icon('music');
export const Pause=icon('pause');
export const Play=icon('play');
export const Plus=icon('plus');
export const RefreshCw=icon('refresh');
export const Rotate3D=icon('orbit');
export const RotateCcw=icon('retry');
export const RotateCw=icon('retry',true);
export const Save=icon('save');
export const Scan=icon('scan');
export const Search=icon('search');
export const ShieldCheck=icon('shield');
export const Smartphone=icon('phone');
export const Sun=icon('sun');
export const Trash2=icon('trash');
export const TreePine=icon('tree');
export const Upload=icon('upload');
export const Users=icon('family');
export const Volume2=icon('sound');
export const VolumeX=icon('muted');
export const Wrench=icon('tool');
export const X=icon('close');

const HeartOutline=icon('heart-outline');
const HeartSolid=icon('heart');
export function Heart({fill,...props}:IconProps){
  return fill&&fill!=='none'?<HeartSolid {...props}/>:<HeartOutline {...props}/>;
}
