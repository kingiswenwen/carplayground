import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const mimeType = filename => ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webp':'image/webp','.mp3':'audio/mpeg','.png':'image/png','.svg':'image/svg+xml'}[path.extname(filename)] || 'application/octet-stream');
const deviceRequirements = new Set(['real-ipad', 'real-phone']);
export function readinessSnapshot(readiness) {
  const outstanding = [], waived = [];
  for (const [id, item] of Object.entries(readiness.requirements)) {
    if (item.status === 'waived') {
      if (!deviceRequirements.has(id) || item.waivedBy !== 'user' || !/^\d{4}-\d{2}-\d{2}$/.test(item.waivedAt || '') || !item.note || !item.evidence) throw Error(`缺少用户豁免依据或不在设备豁免范围：${id}`);
      waived.push({id, status: item.status, reason: item.note, waivedBy: item.waivedBy, waivedAt: item.waivedAt, evidence: item.evidence});
    } else if (item.status !== 'passed') outstanding.push({id, status: item.status, reason: item.note});
  }
  return {outstanding, waived};
}
export function safeRelative(filename) {
  if (!filename || filename.includes('\\') || filename.includes('\0') || path.posix.isAbsolute(filename) || filename.split('/').some(p => !p || p === '.' || p === '..')) throw Error(`非法发布路径：${filename}`);
  return filename;
}
export function headersFor(filename) {
  return {'Content-Type':mimeType(filename),'Cache-Control':filename==='index.html'?'no-cache':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes'};
}
export async function listFiles(folder, prefix='') {
  const files=[];
  for (const entry of await fs.readdir(path.join(folder,prefix),{withFileTypes:true})) {
    const name=prefix?`${prefix}/${entry.name}`:entry.name;
    if(entry.isSymbolicLink()) throw Error(`发布包不接受符号链接：${name}`);
    if(entry.isDirectory()) files.push(...await listFiles(folder,name)); else if(entry.isFile()) files.push(safeRelative(name));
  }
  return files.sort();
}
export async function verifySourceTree(directory, commit, repository) {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit)) throw Error('源码提交编号无效');
  const git = args => execFileSync('git', args, {cwd:repository, encoding:'utf8', maxBuffer:16*1024*1024}).trimEnd();
  const objectFormat = git(['rev-parse', '--show-object-format']);
  if (!['sha1','sha256'].includes(objectFormat)) throw Error('不支持的 Git 对象格式');
  const entries = git(['ls-tree', '-rz', '--full-tree', commit]).split('\0').filter(Boolean).map(row => {
    const match = /^(100644|100755) blob ([a-f0-9]+)\t(.+)$/s.exec(row);
    if (!match) throw Error('源码备份包含不支持的文件类型');
    return {path:safeRelative(match[3]), hash:match[2]};
  });
  const actual = await listFiles(directory);
  if (JSON.stringify(actual) !== JSON.stringify(entries.map(e=>e.path).sort())) throw Error('恢复后的源码文件清单不一致');
  for (const entry of entries) {
    const bytes = await fs.readFile(path.join(directory, entry.path));
    const hash = createHash(objectFormat).update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (hash !== entry.hash) throw Error(`恢复后的源码校验失败：${entry.path}`);
  }
  return entries.length;
}
export async function verifyPackage(packageDirectory) {
  const manifest=JSON.parse(await fs.readFile(path.join(packageDirectory,'manifest.json'),'utf8'));
  if(manifest.formatVersion!==1 || !Array.isArray(manifest.files) || !manifest.files.length) throw Error('发布清单无效');
  const site=path.join(packageDirectory,'site');
  const actual=await listFiles(site);
  const names=manifest.files.map(f=>safeRelative(f.path)).sort();
  if(new Set(names).size!==names.length || JSON.stringify(actual)!==JSON.stringify(names)) throw Error('发布文件清单不一致');
  if(manifest.retainedReleases!==undefined&&!Array.isArray(manifest.retainedReleases))throw Error('保留版本清单无效');
  const releases=[manifest,...(manifest.retainedReleases||[])];
  const appIds=releases.map(r=>r.appReleaseId);
  const contentIds=releases.map(r=>r.contentReleaseId);
  for(const id of [...appIds,...contentIds])if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id))throw Error('版本编号无效');
  if(new Set(appIds).size!==appIds.length)throw Error('保留版本编号重复');
  for(const filename of names){
    const allowed=filename==='index.html'||appIds.some(id=>filename===`releases/${id}/index.html`||(filename.startsWith(`releases/${id}/assets/`)&&/\.(js|css)$/.test(filename)))||contentIds.some(id=>filename===`content/${id}/manifest.json`||(filename.startsWith(`media/${id}/`)&&/\.(webp|mp3)$/.test(filename)));
    if(!allowed)throw Error(`发布包包含非网页交付文件：${filename}`);
  }
  for(const file of manifest.files) {
    const bytes=await fs.readFile(path.join(site,file.path));
    if(bytes.length!==file.bytes || sha256(bytes)!==file.sha256) throw Error(`发布文件校验失败：${file.path}`);
    if(file.headers?.['Content-Type']!==mimeType(file.path)) throw Error(`MIME 不匹配：${file.path}`);
    if(file.headers?.['Cache-Control']!==headersFor(file.path)['Cache-Control']) throw Error(`缓存策略不匹配：${file.path}`);
  }
  if(manifest.totalBytes!==manifest.files.reduce((sum,file)=>sum+file.bytes,0))throw Error('发布总字节数不一致');
  if(!names.includes('index.html'))throw Error('缺少入口或内容清单');
  const index=await fs.readFile(path.join(site,'index.html'),'utf8');
  const byPath=new Map(manifest.files.map(file=>[file.path,file]));
  for(const release of releases){
    if (release.waived !== undefined) {
      if (!Array.isArray(release.waived) || new Set(release.waived.map(item => item.id)).size !== release.waived.length || release.waived.some(item => item.status !== 'waived' || (release.outstanding || []).some(pending => pending.id === item.id))) throw Error('设备豁免快照无效或与未完成条件冲突');
      readinessSnapshot({requirements: Object.fromEntries(release.waived.map(item => [item.id, {...item, note: item.reason}]))});
    }
    const releasePrefix=`releases/${release.appReleaseId}/`;
    const contentPath=`content/${release.contentReleaseId}/manifest.json`;
    if(!byPath.has(`${releasePrefix}index.html`)||!byPath.has(contentPath))throw Error('缺少入口或内容清单');
    const versionIndex=await fs.readFile(path.join(site,releasePrefix,'index.html'),'utf8');
    if((release===manifest&&index!==versionIndex)||!versionIndex.includes(`/${releasePrefix}`))throw Error('入口与版本不一致');
    const content=JSON.parse(await fs.readFile(path.join(site,contentPath),'utf8'));
    // Older composed manifests did not retain appVersion or a content fingerprint.
    // Still check their actual entries and all media; enrich these fields when a
    // complete source manifest is supplied to compose-release again.
    if(content.id!==release.contentReleaseId||((release===manifest||release.appVersion!==undefined)&&content.appVersion!==release.appVersion))throw Error('应用与内容版本不匹配');
    if((release===manifest||release.contentFingerprint!==undefined)&&sha256(JSON.stringify({manifest:content,media:content.assets.map(a=>[a.path,a.sha256])}))!==release.contentFingerprint)throw Error('内容版本指纹不一致');
    for(const asset of content.assets){
      const target=`media/${content.id}/${asset.path.replace(/^media\//,'')}`;
      const file=byPath.get(target);
      if(!file||file.sha256!==asset.sha256)throw Error(`内容媒体不匹配：${asset.id}`);
    }
  }
  return manifest;
}
