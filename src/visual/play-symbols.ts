import {assetUrl,content} from '../domain/content';
import embedded from './play-icon-previews';

const aliases:Record<string,string>={'🏡':'home','🏠':'garage','🏎️':'car','🚗':'car','🚙':'car','🌳':'tree','☀️':'sun','☁️':'cloud','🌧️':'rain','☂️':'umbrella','🧽':'sponge','🫧':'bubbles','🚿':'shower','🛞':'wheel','🔧':'tool','🌉':'bridge','🪵':'plank','🛣️':'road','🏁':'flag','🎒':'bag','🧥':'coat','🧢':'cap','🥤':'water','🪑':'seat','🧑‍🔧':'friend','🤝':'friend','🫂':'friend','💛':'heart','👋':'greeting','👆':'hand','🖐️':'greeting','⭐':'star','✨':'sparkle','🔦':'lamp','💡':'light','🎨':'palette','🖍️':'pencil','📚':'book','📖':'book','🦋':'butterfly','🌼':'flower','🦕':'dinosaur','🦴':'bone','🐻':'bear','⌛':'hourglass','➜':'arrow','✓':'check','😊':'smile','😟':'worried','🌒':'moon','⚽':'ball','🧊':'ice','🛑':'stop','🔴':'red','🔵':'blue','💦':'shower','📦':'box','🛒':'cart','🎪':'home','🅿️':'parking','💨':'arrow','🌈':'world','👀':'smile'};
export function symbolName(name:string){return aliases[name]||name;}

const previews=new Map(Object.entries(embedded));
const icons=new Set(content.assets.filter(asset=>asset.id.startsWith('play-icon-')).map(asset=>asset.id));
const canvasIcons=[
  'home','garage','car','world','tree','sun','cloud','rain','umbrella','sponge','bubbles','shower',
  'wheel','tool','bridge','plank','road','flag','bag','coat','cap','water','belt','seat','friend','heart',
  'hand','star','sparkle','lamp','palette','pencil','book','flower','butterfly','dinosaur','bone','bear',
  'clock','arrow','light','smile','worried','leaf','moon','ball','ice','stop','red','blue','white','box',
  'cart','paper','signal','parking','hourglass','greeting','check','landmark','briefcase',
];
export function symbolImage(name:string){
  const id=`play-icon-${symbolName(name)}`;
  return icons.has(id)?assetUrl(id):undefined;
}
export function symbolPreview(name:string){
  return `data:image/webp;base64,${previews.get(symbolName(name))||embedded.star}`;
}

const images=new Map<string,HTMLImageElement>();
let loading:Promise<void>|undefined;
export function loadPlaySymbols(){
  return loading??=Promise.all(canvasIcons.map(async name=>{
    const image=new Image();
    // Preserve an origin-clean canvas for exported works and previews.
    image.crossOrigin='anonymous';
    image.src=symbolImage(name)||symbolPreview(name);
    try{await image.decode();}catch{image.src=symbolPreview(name);await image.decode();}
    images.set(name,image);
  })).then(()=>{}).catch(error=>{loading=undefined;throw error;});
}
export function drawPlaySymbol(ctx:CanvasRenderingContext2D,name:string,x:number,y:number,size:number){
  const image=images.get(symbolName(name));
  if(!image)return false;
  ctx.drawImage(image,x-size/2,y-size/2,size,size);
  return true;
}
