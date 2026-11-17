// Mechanical sprite extraction only; original generated art remains untouched.
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';

const source=process.argv[2];
if(!source)throw Error('Provide the original 4×4 transparent icon atlas');
const buffer=await fs.readFile(source),meta=await sharp(buffer).metadata();
const set=process.argv[3]||'primary';
if(!['primary','secondary','cart'].includes(set))throw Error('Icon set must be primary, secondary or cart');
const names=set==='primary'?['car','garage','world','tree','wheel','tool','sponge','bubbles','bag','coat','cap','water','friend','palette','book','lamp']:set==='secondary'?['hand','shower','umbrella','belt','sun','rain','home','bridge','plank','road','flag','heart','star','leaf','ball','ice']:['cart'];
const content=JSON.parse(await fs.readFile('content/r3.json','utf8'));
await fs.mkdir('public/media/play-icons',{recursive:true});
const records=[];
for(const [index,name]of names.entries()){
 const grid=set==='cart'?1:4,x=index%grid,y=Math.floor(index/grid),left=Math.round(x*meta.width/grid),top=Math.round(y*meta.height/grid),width=Math.round((x+1)*meta.width/grid)-left;
 // The bag cell has a tiny next-row cap fragment below its own contact shadow.
 const height=Math.round((y+1)*meta.height/grid)-top-(name==='bag'?14:0);
 const cell=await sharp(buffer).extract({left,top,width,height}).toBuffer();
 const output=await sharp(cell).trim({threshold:8}).resize(256,256,{fit:'contain',background:'#00000000'}).webp({quality:92,alphaQuality:100}).toBuffer();
 const path=`media/play-icons/${name}.webp`,sha256=createHash('sha256').update(output).digest('hex');
 await fs.writeFile('public/'+path,output);
 const asset={id:`play-icon-${name}`,kind:'image',path,sha256,status:'approved',width:256,height:256,source:'Origin: GPT Image generated miniature object atlas; content/play-icons-production.json'};
 const existing=content.assets.findIndex(a=>a.id===asset.id);if(existing<0)content.assets.push(asset);else content.assets[existing]=asset;
 records.push({name,path,sha256,width:256,height:256,atlas:set,cell:{left,top,width,height}});
}
await fs.writeFile('content/r3.json',JSON.stringify(content,null,2)+'\n');
let prior={atlases:[],icons:[]};try{prior=JSON.parse(await fs.readFile('content/play-icons-production.json','utf8'));}catch{}
await fs.writeFile('content/play-icons-production.json',JSON.stringify({generator:'GPT Image via image_gen',purpose:'Shared DOM and canvas teaching-object vocabulary; not replacement vehicle-model or hit geometry',atlases:[...(prior.atlases||[]).filter(a=>a.set!==set),{set,sha256:createHash('sha256').update(buffer).digest('hex'),width:meta.width,height:meta.height}],layout:'Primary/secondary: 4x4 row-major; cart: single sprite; alpha-preserving extraction and WebP encoding',style:'Rounded miniature objects, top-left studio light, soft contact shadows, warm cream/sage/teal/coral palette',icons:[...prior.icons.filter(a=>!names.includes(a.name)),...records]},null,2)+'\n');
console.log(`Prepared ${records.length} alpha WebP icons`);
