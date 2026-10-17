import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sha256, verifyPackage } from './release-lib.mjs';
if(!process.argv[2])throw Error('用法：npm run release:backup -- <发布包目录> [已有备份根目录]');
const packageDirectory=path.resolve(process.argv[2]);
const manifest=await verifyPackage(packageDirectory);
if(manifest.sourceDirty)throw Error('发布包来自未提交工作树；先留存源码再制作可恢复备份');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const backupRoot=path.resolve(process.argv[3]||path.join(os.homedir(),'CarPlayground-backups'));
if(backupRoot===root||backupRoot.startsWith(root+path.sep))throw Error('第二份备份必须放在源码仓库以外');
const destination=path.join(backupRoot,manifest.appReleaseId);
await fs.mkdir(backupRoot,{recursive:true});
await fs.mkdir(destination,{recursive:false});
try {
  const source=path.join(destination,'source.tar.gz');
  execFileSync('git',['archive','--format=tar.gz',`--output=${source}`,manifest.sourceCommit],{cwd:root});
  const release=path.join(destination,'release.tar.gz');
  execFileSync('tar',['-czf',release,'-C',packageDirectory,'.']);
  // Read the archive into a new temporary directory and run the full verifier.
  const restored=await fs.mkdtemp(path.join(os.tmpdir(),'carplayground-restore-'));
  try{execFileSync('tar',['-xzf',release,'-C',restored]);await verifyPackage(restored);}finally{await fs.rm(restored,{recursive:true,force:true});}
  const sums=[];for(const name of ['source.tar.gz','release.tar.gz'])sums.push(`${sha256(await fs.readFile(path.join(destination,name)))}  ${name}`);
  await fs.writeFile(path.join(destination,'SHA256SUMS'),sums.join('\n')+'\n');
  await fs.writeFile(path.join(destination,'backup.json'),JSON.stringify({createdAt:new Date().toISOString(),appReleaseId:manifest.appReleaseId,contentReleaseId:manifest.contentReleaseId,sourceCommit:manifest.sourceCommit,restoredPackageVerified:true,nasVerified:false},null,2)+'\n');
  console.log(`本地第二份备份与解包读回校验完成：${destination}。这不代表 NAS 已备份。`);
}catch(e){console.error(`备份未完成，保留现场：${destination}`);throw e;}
