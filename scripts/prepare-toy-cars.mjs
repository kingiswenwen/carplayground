// Import a private generation index. Only frame provenance and production assets
// are written to public source; local source paths never enter content metadata.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
const input=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
if(input.length!==6||new Set(input.map(x=>x.file)).size!==6)throw Error('Expected six distinct five-car atlases');
const content=JSON.parse(await fs.readFile('content/r3.json','utf8'));
const packageInfo=JSON.parse(await fs.readFile('package.json','utf8'));
const exports=[],obsolete=new Set(),production=[],seen=new Set(),sha=b=>createHash('sha256').update(b).digest('hex');

function cut(projection,ratio){
 const center=Math.floor(projection.length*ratio),radius=Math.floor(projection.length*.075);
 const candidates=[];let start=-1;
 const threshold=Math.max(3,Math.min(...projection.slice(center-radius,center+radius))+8);
 for(let i=center-radius;i<=center+radius;i++){
  if(projection[i]<=threshold){if(start<0)start=i;}
  else if(start>=0){candidates.push({at:Math.round((start+i-1)/2),width:i-start});start=-1;}
 }
 if(start>=0)candidates.push({at:Math.round((start+center+radius)/2),width:center+radius-start});
 candidates.sort((a,b)=>(Math.abs(a.at-center)-a.width*.2)-(Math.abs(b.at-center)-b.width*.2));
 if(!candidates.length)throw Error('Cannot locate a transparent frame gutter');
 return candidates[0].at;
}
function clean(data,width,height){
 const labels=new Int32Array(width*height);labels.fill(-1);const sizes=[],queue=new Int32Array(width*height);
 for(let i=0;i<labels.length;i++){
  if(data[i*4+3]<40){data[i*4+3]=0;continue;}
  if(labels[i]>=0)continue;
  const id=sizes.length;let head=0,tail=1;queue[0]=i;labels[i]=id;
  while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const nx=x+dx,ny=y+dy;if(nx<0||nx>=width||ny<0||ny>=height)continue;
   const next=ny*width+nx;if(labels[next]<0&&data[next*4+3]>=40){labels[next]=id;queue[tail++]=next;}
  }}sizes.push(tail);
 }
 const largest=Math.max(...sizes),minimum=Math.max(30,largest*.0015);
 for(let i=0;i<labels.length;i++)if(labels[i]<0||sizes[labels[i]]<minimum){data[i*4]=data[i*4+1]=data[i*4+2]=data[i*4+3]=0;}
 return data;
}
function wheels(data){
 // Each generated toy has a colored hub surrounded by its neutral tire/rim.
 // Locate the isolated color island, then measure its opaque bottom contour.
 return [[110,350],[650,880]].map(([lo,hi])=>{
  const mask=new Uint8Array(1000*450),queue=new Int32Array(1000*450),components=[];
  for(let y=240;y<410;y++)for(let x=lo;x<hi;x++){const p=(y*1000+x)*4,r=data[p],g=data[p+1],b=data[p+2];if(data[p+3]>160&&Math.max(r,g,b)-Math.min(r,g,b)>80&&Math.max(r,g,b)>140)mask[y*1000+x]=1;}
  for(let y=240;y<410;y++)for(let x=lo;x<hi;x++){
   const p=y*1000+x;if(mask[p]!==1)continue;
   let head=0,tail=1,sx=0,sy=0;queue[0]=p;mask[p]=2;
   while(head<tail){const n=queue[head++];sx+=n%1000;sy+=Math.floor(n/1000);for(const k of [n-1,n+1,n-1000,n+1000])if(mask[k]===1){mask[k]=2;queue[tail++]=k;}}
   if(tail>=400&&tail<=3000)components.push({x:sx/tail,y:sy/tail});
  }
  const center=lo<400?215:760;
  const hub=components.filter(p=>p.x>lo+20&&p.x<hi-20&&p.y>260&&p.y<380).sort((a,b)=>Math.abs(a.x-center)-Math.abs(b.x-center))[0];
  if(!hub)throw Error('Wheel hub needs manual registration');
  let bottom=0;for(let y=Math.ceil(hub.y);y<435;y++)if(data[(y*1000+Math.round(hub.x))*4+3]>160)bottom=y;
  const radius=bottom-hub.y+2;if(radius<60||radius>115)throw Error('Wheel contour needs manual registration');
  return {x:hub.x/1000,y:hub.y/450,r:radius/1000};
 });
}

for(const atlas of input){
 const file=await fs.readFile(atlas.file),raw=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const {width,height}=raw.info,rows=new Array(height).fill(0),cols=new Array(width).fill(0);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(raw.data[(y*width+x)*4+3]>150){rows[y]++;cols[x]++;}
 const horizontal=[0,...[1,2,3,4].map(n=>cut(rows,n/5)),height],vertical=[0,cut(cols,.5),width];
 for(let row=0;row<5;row++){
  const id='CAR'+String(atlas.firstCar+row).padStart(2,'0'),car=content.cars.find(c=>c.id===id);
  if(!car||seen.has(id))throw Error('Missing or repeated car '+id);seen.add(id);
  const game=car.game;
  let sourceBytes=file,sourcePath=atlas.file,sourcePrompt=atlas.prompt,sourceRow=row,sourceHorizontal=horizontal,sourceVertical=vertical;
  const replacement=atlas.replacements?.find(r=>r.id===id);
  if(replacement){
   sourceBytes=await fs.readFile(replacement.file);sourcePath=replacement.file;sourcePrompt=replacement.prompt;sourceRow=0;
   const replacementRaw=await sharp(sourceBytes).ensureAlpha().raw().toBuffer({resolveWithObject:true}),rw=replacementRaw.info.width,rh=replacementRaw.info.height;
   const columnCounts=new Array(rw).fill(0);for(let y=0;y<rh;y++)for(let x=0;x<rw;x++)if(replacementRaw.data[(y*rw+x)*4+3]>150)columnCounts[x]++;
   sourceHorizontal=[0,rh];sourceVertical=[0,cut(columnCounts,.5),rw];
  }
  for(const [column,view]of ['side','top'].entries()){
   const rect={left:sourceVertical[column],top:sourceHorizontal[sourceRow],width:sourceVertical[column+1]-sourceVertical[column],height:sourceHorizontal[sourceRow+1]-sourceHorizontal[sourceRow]};
   const cell=await sharp(sourceBytes).extract(rect).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   const cleaned=await sharp(clean(cell.data,cell.info.width,cell.info.height),{raw:cell.info}).trim({background:'#00000000',threshold:15}).resize({width:940,height:400,fit:'inside'}).png().toBuffer();
   const size=await sharp(cleaned).metadata();
   const buffer=await sharp({create:{width:1000,height:450,channels:4,background:'#00000000'}}).composite([{input:cleaned,left:Math.floor((1000-size.width)/2),top:Math.floor((450-size.height)/2)}]).webp({quality:92,alphaQuality:100}).toBuffer();
   const asset=content.assets.find(a=>a.id===game[view]),previous=asset.path;
   asset.path=`media/play-cars/toy-${id.toLowerCase()}-${view}.webp`;asset.sha256=sha(buffer);asset.width=1000;asset.height=450;
   asset.source=`Built-in GPT Image: ${car.color} ${car.brand} ${car.model}-inspired toy interpretation; atlas ${path.basename(sourcePath)}, row ${sourceRow+1}, ${view} view. Not a photograph or an engineering reference.`;
   exports.push({path:path.join('public',asset.path),buffer});
   if(previous!==asset.path)obsolete.add(path.join('public',previous));
   if(view==='side')game.wheels=wheels(await sharp(buffer).ensureAlpha().raw().toBuffer());
  }
  car.edition='玩具游戏跑车';car.observation='摸摸玩具车轮，看看车灯，带它去乐园动动手。';
  car.hotspots=[{id:'wheel',zh:'车轮',x:game.wheels[1].x,y:game.wheels[1].y},{id:'door',zh:'车门',x:.51,y:.56},{id:'light',zh:'车灯',x:.9,y:.46}];
  const lightCenters={CAR03:{x:.88,y:.50},CAR06:{x:.885,y:.49},CAR07:{x:.885,y:.49},CAR25:{x:.9,y:.49}};
  if(lightCenters[id])Object.assign(car.hotspots.find(p=>p.id==='light'),lightCenters[id]);
  car.showcaseHotspots=car.hotspots;
  production.push({id:car.id,brand:car.brand,model:car.model,color:car.color,tool:'Built-in GPT Image',intent:'new toy-style generation from vehicle identity and toy-style references',prompt:sourcePrompt,generatedFile:path.basename(sourcePath),sheetSha256:sha(sourceBytes),atlasFrame:{row:sourceRow+1,columns:{side:1,top:2},bounds:{x:sourceVertical,y:sourceHorizontal}},views:{side:game.side,top:game.top},wheels:game.wheels,checks:{transparentExport:true,distinctGeneratedSheet:false,distinctVehicleFrame:true,dimensions:[1000,450]},review:'Toy interpretation, not an exact brand replica. Review silhouettes, color, frame separation, wheel circles and hotspots in the contact sheet and actual play.'});
 }
}
if(seen.size!==30)throw Error('Expected thirty toy vehicles');
// Shared aliases must follow the new bytes as well.
for(const asset of content.assets.filter(a=>a.path.startsWith('media/play-cars/')&&!a.id.startsWith('play-'))){const car=content.cars.find(c=>c.showcaseImage===`play-${asset.id.replace('showcase-','')}-side`);if(car){const source=content.assets.find(a=>a.id===car.game.side);Object.assign(asset,{...source,id:asset.id});}}
const releaseId=`r9-toy-journey-${packageInfo.version}`;
if(content.id!==releaseId)for(const activity of content.activities)activity.version++;
content.id=releaseId;content.appVersion=packageInfo.version;
// Compute and validate every frame before touching production files.
for(const item of exports)await fs.writeFile(item.path,item.buffer);
for(const filename of obsolete)await fs.unlink(filename);
await fs.writeFile('content/r3.json',JSON.stringify(content,null,2)+'\n');
await fs.writeFile('content/play-cars-production.json',JSON.stringify(production,null,2)+'\n');
console.log(`Imported ${seen.size} toys from ${input.length} atlases; sixty transparent, registered views.`);
