/** Crop reviewed GPT Image atlases into transparent catalogue illustrations.
 * Gameplay keeps its model-derived sprites and registered hit points. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const input=process.argv[2];if(!input)throw Error('Usage: prepare-catalog-illustrations <private reviewed atlas index>');
const sheets=JSON.parse(await fs.readFile(input,'utf8')),release=JSON.parse(await fs.readFile('content/r3.json','utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const records=[],assets=[],exports=[];
function cleanAlpha(data,width,height){
 const labels=new Int32Array(width*height).fill(-1),sizes=[],queue=new Int32Array(width*height);
 for(let i=0;i<labels.length;i++){
  if(data[i*4+3]<100){data[i*4+3]=0;continue;}
  if(labels[i]>=0)continue;
  const label=sizes.length;let head=0,tail=1;queue[0]=i;labels[i]=label;
  while(head<tail){const n=queue[head++],x=n%width,y=Math.floor(n/width);for(const [dx,dy]of [[-1,0],[1,0],[0,-1],[0,1]]){
   const nx=x+dx,ny=y+dy;if(nx<0||nx>=width||ny<0||ny>=height)continue;const next=ny*width+nx;
   if(labels[next]<0&&data[next*4+3]>=100){labels[next]=label;queue[tail++]=next;}
  }}sizes.push(tail);
 }
 const minimum=Math.max(40,Math.max(...sizes)*.003);
 for(let i=0;i<labels.length;i++)if(labels[i]<0||sizes[labels[i]]<minimum)data[i*4+3]=0;
 return data;
}
for(const sheet of sheets){
 const original=await fs.readFile(sheet.file),meta=await sharp(original).metadata();
 if(!meta.hasAlpha)throw Error('Atlas must have generated transparency');
 for(const cell of sheet.cells){
  const car=release.cars.find(c=>c.id===cell.id);if(!car)throw Error('Unknown active identity '+cell.id);
  if(records.some(r=>r.id===car.id))throw Error('Duplicate illustration '+car.id);
  const col=cell.index%sheet.columns,row=Math.floor(cell.index/sheet.columns);
  const left=sheet.columnCut?(col===0?0:sheet.columnCut):Math.floor(col*meta.width/sheet.columns),right=sheet.columnCut?(col===0?sheet.columnCut:meta.width):Math.floor((col+1)*meta.width/sheet.columns);
  const top=Math.floor(row*meta.height/sheet.rows),bottom=Math.floor((row+1)*meta.height/sheet.rows);
  const raw=await sharp(original).extract({left,top,width:right-left,height:bottom-top}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const cutout=await sharp(cleanAlpha(raw.data,raw.info.width,raw.info.height),{raw:raw.info}).trim({background:'#00000000',threshold:12}).resize({width:920,height:390,fit:'inside'}).png().toBuffer();
  const size=await sharp(cutout).metadata();
  const bytes=await sharp({create:{width:1000,height:450,channels:4,background:'#00000000'}}).composite([{input:cutout,left:Math.floor((1000-size.width)/2),top:Math.floor((450-size.height)/2)}]).webp({quality:88,alphaQuality:100}).toBuffer();
  const file=`media/catalog-illustrations/${car.id.toLowerCase()}-side.webp`,id=`illustration-${car.id}-side`;
  assets.push({id,kind:'image',path:file,sha256:sha(bytes),status:'approved',width:1000,height:450,source:`Built-in GPT Image illustration inspired by the real ${car.brand} ${car.model}. ${car.reference}. Game illustration; not a photograph, scan or engineering model.`});
  records.push({id:car.id,tool:'Built-in GPT Image',purpose:'Catalogue illustration; independent credited GLB used for 3D and model-derived sprites for gameplay.',prompt:sheet.prompt,generatedFile:path.basename(sheet.file),sheetSha256:sha(original),atlasFrame:{index:cell.index,columns:sheet.columns,rows:sheet.rows,bounds:{left,top,width:right-left,height:bottom-top}},asset:id,sha256:sha(bytes),reference:car.reference});
  car.illustrationImage=id;exports.push({file,bytes});
 }
}
for(const asset of assets){const index=release.assets.findIndex(a=>a.id===asset.id);if(index<0)release.assets.push(asset);else release.assets[index]=asset;}
for(const {file,bytes}of exports){await fs.mkdir(path.dirname('public/'+file),{recursive:true});await fs.writeFile('public/'+file,bytes);}
let previous=[];try{previous=JSON.parse(await fs.readFile('content/catalog-illustrations.json','utf8'));}catch{}
const merged=[...previous.filter(row=>release.cars.some(car=>car.id===row.id)&&!records.some(current=>current.id===row.id)),...records];
await fs.writeFile('content/r3.json',JSON.stringify(release,null,2)+'\n');
await fs.writeFile('content/catalog-illustrations.json',JSON.stringify(merged,null,2)+'\n');
console.log(`${records.length} real-vehicle GPT illustrations prepared with source sheets, frames and hashes.`);
