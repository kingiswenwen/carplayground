import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
export const MODEL_PART_BYTES=256*1024;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function writeModelParts(source,target,expectedHash){
 const bytes=await fs.readFile(source);if(hash(bytes)!==expectedHash)throw Error('Model source hash differs');
 const parts=[];for(let offset=0,index=0;offset<bytes.length;offset+=MODEL_PART_BYTES,index++){
  const data=bytes.subarray(offset,offset+MODEL_PART_BYTES),name=path.basename(target)+`.part-${String(index).padStart(3,'0')}.bin`;
  await fs.writeFile(path.join(path.dirname(target),name),data);parts.push({path:name,bytes:data.length,sha256:hash(data)});
 }
 await fs.writeFile(target+'.parts.json',JSON.stringify({format:'model-parts-v1',bytes:bytes.length,sha256:expectedHash,parts})+'\n');
}
export async function verifyModelParts(site,contentId,asset,byPath){
 if(asset.delivery?.format!=='model-parts-v1'||asset.delivery.path!==asset.path+'.parts.json')throw Error('Invalid model delivery reference');
 const filename=`media/${contentId}/${asset.delivery.path.replace(/^media\//,'')}`;
 if(!byPath.has(filename))throw Error('Missing model delivery manifest');
 const data=JSON.parse(await fs.readFile(path.join(site,filename),'utf8')),stem=path.basename(asset.path),whole=createHash('sha256');let total=0;
 if(data.format!=='model-parts-v1'||data.sha256!==asset.sha256||!Number.isSafeInteger(data.bytes)||data.bytes<=0||data.bytes>64*1024*1024||!Array.isArray(data.parts)||!data.parts.length||data.parts.length>256)throw Error('Invalid model delivery manifest');
 for(const [index,part] of data.parts.entries()){
  if(part.path!==`${stem}.part-${String(index).padStart(3,'0')}.bin`||!Number.isSafeInteger(part.bytes)||part.bytes<=0||part.bytes>MODEL_PART_BYTES)throw Error('Invalid model delivery part');
  const name=path.posix.join(path.posix.dirname(filename),part.path),entry=byPath.get(name);
  if(!entry||entry.bytes!==part.bytes||entry.sha256!==part.sha256)throw Error('Model delivery part differs');
  const bytes=await fs.readFile(path.join(site,name));whole.update(bytes);total+=bytes.length;
 }
 if(total!==data.bytes||whole.digest('hex')!==asset.sha256)throw Error('Reassembled model hash differs');
}
