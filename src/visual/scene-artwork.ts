import {assetUrl,type ActivityId} from '../domain/content';
import type {Rect} from '../domain/direct-play';
import {loadImage} from '../services/load-image';
import type {Mark} from '../services/storage';

const imageSize={width:1122,height:1402};
const parkingCourt={prefix:'parking',background:'backdrop',objects:['bay','barrier','spare']} as const;
const salon={prefix:'salon',background:'backdrop',objects:['lamp','flag','tree']} as const;
const crew={prefix:'crew',background:'backdrop',objects:['partner','barrier','cart','wrench','sponge']} as const;
const definitions={
  T02:{prefix:'bridge',background:'river',objects:['plank','shutter']},
  E03:{prefix:'crossing',background:'backdrop',objects:['signal','pedestrian']},
  A01:{prefix:'poster',background:'backdrop',objects:['leaf','sun','star']},
  H03:{prefix:'wash',background:'backdrop',objects:['shower','sponge']},
  E01:{prefix:'showroom',background:'backdrop',objects:['stage','spotlight']},
  P01:{prefix:'motion',background:'backdrop',objects:['smooth','rough']},
  S02:{prefix:'shadow',background:'backdrop',objects:['lamp']},
  T04:{prefix:'assembly',background:'backdrop',objects:['flag']},
  T01:{prefix:'parts',background:'backdrop',objects:['flag','passenger']},
  S01:{prefix:'rolling',background:'backdrop',objects:['ball','cube','gate']},
  A02:{prefix:'tracks',background:'backdrop',objects:['stripe','zigzag','circle']},
  M01:parkingCourt,
  M02:parkingCourt,
  M03:parkingCourt,
  L03:parkingCourt,
  M04:{prefix:'parade',background:'backdrop',objects:['gate']},
  E02:salon,
  C01:salon,
  T03:{prefix:'road',background:'backdrop',objects:['straight','bend']},
  H02:crew,
  L02:crew,
  S03:{prefix:'rain',background:'backdrop',objects:['cloud','umbrella','coat','cap','bottle']},
  L01:{prefix:'trip',background:'backdrop',objects:['bottle','hat','belt','gate']},
  H01:{prefix:'visit',background:'backdrop',objects:['park','library','museum','book']},
  C02:{prefix:'sequence',background:'backdrop',objects:['door','belt','flag']},
  C03:{prefix:'story',background:'backdrop',objects:['garden','door','tree','friend','star']},
} as const;

export function hasSceneArtwork(id:ActivityId):id is keyof typeof definitions{
  return id in definitions;
}

export const studioStickers=['leaf','sun','star'] as const;
export type StudioSticker=typeof studioStickers[number];
export function studioSticker(shape:Mark['shape']):StudioSticker|undefined{
  return studioStickers.find(id=>id===shape);
}
export function studioStickerUrl(shape:StudioSticker){
  return assetUrl(`poster-scene-${shape}`);
}

const stickerHue:Record<StudioSticker,number>={leaf:84,sun:42,star:16};
export function studioStickerFilter(shape:StudioSticker,color:string){
  const hue=color==='#477da8'?203:color==='#6e9154'?99:16;
  return `hue-rotate(${hue-stickerHue[shape]}deg)`;
}
export function getMarkIllustration(mark:Mark):{url:string;filter?:string}|undefined{
  if(mark.art==='paper-sticker'){
    const shape=studioSticker(mark.shape);
    if(shape)return {url:studioStickerUrl(shape),filter:studioStickerFilter(shape,mark.color)};
  }
  if(mark.art==='showroom-prop'){
    const prop=mark.shape==='sun'?'lamp':mark.shape==='stripe'?'flag':mark.shape==='leaf'?'tree':undefined;
    if(prop)return {url:assetUrl('salon-scene-'+prop)};
  }
}
export function drawStudioSticker(context:CanvasRenderingContext2D,image:CanvasImageSource,shape:StudioSticker,rect:Rect,color?:string){
  context.save();
  if(color)context.filter=studioStickerFilter(shape,color);
  context.drawImage(image,rect.x-rect.w/2,rect.y-rect.h/2,rect.w,rect.h);
  context.restore();
}

export class SceneArtwork {
  private backdrop=document.createElement('canvas');
  private backdropKey='';
  private constructor(private images:Map<string,HTMLImageElement>,private background:string){}

  static async load(id:keyof typeof definitions,signal:AbortSignal){
    const {prefix,background,objects}=definitions[id];
    const sources:[string,string][]=[background,...objects].map(name=>[name,`${prefix}-scene-${name}`]);
    if(id==='C02')sources.push(['shower','wash-scene-shower']);
    if(id==='C03')sources.push(['book','visit-scene-book']);
    const layers=await Promise.all(sources.map(async ([name,asset])=>[
      name,await loadImage(assetUrl(asset),signal,12000,true),
    ] as const));
    return new SceneArtwork(new Map(layers),background);
  }

  drawBackdrop(
    context:CanvasRenderingContext2D,height:number,
    sourceX:readonly number[],targetX:readonly number[],sourceY:readonly number[],targetY:readonly number[],
    layer=this.background,
  ){
    const key=[layer,height,...targetX,...targetY].join('/');
    if(this.backdropKey!==key){
      this.backdropKey=key;this.backdrop.width=1000;this.backdrop.height=height;
      const canvas=this.backdrop.getContext('2d')!,image=this.images.get(layer)!;
      const sx=[0,...sourceX,imageSize.width],dx=[0,...targetX,1000];
      const sy=[0,...sourceY,imageSize.height],dy=[0,...targetY,height];
      for(let row=0;row<sy.length-1;row++)for(let column=0;column<sx.length-1;column++){
        canvas.drawImage(image,sx[column],sy[row],sx[column+1]-sx[column],sy[row+1]-sy[row],
          dx[column],dy[row],dx[column+1]-dx[column],dy[row+1]-dy[row]);
      }
    }
    context.drawImage(this.backdrop,0,0);
  }

  drawLayer(context:CanvasRenderingContext2D,name:string,rect:Rect){
    const image=this.images.get(name);
    if(image)context.drawImage(image,rect.x-rect.w/2,rect.y-rect.h/2,rect.w,rect.h);
  }

  drawSticker(context:CanvasRenderingContext2D,shape:StudioSticker,rect:Rect,color?:string){
    drawStudioSticker(context,this.images.get(shape)!,shape,rect,color);
  }
}
