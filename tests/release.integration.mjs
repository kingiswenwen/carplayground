import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sha256, verifyPackage, verifySourceTree } from '../scripts/release-lib.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sandbox=await fs.mkdtemp(path.join(os.tmpdir(),'carplayground-release-check-'));
const run=(script,args=[])=>execFileSync(process.execPath,[path.join(root,'scripts',script),...args],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
let first,second,forward,rollback;
before(()=>{
  for(const id of ['review-a','review-b'])run('prepare-release.mjs',['--id',id,'--output',sandbox]);
  first=path.join(sandbox,'review-a');second=path.join(sandbox,'review-b');
  forward=path.join(sandbox,'forward');rollback=path.join(sandbox,'rollback');
  run('compose-release.mjs',[second,first,'--output',forward]);
  run('compose-release.mjs',[first,second,'--output',rollback]);
});
after(async()=>fs.rm(sandbox,{recursive:true,force:true}));
async function withServer(folder,callback){
  const child=spawn(process.execPath,[path.join(root,'scripts/preview-release.mjs'),folder,'0'],{cwd:root,stdio:['ignore','pipe','pipe']});
  try{
    const url=await new Promise((resolve,reject)=>{let output='',errors='';const timer=setTimeout(()=>reject(Error('发布包服务器启动超时：'+errors)),10000);child.stderr.on('data',b=>{errors+=b;});child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);reject(Error(`预览进程退出 ${code}: ${errors}`));});child.stdout.on('data',b=>{output+=b;const match=output.match(/http:\/\/127\.0\.0\.1:\d+\//);if(match){clearTimeout(timer);resolve(match[0]);}});});
    await callback(url);
  }finally{if(child.exitCode===null){const ended=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await ended;}}
}
test('正式家庭包拒绝其余未完成条件；已存在的版本拒绝覆盖',()=>{
  assert.throws(()=>run('prepare-release.mjs',['--kind','family','--id','must-not-publish','--output',sandbox]),/Command failed/);
  assert.throws(()=>run('prepare-release.mjs',['--id','review-a','--output',sandbox]),/Command failed/);
});
test('当前审阅包记录用户设备豁免，仍保留其他发布条件',async()=>{
  const manifest=await verifyPackage(first);
  assert.deepEqual(manifest.waived.map(item=>item.id),['real-ipad','real-phone']);
  assert.ok(manifest.waived.every(item=>item.waivedBy==='user'&&item.waivedAt==='2026-10-21'));
  assert.ok(manifest.outstanding.some(item=>item.id==='audio-distribution'));
  assert.ok(!manifest.outstanding.some(item=>['real-ipad','real-phone'].includes(item.id)));
});
test('前进与回滚改变入口版本，保留旧版本脚本和全部媒体',async()=>{
  for(const [folder,active]of [[forward,'review-b'],[rollback,'review-a']])await withServer(folder,async url=>{
    const rootResponse=await fetch(url),html=await rootResponse.text();
    assert.match(html,new RegExp(`/releases/${active}/`));assert.equal(rootResponse.headers.get('cache-control'),'no-cache');
    const manifest=await verifyPackage(folder);
    for(const id of ['review-a','review-b']){
      const entry=await fetch(`${url}releases/${id}/index.html`);assert.equal(entry.status,200);
      const script=(await entry.text()).match(/src="([^"]+\.js)"/)[1];
      const response=await fetch(new URL(script,url));assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/javascript/);
    }
    const clip=manifest.files.find(f=>f.path.endsWith('/wheel.mp3'));
    const range=await fetch(url+clip.path,{headers:{Range:'bytes=0-31'}});
    assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,32);assert.match(range.headers.get('content-range'),/^bytes 0-31\//);assert.equal(range.headers.get('content-type'),'audio/mpeg');
    const notFound=await fetch(url+'missing-file.mp3');assert.equal(notFound.status,404);assert.equal(notFound.headers.get('cache-control'),'no-store');
    const invalid=await fetch(url+clip.path,{headers:{Range:'bytes=999999999-'}});assert.equal(invalid.status,416);
    const head=await fetch(url+clip.path,{method:'HEAD'});assert.equal(head.status,200);assert.equal(Number(head.headers.get('content-length')),clip.bytes);
    const unchanged=await fetch(url+clip.path,{headers:{'If-None-Match':head.headers.get('etag')}});assert.equal(unchanged.status,304);
  });
});
test('连续组合和从组合包回滚保留全部历史版本，重叠版本只记录一次',async()=>{
  const cases=[['nested-active',[forward],'review-b','review-a'],['nested-retained',[first,forward],'review-a','review-b'],['overlapping',[rollback,forward,first,second],'review-a','review-b']];
  for(const [name,sources,active,retained]of cases){
    const output=path.join(sandbox,name);
    run('compose-release.mjs',[...sources,'--output',output]);
    const manifest=await verifyPackage(output);
    assert.equal(manifest.appReleaseId,active);
    assert.deepEqual(manifest.retainedReleases.map(r=>r.appReleaseId),[retained]);
    const original=await verifyPackage(retained==='review-a'?first:second);
    for(const key of ['appVersion','contentReleaseId','contentFingerprint','sourceCommit','kind','sourceDirty','outstanding','waived'])assert.deepEqual(manifest.retainedReleases[0][key],original[key]);
    assert.equal(manifest.files.length,(await verifyPackage(forward)).files.length);
  }
});
test('相同版本的验收快照冲突不能由输入顺序覆盖，失败不留下半成品',async()=>{
  const conflicting=path.join(sandbox,'conflicting');await fs.cp(forward,conflicting,{recursive:true});
  const manifest=JSON.parse(await fs.readFile(path.join(conflicting,'manifest.json'),'utf8'));
  manifest.retainedReleases[0].outstanding=[];
  await fs.writeFile(path.join(conflicting,'manifest.json'),JSON.stringify(manifest));
  await verifyPackage(conflicting);
  const output=path.join(sandbox,'conflict-output');
  assert.throws(()=>run('compose-release.mjs',[first,conflicting,'--output',output]),/版本元数据冲突/);
  await assert.rejects(fs.access(output),{code:'ENOENT'});
  const changed=path.join(sandbox,'changed');await fs.cp(first,changed,{recursive:true});
  const changedManifest=JSON.parse(await fs.readFile(path.join(changed,'manifest.json'),'utf8'));
  const script=changedManifest.files.find(file=>file.path.endsWith('.js'));
  const bytes=Buffer.concat([await fs.readFile(path.join(changed,'site',script.path)),Buffer.from('\n// changed immutable file\n')]);
  await fs.writeFile(path.join(changed,'site',script.path),bytes);
  script.bytes=bytes.length;script.sha256=sha256(bytes);
  changedManifest.totalBytes=changedManifest.files.reduce((sum,file)=>sum+file.bytes,0);
  await fs.writeFile(path.join(changed,'manifest.json'),JSON.stringify(changedManifest));
  await verifyPackage(changed);
  assert.throws(()=>run('compose-release.mjs',[first,changed,'--output',output]),/不可变文件冲突/);
  await assert.rejects(fs.access(output),{code:'ENOENT'});
});
test('保留版本也核对入口、应用内容版本及指纹；旧格式可读且能补全元数据',async()=>{
  for(const scenario of ['missing-entry','wrong-entry','wrong-version','missing-active-version','wrong-fingerprint','duplicate-id','wrong-total','waiver-conflict','waiver-invalid']){
    const folder=path.join(sandbox,scenario);await fs.cp(forward,folder,{recursive:true});
    const manifest=JSON.parse(await fs.readFile(path.join(folder,'manifest.json'),'utf8'));
    const retained=manifest.retainedReleases[0];
    const entry=`releases/${retained.appReleaseId}/index.html`;
    if(scenario==='missing-entry'){
      await fs.rm(path.join(folder,'site',entry));manifest.files=manifest.files.filter(file=>file.path!==entry);
    }else if(scenario==='wrong-entry'){
      const bytes=await fs.readFile(path.join(folder,'site/index.html'));
      await fs.writeFile(path.join(folder,'site',entry),bytes);
      Object.assign(manifest.files.find(file=>file.path===entry),{bytes:bytes.length,sha256:sha256(bytes)});
    }else if(scenario==='wrong-version')retained.appVersion='0.0.0';
    else if(scenario==='missing-active-version')delete manifest.appVersion;
    else if(scenario==='wrong-fingerprint')retained.contentFingerprint='0'.repeat(64);
    else if(scenario==='duplicate-id')manifest.retainedReleases.push({...retained});
    else if(scenario==='waiver-conflict')retained.outstanding.push({id:'real-ipad',status:'unverified'});
    else if(scenario==='waiver-invalid')retained.waived[0].waivedBy='automatic';
    manifest.totalBytes=manifest.files.reduce((sum,file)=>sum+file.bytes,0)+(scenario==='wrong-total'?1:0);
    await fs.writeFile(path.join(folder,'manifest.json'),JSON.stringify(manifest));
    await assert.rejects(verifyPackage(folder),/缺少入口|入口与版本|应用与内容|内容版本指纹|版本编号重复|总字节数|豁免/);
  }
  const legacy=path.join(sandbox,'legacy');await fs.cp(forward,legacy,{recursive:true});
  const manifest=JSON.parse(await fs.readFile(path.join(legacy,'manifest.json'),'utf8'));
  delete manifest.retainedReleases[0].appVersion;delete manifest.retainedReleases[0].contentFingerprint;
  await fs.writeFile(path.join(legacy,'manifest.json'),JSON.stringify(manifest));
  await verifyPackage(legacy);
  const output=path.join(sandbox,'legacy-enriched');
  run('compose-release.mjs',[legacy,first,'--output',output]);
  const enriched=(await verifyPackage(output)).retainedReleases[0];
  assert.equal(enriched.appVersion,(await verifyPackage(first)).appVersion);
  assert.equal(enriched.contentFingerprint,(await verifyPackage(first)).contentFingerprint);
});
test('篡改、缺失文件、额外文件和越界路径均不能通过完整包校验',async()=>{
  const broken=path.join(sandbox,'broken');await fs.cp(first,broken,{recursive:true});
  await fs.appendFile(path.join(broken,'site/index.html'),'broken');await assert.rejects(verifyPackage(broken),/校验失败/);
  await fs.rm(broken,{recursive:true});await fs.cp(first,broken,{recursive:true});
  await fs.writeFile(path.join(broken,'site/private-data.json'),'{}');await assert.rejects(verifyPackage(broken),/清单不一致/);
  await fs.rm(path.join(broken,'site/private-data.json'));
  const manifest=JSON.parse(await fs.readFile(path.join(broken,'manifest.json'),'utf8'));manifest.files[0].path='../outside';await fs.writeFile(path.join(broken,'manifest.json'),JSON.stringify(manifest));await assert.rejects(verifyPackage(broken),/非法发布路径/);
});
test('源码归档恢复逐文件对照Git对象，不能把仅创建归档当成读回通过',async()=>{
  const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const archive=path.join(sandbox,'source.tar'),restored=path.join(sandbox,'restored-source');
  execFileSync('git',['archive','--format=tar',`--output=${archive}`,commit],{cwd:root});
  await fs.mkdir(restored);
  execFileSync('tar',['-xf',archive,'-C',restored]);
  assert.ok(await verifySourceTree(restored,commit,root)>0);
  await fs.appendFile(path.join(restored,'START_HERE.md'),'corrupted recovery');
  await assert.rejects(verifySourceTree(restored,commit,root),/源码校验失败/);
  await fs.rm(path.join(restored,'START_HERE.md'));
  await assert.rejects(verifySourceTree(restored,commit,root),/源码文件清单不一致/);
});
