import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

// Input records contain local generation paths; only portable provenance is published.
const input=process.argv[2];
if(!input)throw Error('Usage: node scripts/prepare-car-turnarounds.mjs <generation-records-directory>');
const content=JSON.parse(await fs.readFile('content/r3.json','utf8'));
const angles=['front-left','front','front-right','left','rear','right'];
const labels=['左前方','正前方','右前方','左侧','正后方','右侧'];
const records=await Promise.all(content.cars.map(car=>fs.readFile(path.join(input,car.id+'.json'),'utf8').then(JSON.parse)));
if(records.length!==30||new Set(records.map(r=>r.path)).size!==30)throw Error('Need 30 independently generated sheets');
await fs.mkdir('public/media/car-turnarounds',{recursive:true});
content.assets=content.assets.filter(a=>!a.id.startsWith('orbit-CAR'));
const provenance=[];
for(const car of content.cars){
 const record=records.find(r=>r.id===car.id);if(!record?.prompt||!record.path)throw Error('Missing generation record '+car.id);
 const original=await fs.readFile(record.path),meta=await sharp(original).metadata();
 if(!meta.width||!meta.height||Math.abs(meta.width/meta.height-1.5)>.03)throw Error('Sheet must be a 3 by 2 grid '+car.id);
 const views=[];
 for(let i=0;i<6;i++){
  const cw=Math.floor(meta.width/3),ch=Math.floor(meta.height/2);
  const crop={left:(i%3)*cw+5,top:Math.floor(i/3)*ch+5,width:cw-10,height:ch-10};
  const raw=await sharp(original).extract(crop).removeAlpha().raw().toBuffer({resolveWithObject:true});
  let left=crop.width,top=crop.height,right=0,bottom=0;
  // Mint is background. Include bright neutral bodywork as well as dark glass/tires.
  for(let y=0;y<raw.info.height;y++)for(let x=0;x<raw.info.width;x++){
   const k=(y*raw.info.width+x)*raw.info.channels,r=raw.data[k],g=raw.data[k+1],b=raw.data[k+2];
   const lo=Math.min(r,g,b),hi=Math.max(r,g,b),mint=g-r>5&&g>=b;
   if(lo<105||(!mint&&(hi-lo>35||lo<245))){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  }
  if(right-left<cw*.35||bottom-top<ch*.15)throw Error('Vehicle bounds not found '+car.id+'/'+angles[i]);
  const margin=18;
  const bx=Math.max(0,left-margin),by=Math.max(0,top-margin),bw=Math.min(crop.width,right+margin+1)-bx,bh=Math.min(crop.height,bottom+margin+1)-by;
  const bytes=await sharp(original).extract({left:crop.left+bx,top:crop.top+by,width:bw,height:bh}).resize(800,480,{fit:'contain',background:'#c8eedc'}).webp({quality:91}).toBuffer();
  const id=`orbit-${car.id}-${angles[i]}`,file=`media/car-turnarounds/${car.id.toLowerCase()}-${angles[i]}.webp`,sha256=createHash('sha256').update(bytes).digest('hex');
  await fs.writeFile(path.join('public',file),bytes);
  content.assets.push({id,kind:'image',path:file,width:800,height:480,sha256,status:'approved',source:'Built-in GPT Image; original game-car six-view sheet, cropped and encoded locally. Stylized brand-inspired interpretation, not manufacturer reference geometry.'});
  views.push({id:angles[i],image:id});
 }
 car.game.orbit=views;
 car.views=views.map((view,i)=>({...view,label:labels[i],caption:'GPT生成的同车多角度游戏外观；离散视图，不是连续三维扫描。',credit:{author:'CarPlayground / GPT Image',license:'Original AI-generated game illustration',licenseUrl:'https://openai.com/policies/terms-of-use/',sourceUrl:'https://github.com/kingiswenwen/carplayground'}}));
 provenance.push({id:car.id,tool:'Built-in GPT Image',generatedFile:path.basename(record.path),sheetSha256:createHash('sha256').update(original).digest('hex'),prompt:record.prompt,views,processing:'3 columns x 2 rows; crop, foreground bounds, contain 800x480 WebP. No perspective synthesis.',limits:'Six discrete CG views, not a photogrammetry scan or exact licensed manufacturer model.'});
}
content.id='r7-pictorial-3d-20261023.3';
await fs.writeFile('content/r3.json',JSON.stringify(content,null,2)+'\n');
await fs.writeFile('content/car-turnarounds-production.json',JSON.stringify(provenance,null,2)+'\n');
console.log('Prepared 30 game cars / 180 GPT-generated angle images with portable provenance.');
