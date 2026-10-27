import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { headersFor, listFiles, sha256, verifyPackage, readinessSnapshot } from './release-lib.mjs';
import {writeModelParts} from './model-delivery.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
function option(name,fallback) { const i=args.indexOf(name);if(i<0)return fallback;if(!args[i+1]||args[i+1].startsWith('--'))throw Error(`缺少参数 ${name}`);return args[i+1]; }
const kind=option('--kind','review');
if(!['review','family'].includes(kind)) throw Error('--kind 只接受 review 或 family');
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const content=JSON.parse(await fs.readFile(path.join(root,'content/r3.json'),'utf8'));
for(const asset of content.assets)if(asset.kind==='model'&&(await fs.stat(path.join(root,'public',asset.path))).size>512*1024)asset.delivery={format:'model-parts-v1',path:asset.path+'.parts.json'};
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const dirty=Boolean(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim());
const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
const id=option('--id',`app-${pkg.version}-${stamp}-${commit.slice(0,8)}`);
for(const value of [id,content.id])if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value))throw Error('版本编号不安全');
const outputRoot=path.resolve(option('--output',path.join(root,'.release-artifacts')));
if(outputRoot===root || root.startsWith(outputRoot+path.sep))throw Error('输出目录不能覆盖源码或其父目录');
const destination=path.join(outputRoot,id);
try{await fs.access(destination);throw Error(`拒绝覆盖已有发布包：${id}`);}catch(e){if(e.code!=='ENOENT')throw e;}
const readinessPath=path.join(root,'content/publication-readiness.json');
const readiness=JSON.parse(await fs.readFile(readinessPath,'utf8'));
const {outstanding,waived}=readinessSnapshot(readiness);
if(kind==='family'&&(dirty||outstanding.length))throw Error(`正式家庭发布条件未完成：${JSON.stringify({dirty,outstanding},null,2)}`);
const contentFingerprint=sha256(JSON.stringify({manifest:content,media:content.assets.map(a=>[a.path,a.sha256])}));
await fs.mkdir(outputRoot,{recursive:true});
for(const sibling of await fs.readdir(outputRoot,{withFileTypes:true}))if(sibling.isDirectory()) {
  let prior;try{prior=JSON.parse(await fs.readFile(path.join(outputRoot,sibling.name,'manifest.json'),'utf8'));}catch{continue;}
  if(prior.contentReleaseId===content.id&&prior.contentFingerprint!==contentFingerprint)throw Error('相同内容版本已有不同内容；请先创建新 contentReleaseId');
}
const npm=process.platform==='win32'?'npm.cmd':'npm';
execFileSync(npm,['run','build','--','--base',`/releases/${id}/`],{cwd:root,stdio:'inherit',env:{...process.env,VITE_MEDIA_BASE_URL:`/media/${content.id}/`,VITE_APP_RELEASE_ID:id,VITE_MODEL_PARTS:'1'}});
const temporary=path.join(outputRoot,`.preparing-${id}-${process.pid}`);
await fs.mkdir(temporary,{recursive:false});
try {
  const site=path.join(temporary,'site');
  const release=path.join(site,'releases',id);
  await fs.mkdir(release,{recursive:true});
  await fs.cp(path.join(root,'dist/assets'),path.join(release,'assets'),{recursive:true,errorOnExist:true,force:false});
  await fs.copyFile(path.join(root,'dist/index.html'),path.join(release,'index.html'));
  await fs.copyFile(path.join(root,'dist/index.html'),path.join(site,'index.html'));
  await fs.mkdir(path.join(site,'content',content.id),{recursive:true});
  await fs.writeFile(path.join(site,'content',content.id,'manifest.json'),JSON.stringify(content,null,2)+'\n');
  for(const asset of content.assets) {
    const relative=asset.path.replace(/^media\//,'');
    const target=path.join(site,'media',content.id,relative);
    await fs.mkdir(path.dirname(target),{recursive:true});
    if(asset.delivery)await writeModelParts(path.join(root,'public',asset.path),target,asset.sha256);
    else await fs.copyFile(path.join(root,'public',asset.path),target);
    // Raster origin sidecars travel with their approved image, just as embedded
    // metadata does. They are included in the package hash manifest below.
    if(asset.kind==='image') {
      const origin=path.join(root,'public',asset.path+'.json');
      try{await fs.copyFile(origin,target+'.json');}catch(error){if(error.code!=='ENOENT')throw error;}
    }
  }
  const files=[];
  for(const filename of await listFiles(site)) {const bytes=await fs.readFile(path.join(site,filename));files.push({path:filename,bytes:bytes.length,sha256:sha256(bytes),headers:headersFor(filename)});}
  const manifest={formatVersion:1,kind,appReleaseId:id,appVersion:pkg.version,contentReleaseId:content.id,contentFingerprint,sourceCommit:commit,sourceDirty:dirty,createdAt:new Date().toISOString(),outstanding,waived,files,totalBytes:files.reduce((sum,f)=>sum+f.bytes,0),promotion:{lastObject:'index.html',keepPreviousVersions:2,deleteOldObjects:false}};
  await fs.writeFile(path.join(temporary,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await verifyPackage(temporary);
  await fs.rename(temporary,destination);
  console.log(JSON.stringify({packageDirectory:destination,appReleaseId:id,contentReleaseId:content.id,kind,files:files.length,bytes:manifest.totalBytes,outstanding:outstanding.map(x=>x.id),waived:waived.map(x=>x.id)},null,2));
}catch(e){await fs.rm(temporary,{recursive:true,force:true});throw e;}
