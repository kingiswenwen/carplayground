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
const published = new Set(content.assets.map(a => a.path));
async function verifyDirectory(folder:string):Promise<void>{for(const entry of await fs.readdir(path.join('public',folder),{withFileTypes:true})){const local=folder+'/'+entry.name;if(entry.isDirectory())await verifyDirectory(local);else if(!published.has(local))throw new Error(`未登记素材 ${local}`);}}
await verifyDirectory('media');
const sources=JSON.parse(await fs.readFile('content/play-cars-production.json','utf8')) as {id:string;tool:string;generatedFile:string;prompt:string;views:{side:string;top:string};wheels:{x:number;y:number;r:number}[];checks:{transparentExport:boolean;distinctGeneratedSheet:boolean;dimensions:number[]}}[];
if(sources.length!==30||new Set(sources.map(s=>s.id)).size!==30||new Set(sources.map(s=>s.generatedFile)).size!==30)throw Error('需要30款独立生成跑车的完整来源记录');
for(const car of content.cars){
 const source=sources.find(s=>s.id===car.id);
 if(!car.game||!source||source.tool!=='Built-in GPT Image'||!source.prompt||!source.checks.transparentExport||source.views.side!==car.game.side||source.views.top!==car.game.top||JSON.stringify(source.wheels)!==JSON.stringify(car.game.wheels))throw Error('游戏跑车与生成记录不一致 '+car.id);
 if(car.image!==car.game.side||car.showcaseImage!==car.game.side||car.views.some(v=>!v.image.startsWith('play-CAR')))throw Error('游戏界面仍引用旧车图 '+car.id);
 for(const id of [car.game.side,car.game.top]){
  const asset=content.assets.find(a=>a.id===id);
  if(!asset?.path.startsWith('media/play-cars/'))throw Error('游戏车素材目录错误 '+id);
  const raw=await sharp(path.join('public',asset.path)).ensureAlpha().raw().toBuffer();
  let clear=0;for(let i=3;i<raw.length;i+=4)if(raw[i]<10)clear++;
  if(clear<1000*450*.15)throw Error('车辆缺少实际透明背景 '+id);
 }
}
console.log(`内容 ${content.id} 验证通过：${content.cars.length} 款新生成跑车 / 60 独立视图 / ${content.activities.length} 活动，透明度、引用、来源、文件与 SHA-256 一致。`);
