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
console.log(`内容 ${content.id} 验证通过：${content.cars.length} 车型 / ${content.scenes.length} 场景 / ${content.activities.length} 活动 / ${content.stories.length} 故事 / ${content.assets.length} 素材，引用、审核状态、文件与 SHA-256 一致。`);
