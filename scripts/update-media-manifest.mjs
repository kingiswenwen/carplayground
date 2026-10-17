import fs from 'node:fs';import {createHash}from'node:crypto';import{execFileSync}from'node:child_process';import sharp from'sharp';
const file='content/r3.json';const release=JSON.parse(fs.readFileSync(file,'utf8'));
const sources=JSON.parse(fs.readFileSync('content/photo-sources.json','utf8'));
for(const c of release.cars){const s=sources.find(s=>s.id===c.id);if(s){c.credit=s;c.color=({CAR03:'白色实拍',CAR04:'橙色实拍',CAR05:'黑蓝双色实拍',CAR06:'黄色实拍',CAR07:'蓝色实拍',CAR08:'绿色实拍'})[c.id]||c.color;}}
const images=[...['white','red','blue'].map(c=>({id:'img-'+c,path:`media/revuelto-${c}.webp`,source:release.assets.find(a=>a.id==='img-'+c).source})),...sources.map(s=>({id:'photo-'+s.id,path:`media/${s.id.toLowerCase()}.webp`,source:`${s.author}; ${s.page}; ${s.license}; ${s.licenseUrl}; resized/WebP; derivative retains source license.`}))];
const productionFile='content/scene-production.json';
if(fs.existsSync(productionFile))for(const item of JSON.parse(fs.readFileSync(productionFile,'utf8')))images.push({id:item.kind==='scene'?'scene-'+item.id:'cutout-'+item.id,path:'media/'+item.file,source:item.source});
const assets=[];
for(const im of images){const bytes=fs.readFileSync('public/'+im.path);const meta=await sharp(bytes).metadata();assets.push({...im,kind:'image',status:'approved',width:meta.width,height:meta.height,sha256:createHash('sha256').update(bytes).digest('hex')});}
for(const id of Object.keys(release.speech)){const path=`media/${id}.mp3`;if(!fs.existsSync('public/'+path))throw Error('缺声音 '+id);const bytes=fs.readFileSync('public/'+path);const duration=Number(execFileSync('ffprobe',['-v','quiet','-show_entries','format=duration','-of','csv=p=0','public/'+path],{encoding:'utf8'}).trim());assets.push({id,path,kind:'audio',status:'approved',sha256:createHash('sha256').update(bytes).digest('hex'),duration,source:'Production Edge TTS Xiaoxiao/Jenny -12%; text, file and duration checked; local review only.'});}
release.assets=assets;fs.writeFileSync(file,JSON.stringify(release,null,2)+'\n');console.log(`${release.cars.length} cars, ${release.activities.length} activities, ${assets.length} assets`);
