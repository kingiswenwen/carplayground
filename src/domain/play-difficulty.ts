import type {Car} from './content';
import type {Point,Rect} from './direct-play';
import {partRegions} from './play-guidance';

export type PlayDifficulty='gentle'|'explore';
/** Only motor precision changes. Semantic rules, touch pickup size, help and
 * completion requirements stay identical. Gentle is the original behaviour. */
const profiles={
  gentle:{placementScale:1,partScale:1,washScale:1},
  explore:{placementScale:.4,partScale:1,washScale:.85},
} as const;
export function playDifficulty(difficulty:PlayDifficulty='gentle'){return profiles[difficulty];}
export function hitDifficultyPart(car:Car,rect:Rect,point:Point,difficulty:PlayDifficulty='gentle'){
  const scale=playDifficulty(difficulty).partScale;
  return partRegions(car,rect).map(p=>({...p,distance:((point.x-p.x)/(p.rx*scale))**2+((point.y-p.y)/(p.ry*scale))**2}))
    .filter(p=>p.distance<=1).sort((a,b)=>a.distance-b.distance)[0]?.id;
}
/** Normalized geometric fallback on a real 3D mesh; named wheel/lamp meshes
 * remain semantically exact hits, independently of this tolerance. */
export function withinPartRange(value:number,min:number,max:number,scale:number){
  if(scale===1)return value>min&&value<max;
  const center=(min+max)/2,half=(max-min)/2*scale;
  return value>center-half&&value<center+half;
}
