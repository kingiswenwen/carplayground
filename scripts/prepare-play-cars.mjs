// Convert newly generated two-view sheets to registered, transparent game sprites.
// The input index lives outside Git and may contain local generation paths.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
const index=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
if(index.length!==30||new Set(index.map(x=>x.id)).size!==30||index.some(x=>!x.path))throw Error('需要30款独立生成的跑车，不能用缺失或重复的图片补数');
await fs.mkdir('public/media/play-cars',{recursive:true});
const content=JSON.parse(await fs.readFile('content/r3.json','utf8'));
const production=[];
const assets=content.assets.filter(a=>a.kind==='audio'||a.path.startsWith('media/scenes/'));
const cars=[];
const original=new Map(content.cars.map(c=>[c.id,c]));
for(const entry of [...index].sort((a,b)=>a.id.localeCompare(b.id))){
 const raw=await sharp(entry.path).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const {width,height}=raw.info;
 let split=Math.floor(height/2),best=Infinity;
 for(let y=Math.floor(height*.42);y<height*.57;y++){
  let count=0;for(let x=0;x<width;x++)if(raw.data[(y*width+x)*4+3]>100)count++;
  const score=count+Math.abs(y-height/2)*.01;
  if(score<best){best=score;split=y;}
 }
 const game={side:`play-${entry.id}-side`,top:`play-${entry.id}-top`,wheels:[]};
 for(const [view,top,h]of [['side',0,split],['top',split,height-split]]){
  const file=`media/play-cars/${entry.id.toLowerCase()}-${view}.webp`;
  const frame=await sharp(entry.path).extract({left:0,top,width,height:h}).png().toBuffer();
  const buffer=await sharp(frame).trim({background:'#00000000',threshold:15}).resize({width:1000,height:450,fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).webp({quality:92,alphaQuality:100}).toBuffer();
  await fs.writeFile(path.join('public',file),buffer);
  const image=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let transparent=0,opaque=0;for(let i=3;i<image.data.length;i+=4){if(image.data[i]<10)transparent++;if(image.data[i]>180)opaque++;}
  if(transparent<image.info.width*image.info.height*.15||opaque<12000)throw Error(`${entry.id}/${view}透明或主体检查失败`);
  if(view==='side'){
   const scores=new Float64Array(1000);
   for(let x=0;x<1000;x++)for(let y=245;y<420;y++){
    const p=(y*1000+x)*4;if(image.data[p+3]>180&&Math.max(image.data[p],image.data[p+1],image.data[p+2])<95)scores[x]++;
   }
   for(const [lo,hi]of [[130,380],[630,890]]){
    let bestX=lo,bestScore=0;
    for(let x=lo;x<hi;x++){let score=0;for(let dx=-20;dx<=20;dx++)score+=scores[x+dx]||0;if(score>bestScore){bestScore=score;bestX=x;}}
    let bottom=245;for(let y=245;y<440;y++)for(let x=bestX-5;x<=bestX+5;x++)if(image.data[(y*1000+x)*4+3]>160)bottom=y;
    const radius=75;game.wheels.push({x:bestX/1000,y:(bottom-radius)/450,r:radius/1000});
   }
  }
  assets.push({id:game[view],kind:'image',path:file,sha256:createHash('sha256').update(buffer).digest('hex'),status:'approved',width:1000,height:450,source:`Built-in GPT Image: newly rendered ${entry.brand} ${entry.model} game sprite, ${view} view; two-view sheet exported to transparent WebP. Game interpretation, not a photograph or mechanical reference.`});
 }
 const old=original.get(entry.id)||original.get('CAR02');
 const car={...old,id:entry.id,name:`${entry.zhBrand} ${entry.model}`,zhBrand:entry.zhBrand,brand:entry.brand,model:entry.model,edition:'游戏跑车',color:entry.color,game,
  image:game.side,displayImage:game.side,showcaseImage:game.side,showcaseObservationPoints:undefined,reference:'https://openai.com/',
  audio:original.has(entry.id)?old.audio:'car',
  observation:'摸摸车轮，看看车灯，带它去乐园动动手。',
  hotspots:[{id:'wheel',zh:'车轮',x:game.wheels[1].x,y:game.wheels[1].y},{id:'door',zh:'车门',x:.51,y:.51},{id:'light',zh:'车灯',x:.9,y:.47}],
  views:[{id:'side',image:game.side,label:'侧面',caption:'重新生成的游戏跑车侧面',credit:{author:'GPT Image',license:'Generated game artwork',licenseUrl:'https://openai.com/policies/terms-of-use/',sourceUrl:'https://openai.com/'}},{id:'top',image:game.top,label:'俯视',caption:'重新生成的游戏跑车俯视',credit:{author:'GPT Image',license:'Generated game artwork',licenseUrl:'https://openai.com/policies/terms-of-use/',sourceUrl:'https://openai.com/'}}]};
 car.showcaseHotspots=car.hotspots;
 cars.push(car);
 production.push({id:entry.id,brand:entry.brand,model:entry.model,color:entry.color,tool:'Built-in GPT Image',intent:'new generation, not a source-photograph extraction',prompt:entry.prompt,generatedFile:path.basename(entry.path),views:{side:game.side,top:game.top},wheels:game.wheels,checks:{transparentExport:true,distinctGeneratedSheet:true,dimensions:[1000,450]},review:'Game interpretation. Inspect visual identity, frame separation and wheel registration in the rendered contact sheet and actual scenes.'});
}
for(const [id,sourceId]of [['showcase-CAR01','play-CAR01-side'],['story-parking','scene-parking'],['story-travel','scene-travel']]){const source=assets.find(a=>a.id===sourceId);assets.push({...source,id});}
content.cars=cars;content.assets=assets;
content.car.images={white:'play-CAR15-side',red:'play-CAR02-side',blue:'play-CAR11-side'};
for(const activity of content.activities){activity.carIds=cars.map(c=>c.id);activity.version++;}
content.id='r6-direct-touch-20261023';
await fs.writeFile('content/r3.json',JSON.stringify(content,null,2)+'\n');
await fs.writeFile('content/play-cars-production.json',JSON.stringify(production,null,2)+'\n');
console.log(`Registered ${cars.length} newly generated cars and ${production.length*2} game views.`);
