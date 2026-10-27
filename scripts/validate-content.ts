import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { content } from '../src/domain/content';

const publicRoot = path.resolve('public');
for (const asset of content.assets) {
  const filename = path.resolve(publicRoot, asset.path);
  if (!filename.startsWith(publicRoot + path.sep)) throw new Error(`路径越界 ${asset.id}`);
  const bytes = await fs.readFile(filename);
  if (!bytes.length) throw new Error(`空素材 ${asset.id}`);
  if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error(`哈希不匹配 ${asset.id}`);
  if (asset.kind === 'image') {
    const meta = await sharp(bytes).metadata();
    if (meta.width !== asset.width || meta.height !== asset.height) throw new Error(`图片尺寸不匹配 ${asset.id}`);
  }
}
const origins=[...JSON.parse(await fs.readFile('content/model-renders.json','utf8')),...JSON.parse(await fs.readFile('content/retired-car-previews.json','utf8'))] as {origins?:{path:string;sha256:string}[]}[];
const published = new Set(content.assets.map(a => a.path));
for(const record of origins)for(const origin of record.origins||[]){if(!/^media\/rendered-cars\/car\d{2,3}-[\w-]+\.webp\.json$/.test(origin.path))throw Error('渲染来源路径无效');const bytes=await fs.readFile(path.join('public',origin.path));if(createHash('sha256').update(bytes).digest('hex')!==origin.sha256||!JSON.parse(bytes.toString()).prompt?.startsWith('Origin:'))throw Error('渲染来源凭据无效 '+origin.path);published.add(origin.path);}
async function verifyDirectory(folder:string):Promise<void>{for(const entry of await fs.readdir(path.join('public',folder),{withFileTypes:true})){const local=folder+'/'+entry.name;if(entry.isDirectory())await verifyDirectory(local);else if(!published.has(local))throw new Error(`未登记素材 ${local}`);}}
await verifyDirectory('media');
const sources=JSON.parse(await fs.readFile('content/play-cars-production.json','utf8')) as {id:string;tool:string;generatedFile:string;sheetSha256?:string;atlasFrame?:{row:number;columns:{side:number;top:number}};prompt:string;views:{side:string;top:string};wheels:{x:number;y:number;r:number}[];checks:{transparentExport:boolean;distinctGeneratedSheet:boolean;distinctVehicleFrame?:boolean;dimensions:number[]}}[];
if(sources.length!==30||new Set(sources.map(s=>s.id)).size!==30||new Set(sources.map(s=>`${s.generatedFile}#${s.atlasFrame?.row||'whole'}`)).size!==30)throw Error('需要30款跑车各自的完整来源与独立图帧记录');
for(const source of sources)if(source.atlasFrame&&(!source.checks.distinctVehicleFrame||!source.sheetSha256?.match(/^[a-f0-9]{64}$/)||source.atlasFrame.row<1||source.atlasFrame.row>5||source.atlasFrame.columns.side!==1||source.atlasFrame.columns.top!==2))throw Error('玩具车图集来源或图帧无效 '+source.id);
for(const car of content.cars){
 if(car.game?.side.startsWith('render-'))continue;
 const source=sources.find(s=>s.id===car.id);
 if(!car.game||!source||source.tool!=='Built-in GPT Image'||!source.prompt||!source.checks.transparentExport||source.views.side!==car.game.side||source.views.top!==car.game.top||JSON.stringify(source.wheels)!==JSON.stringify(car.game.wheels))throw Error('游戏跑车与生成记录不一致 '+car.id);
 if(car.image!==car.game.side||car.showcaseImage!==car.game.side||car.views.some(v=>!v.image.startsWith('orbit-CAR')))throw Error('游戏界面仍引用旧车图 '+car.id);
 for(const id of [car.game.side,car.game.top]){
  const asset=content.assets.find(a=>a.id===id);
  if(!asset?.path.startsWith('media/play-cars/'))throw Error('游戏车素材目录错误 '+id);
  const raw=await sharp(path.join('public',asset.path)).ensureAlpha().raw().toBuffer();
  let clear=0;for(let i=3;i<raw.length;i+=4)if(raw[i]<10)clear++;
  if(clear<1000*450*.15)throw Error('车辆缺少实际透明背景 '+id);
  if(id===car.game.side){
   const alpha=(x:number,y:number)=>raw[(Math.round(y)*1000+Math.round(x))*4+3]||0;
   for(const point of car.hotspots)if(point.x<=0||point.x>=1||point.y<=0||point.y>=1||alpha(point.x*1000,point.y*450)<100)throw Error('部件中心落在透明区域 '+car.id+' '+point.id);
   for(const wheel of car.game.wheels){
    if(wheel.r<.06||wheel.r>.13||alpha(wheel.x*1000,wheel.y*450)<100)throw Error('轮子中心或半径无效 '+car.id);
    let solid=0;for(let angle=0;angle<12;angle++){const a=angle*Math.PI/6;if(alpha(wheel.x*1000+Math.cos(a)*wheel.r*750,wheel.y*450+Math.sin(a)*wheel.r*750)>100)solid++;}
    if(solid<10)throw Error('轮子轮廓注册偏离实际图像 '+car.id);
   }
  }
 }
}
console.log(`内容 ${content.id} 验证通过：${content.cars.length} 款车型 / ${content.activities.length} 活动，透明度、引用、来源、文件与 SHA-256 一致。`);

const models=JSON.parse(await fs.readFile('content/vehicle-models.json','utf8')) as {id:string;catalogKey:string;file:string;sha256:string;bytes:number;playFile?:string;playBytes?:number;playSha256?:string;source:{url:string;author:string;license:string;licenseUrl:string;modifications:string}}[];
if(!models.length||new Set(models.map(m=>m.id)).size!==models.length)throw Error('车型模型记录缺失或重复');
for(const [label,values]of [['车型模型系列',models.map(m=>m.catalogKey)],['模型文件',models.map(m=>m.file)],['模型内容',models.map(m=>m.sha256)],['模型来源',models.map(m=>m.source.url)]] as const)if(new Set(values).size!==values.length)throw Error(label+'重复');
if(content.assets.filter(a=>a.kind==='model'&&!a.id.startsWith('model-play-')).length!==models.length)throw Error('模型清单与素材登记不一致');
for(const model of models){
 if(!content.cars.some(c=>c.id===model.id&&c.catalogKey===model.catalogKey)||!/^media\/models\/car\d{2,3}\.glb$/.test(model.file)||!model.source.author||!model.source.url.startsWith('https://sketchfab.com/3d-models/')||!['CC BY 4.0','CC BY-SA 4.0','CC0 1.0'].includes(model.source.license)||!model.source.licenseUrl.startsWith('https://creativecommons.org/')||!model.source.modifications)throw Error('车型模型来源与署名不完整 '+model.id);
 const b=await fs.readFile(path.join('public',model.file));if(b.toString('utf8',0,4)!=='glTF'||b.readUInt32LE(4)!==2||b.readUInt32LE(8)!==b.length||b.length!==model.bytes||createHash('sha256').update(b).digest('hex')!==model.sha256)throw Error('模型文件损坏 '+model.id);
 if(model.playFile){const lod=await fs.readFile(path.join('public',model.playFile));if(lod.length!==model.playBytes||createHash('sha256').update(lod).digest('hex')!==model.playSha256||!content.assets.some(a=>a.id==='model-play-'+model.id&&a.sha256===model.playSha256))throw Error('玩法模型哈希不一致 '+model.id);}
 const gltf=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());if((gltf.buffers||[]).some((b:{uri?:string})=>b.uri)||(gltf.images||[]).some((i:{uri?:string})=>i.uri))throw Error('模型含外部运行时依赖 '+model.id);
}
console.log(`${models.length}款独立车型GLB、来源署名与文件哈希一致；其余车型使用六角度图，不替换成通用车身。`);

const turnarounds=JSON.parse(await fs.readFile('content/car-turnarounds-production.json','utf8')) as {id:string;tool:string;generatedFile:string;sheetSha256:string;prompt:string;views:{id:string;image:string}[]}[];
if(turnarounds.length!==30||new Set(turnarounds.map(s=>s.id)).size!==30||new Set(turnarounds.map(s=>s.generatedFile)).size!==30||new Set(turnarounds.map(s=>s.sheetSha256)).size!==30)throw Error('需要30款独立生成的多角度车辆记录');
for(const car of content.cars.filter(c=>!c.game?.side.startsWith('render-'))){const source=turnarounds.find(s=>s.id===car.id);if(!car.game?.orbit||!source||source.tool!=='Built-in GPT Image'||!source.prompt||JSON.stringify(car.game.orbit)!==JSON.stringify(source.views)||car.game.orbit.map(v=>v.id).join(',')!=='front-left,front,front-right,left,rear,right')throw Error('多角度车图与来源记录不一致 '+car.id);for(const view of car.game.orbit){const asset=content.assets.find(a=>a.id===view.image);if(!asset?.path.startsWith('media/car-turnarounds/')||asset.width!==800||asset.height!==480||!car.views.some(v=>v.id===view.id&&v.image===view.image))throw Error('多角度车图引用错误 '+car.id);}}
console.log('保留的30款历史GPT多角度生成来源记录、当前图像引用与尺寸一致。');

const renders=JSON.parse(await fs.readFile('content/model-renders.json','utf8')) as {id:string;sourceModelSha256:string;assets:{id:string;sha256:string}[];wheels:unknown[];bounds:number[];triangles:number}[];
for(const car of content.cars.filter(c=>c.game?.side.startsWith('render-'))){const record=renders.find(r=>r.id===car.id),model=models.find(m=>m.id===car.id);if(!record||!model||record.sourceModelSha256!==model.sha256||record.triangles<100||record.bounds.some(n=>!Number.isFinite(n)||n<=0)||!record.assets.some(a=>a.id===car.game!.side)||!record.assets.some(a=>a.id===car.game!.top))throw Error('模型衍生预览不完整 '+car.id);for(const image of record.assets){if(!content.assets.some(a=>a.id===image.id&&a.sha256===image.sha256))throw Error('模型渲染素材登记不一致 '+image.id);}}
console.log(`${renders.length}款模型衍生预览通过来源模型哈希与引用核对。`);
