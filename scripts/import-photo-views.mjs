import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const sources=JSON.parse(await fs.readFile('content/photo-view-sources.json','utf8'));
const cache=path.resolve(process.argv[2]||path.join(os.homedir(),'.cache/carplayground-photo-references'));
if(cache===process.cwd()||cache.startsWith(process.cwd()+path.sep))throw Error('参考文件必须存放在仓库以外');
await fs.mkdir(cache,{recursive:true});
for(const item of sources){
  if(!/^views\/car0[1-8]-[a-z-]+\.webp$/.test(item.file)||item.status!=='reviewed')throw Error('未审核或不安全的素材记录');
  const source=path.join(cache,item.assetId+'.jpg');
  let bytes;try{bytes=await fs.readFile(source);}catch{
    const url=new URL(item.downloadUrl);if(!['thumb.wikimedia.org','upload.wikimedia.org'].includes(url.hostname))throw Error('来源主机不在已核对范围');
    const response=await fetch(url);if(!response.ok)throw Error(`参考下载失败 ${item.assetId}: ${response.status}`);bytes=Buffer.from(await response.arrayBuffer());await fs.writeFile(source,bytes);
  }
  const target=path.join('public/media',item.file);await fs.mkdir(path.dirname(target),{recursive:true});
  await sharp(bytes).rotate().resize({width:1200,withoutEnlargement:true}).webp({quality:84}).toFile(target);
  item.downloadSha256=createHash('sha256').update(bytes).digest('hex');
  item.webSha256=createHash('sha256').update(await fs.readFile(target)).digest('hex');
  console.log(item.assetId);
}
await fs.writeFile('content/photo-view-sources.json',JSON.stringify(sources,null,2)+'\n');
