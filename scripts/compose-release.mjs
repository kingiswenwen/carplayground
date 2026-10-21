import fs from 'node:fs/promises';
import path from 'node:path';
import { verifyPackage } from './release-lib.mjs';
const args=process.argv.slice(2),outputIndex=args.indexOf('--output');
if(outputIndex<1||!args[outputIndex+1])throw Error('用法：node scripts/compose-release.mjs <当前包> [保留包...] --output <新目录>');
const sources=args.slice(0,outputIndex).map(p=>path.resolve(p)),destination=path.resolve(args[outputIndex+1]);
const manifests=[];for(const source of sources)manifests.push(await verifyPackage(source));
// A source may already retain older releases. Preserve every release's acceptance
// snapshot, including duplicates, so ordering cannot hide a conflicting record.
const releaseFields=['appReleaseId','appVersion','contentReleaseId','contentFingerprint','sourceCommit','kind','sourceDirty','outstanding','waived'];
const releases=new Map();
for(const manifest of manifests)for(const release of [manifest,...(manifest.retainedReleases||[])]){
  const record=Object.fromEntries(releaseFields.filter(key=>release[key]!==undefined).map(key=>[key,release[key]]));
  const prior=releases.get(record.appReleaseId);
  if(prior)for(const key of releaseFields){
    if(prior[key]!==undefined&&record[key]!==undefined&&JSON.stringify(prior[key])!==JSON.stringify(record[key]))throw Error(`版本元数据冲突：${record.appReleaseId} / ${key}`);
  }
  releases.set(record.appReleaseId,{...prior,...record});
}
const active=manifests[0];
const retainedReleases=[...releases.values()].filter(release=>release.appReleaseId!==active.appReleaseId);
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
  const manifest={...active,createdAt:new Date().toISOString(),files,totalBytes:files.reduce((sum,f)=>sum+f.bytes,0),retainedReleases};
  await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await verifyPackage(destination);
  console.log(`已组成入口 ${active.appReleaseId}，保留 ${retainedReleases.length} 个版本，校验 ${files.length} 个文件。`);
}catch(e){await fs.rm(destination,{recursive:true,force:true});console.error(`组合失败，未生成可用发布包：${destination}`);throw e;}
