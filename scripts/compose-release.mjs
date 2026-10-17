import fs from 'node:fs/promises';
import path from 'node:path';
import { verifyPackage } from './release-lib.mjs';
const args=process.argv.slice(2),outputIndex=args.indexOf('--output');
if(outputIndex<1||!args[outputIndex+1])throw Error('用法：node scripts/compose-release.mjs <当前包> [保留包...] --output <新目录>');
const sources=args.slice(0,outputIndex).map(p=>path.resolve(p)),destination=path.resolve(args[outputIndex+1]);
const manifests=[];for(const source of sources)manifests.push(await verifyPackage(source));
await fs.mkdir(path.dirname(destination),{recursive:true});
await fs.mkdir(destination,{recursive:false});
const combined=new Map();
try {
  for(let i=0;i<sources.length;i++)for(const file of manifests[i].files){
    if(file.path==='index.html'&&i>0)continue;
    const prior=combined.get(file.path);
    if(prior){if(prior.sha256!==file.sha256)throw Error(`不可变文件冲突：${file.path}`);continue;}
    const target=path.join(destination,'site',file.path);await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.copyFile(path.join(sources[i],'site',file.path),target);combined.set(file.path,file);
  }
  const files=[...combined.values()].sort((a,b)=>a.path.localeCompare(b.path));
  const active=manifests[0];
  const manifest={...active,createdAt:new Date().toISOString(),files,totalBytes:files.reduce((sum,f)=>sum+f.bytes,0),retainedReleases:manifests.slice(1).map(m=>({appReleaseId:m.appReleaseId,contentReleaseId:m.contentReleaseId,sourceCommit:m.sourceCommit}))};
  await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await verifyPackage(destination);
  console.log(`已组成入口 ${active.appReleaseId}，保留 ${manifests.length-1} 个版本，校验 ${files.length} 个文件。`);
}catch(e){console.error(`组合失败，未生成可用发布包：${destination}`);throw e;}
