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
const showcases=JSON.parse(await fs.readFile('content/showcase-production.json','utf8')) as {assetId:string;file:string;webSha256:string;review:{status:string;hotspots?:{id:string;x:number;y:number}[]};reference:{file:string;page:string;author:string;license:string;licenseUrl:string}}[];
const showcaseAssets=content.assets.filter(asset=>asset.path.startsWith('media/showcase/'));
if(showcases.length!==showcaseAssets.length||new Set(showcases.map(item=>item.assetId)).size!==showcases.length)throw Error('情境图生产清单与素材数量不一致');
for(const item of showcases){
  const asset=showcaseAssets.find(asset=>asset.id===item.assetId);
  if(!asset||asset.path!==item.file||asset.sha256!==item.webSha256||item.review.status!=='reviewed')throw Error(`情境图文件与审核不一致 ${item.assetId}`);
  if(!content.assets.some(asset=>asset.path===item.reference.file)||!item.reference.author||!item.reference.license||!URL.canParse(item.reference.page)||!URL.canParse(item.reference.licenseUrl))throw Error(`情境图参考缺失 ${item.assetId}`);
}
for(const car of content.cars){
  const source=showcases.find(item=>item.assetId===car.showcaseImage);
  if(!source||JSON.stringify(source.review.hotspots)!==JSON.stringify(car.showcaseHotspots))throw Error(`车型情境图热点未核对 ${car.id}`);
}
const photoSources=JSON.parse(await fs.readFile('content/photo-view-sources.json','utf8')) as {assetId:string;carId:string;view:string;file:string;status:string;webSha256:string;author:string;page:string;license:string;licenseUrl:string}[];
const views=content.cars.flatMap(car=>car.views.map(view=>({car,view})));
if(photoSources.length!==views.length||new Set(photoSources.map(source=>source.assetId)).size!==photoSources.length)throw Error('实拍视角来源数量或编号不一致');
for(const {car,view}of views){
  const source=photoSources.find(item=>item.assetId===view.image);
  const asset=content.assets.find(item=>item.id===view.image)!;
  if(!source||source.status!=='reviewed'||source.carId!==car.id||source.view!==view.id||source.webSha256!==asset.sha256||'media/'+source.file!==asset.path)throw Error(`视角与审核来源不一致 ${car.id}/${view.id}`);
  if(source.author!==view.credit.author||source.page!==view.credit.sourceUrl||source.license!==view.credit.license||source.licenseUrl!==view.credit.licenseUrl)throw Error(`实拍署名不一致 ${car.id}/${view.id}`);
}
console.log(`内容 ${content.id} 验证通过：${content.cars.length} 车型 / ${content.scenes.length} 场景 / ${content.activities.length} 活动 / ${content.stories.length} 故事 / ${content.assets.length} 素材，引用、审核状态、文件与 SHA-256 一致。`);
