import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyPackage } from '../scripts/release-lib.mjs';
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
test('正式家庭包拒绝未完成的真实验收；已存在的版本拒绝覆盖',()=>{
  assert.throws(()=>run('prepare-release.mjs',['--kind','family','--id','must-not-publish','--output',sandbox]),/Command failed/);
  assert.throws(()=>run('prepare-release.mjs',['--id','review-a','--output',sandbox]),/Command failed/);
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
test('篡改、缺失文件、额外文件和越界路径均不能通过完整包校验',async()=>{
  const broken=path.join(sandbox,'broken');await fs.cp(first,broken,{recursive:true});
  await fs.appendFile(path.join(broken,'site/index.html'),'broken');await assert.rejects(verifyPackage(broken),/校验失败/);
  await fs.rm(broken,{recursive:true});await fs.cp(first,broken,{recursive:true});
  await fs.writeFile(path.join(broken,'site/private-data.json'),'{}');await assert.rejects(verifyPackage(broken),/清单不一致/);
  await fs.rm(path.join(broken,'site/private-data.json'));
  const manifest=JSON.parse(await fs.readFile(path.join(broken,'manifest.json'),'utf8'));manifest.files[0].path='../outside';await fs.writeFile(path.join(broken,'manifest.json'),JSON.stringify(manifest));await assert.rejects(verifyPackage(broken),/非法发布路径/);
});
