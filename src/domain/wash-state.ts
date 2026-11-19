import type {Point} from './direct-play';
export type WashKind='loose'|'stubborn'|'foam';
export type WashTool='water'|'sponge';
export type WashPatch=Point&{id:number;rx:number;ry:number;clean:boolean;kind?:WashKind};
export function cleansWith(patch:WashPatch,tool:WashTool){
  return !patch.clean&&(tool==='sponge'?(patch.kind||'loose')==='stubborn':patch.kind!=='stubborn');
}
export type WashSurfacePoint={x:number;y:number;z:number};
/** One immutable population per car, shared by every presentation. Renderers
 * may project these identities, but never replace the population/denominator. */
export class WashState{
  readonly patches:WashPatch[];
  layout:WashSurfacePoint[]|null=null;
  revision=0;
  constructor(points:Omit<WashPatch,'clean'>[]){this.patches=points.map(p=>({...p,clean:false}));}
  get coverage(){return this.patches.length?this.patches.filter(p=>p.clean).length/this.patches.length:0;}
  clean(ids:readonly number[]){const wanted=new Set(ids);let changed=false;for(const p of this.patches)if(!p.clean&&wanted.has(p.id)){p.clean=true;changed=true;}if(changed)this.revision++;return changed;}
  apply(ids:readonly number[],tool:WashTool){
    const wanted=new Set(ids);
    let changed=false;
    for(const patch of this.patches){
      if(!wanted.has(patch.id)||!cleansWith(patch,tool))continue;
      if(tool==='sponge')patch.kind='foam';
      else patch.clean=true;
      changed=true;
    }
    if(changed)this.revision++;
    return changed;
  }
  wipe(a:Point,b:Point,radius:number,tool?:WashTool){
    const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
    const ids=this.patches.filter(p=>{const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<=radius;}).map(p=>p.id);
    return tool?this.apply(ids,tool):this.clean(ids);
  }
  setLayout(points:WashSurfacePoint[]){if(!this.layout&&points.length===this.patches.length)this.layout=points.map(p=>({...p}));}
}
