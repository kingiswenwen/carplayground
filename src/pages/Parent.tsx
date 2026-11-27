import '../styles/family.css';
import {activeCar} from '../domain/active-car';
import {townPlaces,activityHref} from '../domain/town';
import {PlayPicture} from '../components/PlayPicture';
import {PlaySymbol} from '../components/PlaySymbol';
import {TownImage} from '../components/Town';
import {vehicleModels} from '../domain/vehicle-models';
import {ReleaseStatus} from '../components/ReleaseStatus';
import photoViewSources from '../../content/photo-view-sources.json';
import{useEffect,useMemo,useRef,useState}from'react';import{Download,Upload,Trash2,Music2,Pause,Save,RotateCcw,Plus,Minus,ChevronDown}from'../components/TownIcons';import{content,domains}from'../domain/content';import{audio}from'../services/audio';import{db,safely,type Settings,type SessionRecord,type Observation}from'../services/storage';import{clearLocalData,downloadBackup,makeBackup,parseBackup,replaceBackup,domainSummary,assertBackupFileSize,type Backup}from'../services/backup';import photoSources from'../../content/photo-sources.json';
type ProfileOperation = '保存昵称';
type BackupOperation = '准备备份' | '读取备份' | '替换记录' | '读取替换前记录' | '准备替换前备份' | '清空记录';
type Operation = ProfileOperation | BackupOperation;

export function Parent({settings,update,storageFailed,reload}:{settings:Settings;update:(p:Partial<Settings>)=>void;storageFailed:boolean;reload:()=>Promise<void>}){
 const [records,setRecords]=useState<SessionRecord[]>([]);
 const [notes,setNotes]=useState<Observation[]>([]);
 const [nickname,setNickname]=useState('');
 const savedNickname=useRef('');
 const [pending,setPending]=useState<Backup>();
 const [message,setMessage]=useState('');
 const [messageAt,setMessageAt]=useState<'profile'|'backup'>('backup');
 const [loaded,setLoaded]=useState(false);
 const [previewing,setPreviewing]=useState(false);
 const previewId=useRef(0);
 const [operation,setOperation]=useState<Operation|null>(null);
 const operationLock=useRef<Operation|null>(null);
 const busy=operation!==null;
 const [clearConfirm,setClearConfirm]=useState(false);
 const clearDialog=useRef<HTMLDialogElement>(null);
 const fileInput=useRef<HTMLInputElement>(null);
 const recoveryTrigger=useRef<HTMLButtonElement>(null);
 const previewHeading=useRef<HTMLHeadingElement>(null);
 const previewSource=useRef<'file'|'recovery'>('file');
 const [hasRecovery,setHasRecovery]=useState(false);
 useEffect(()=>{
  if (!clearConfirm) return;
  const dialog=clearDialog.current;
  dialog?.showModal();
  return ()=>dialog?.close();
 },[clearConfirm]);
 useEffect(()=>{if(pending)previewHeading.current?.focus();},[pending]);

 const readRecovery=async()=>{
  const row=await db.recovery.get('before-import');
  if(!row){setHasRecovery(false);throw Error('这台设备上已经没有替换前备份。');}
  return parseBackup(row.json);
 };
 const refresh=async()=>{const[rows,observations,profile,recovery]=await Promise.all([safely(()=>db.sessions.toArray(),[],'sessions:read'),safely(()=>db.observations.orderBy('createdAt').reverse().limit(8).toArray(),[],'observations:read'),safely(()=>db.profiles.get('default'),undefined,'profile:read'),safely(()=>db.recovery.get('before-import'),undefined,'recovery:read')]);setRecords(rows);setNotes(observations);savedNickname.current=profile?.nickname||'';setNickname(savedNickname.current);setHasRecovery(Boolean(recovery));setLoaded(true);};useEffect(()=>{void refresh();},[]);const summary=useMemo(()=>domainSummary(records),[records]);
 const counts=useMemo(()=>({participated:records.filter(r=>r.state==='participated').length,hints:records.reduce((sum,r)=>sum+r.hints,0)}),[records]);
 const previewAudio=async()=>{
  const id=++previewId.current;
  if(previewing){audio.stop();setPreviewing(false);return;}
  setPreviewing(true);
  try{await audio.playRequested('activity-C01','activity-M02','activity-S01');}
  finally{if(id===previewId.current)setPreviewing(false);}
 };
 const run=async(label:Operation,work:()=>Promise<void>)=>{
  if(operationLock.current)return;
  operationLock.current=label;
  setMessage('');setMessageAt(label==='保存昵称'?'profile':'backup');setOperation(label);
  try{await work();}
  catch(e){setMessage(e instanceof Error?e.message:'这次操作没有完成，现有记录仍可查看。');}
  finally{operationLock.current=null;setOperation(null);}
 };
 const exportBackup=()=>run('准备备份',async()=>{
  downloadBackup(await makeBackup());
  setMessage('备份已准备好下载，请妥善保存。');
 });
 const cancelImport=()=>{
  setPending(undefined);setMessage('');
  requestAnimationFrame(()=>{if(previewSource.current==='recovery')recoveryTrigger.current?.focus();else fileInput.current?.focus();});
 };
 const feedback=operation===null?message:`正在${operation}…`;
 const mutatingRecords=operation==='替换记录'||operation==='清空记录';
 return <><div className="town-heading parent-page-title"><div><h1>一起，发现小小的成长</h1><p>按孩子今天的兴趣慢慢来。这里记录的是参与情况。</p></div><TownImage name="guide-notebook" className="town-heading-art" priority/></div>{storageFailed&&<div role="alert" className="storage-warning">本次记录暂时无法保存。玩法仍可使用，关闭后可能无法恢复；请检查浏览器存储权限或空间。</div>}
 <div className="parent-grid"><section className="parent-card"><h2>体验设置</h2><label className="setting-row"><span>声音引导<small>普通话说明，英语用于具体语境</small></span><input type="checkbox" checked={settings.sound} onChange={e=>update({sound:e.target.checked})}/></label><label className="setting-row" style={{flexWrap:'wrap',gap:12}}><span>操作难度<small>轻松尝试更容易把物件放好、把车擦干净</small></span><select style={{minHeight:48,maxWidth:'100%'}} aria-label="操作难度" value={settings.difficulty} onChange={e=>update({difficulty:e.target.value as Settings['difficulty']})}><option value="gentle">轻松尝试（默认）</option><option value="explore">稍精确探索</option></select></label><label className="setting-row" style={{flexWrap:'wrap',gap:12}}><span>内容阶段<small>调整认颜色、找部件和停车时的目标数量</small></span><select style={{minHeight:48,maxWidth:'100%'}} aria-label="内容阶段" value={settings.contentLevel||'discover'} onChange={e=>update({contentLevel:e.target.value as Settings['contentLevel']})}><option value="starter">先玩一点：两色、车轮、一辆车</option><option value="discover">继续发现：三色、三部件、两辆车（默认）</option></select></label><p>设置会在下次进入活动或重新玩时生效。停车与装配可直接拖动，也可先点物件再点轮廓。</p>
 <button type="button" className="button" aria-pressed={previewing} onClick={()=>void previewAudio()}>{previewing?<Pause size={20}/>:<Music2 size={20}/>} {previewing?'停止试听':'听一段中文引导'}</button></section>
 <section className="parent-card"><h2>最近的参与</h2>{!loaded?<p>正在读取本机记录…</p>:records.length===0?<p>玩过小镇活动后，可以在这里看到孩子探索过的内容。</p>:<><div className="record-numbers"><div><strong>{records.length}</strong><span>次探索</span></div><div><strong>{counts.participated}</strong><span>次表达与创作</span></div><div><strong>{counts.hints}</strong><span>次主动求助</span></div></div><div className="domain-summary">{domains.filter(d=>summary[d]>0).map(d=><div key={d}><span>{d}</span><span>{summary[d]||0} 次参与</span></div>)}</div><p>不比较孩子之间的表现，不把一次完成写成“掌握”。只愿意看车，也保留兴趣价值。</p></>}</section>
 <section className="parent-card" aria-labelledby="profile-heading"><h2 id="profile-heading">本机档案与观察</h2>
  <form onSubmit={e=>{
   e.preventDefault();
   const value=nickname.trim();
   if(value===savedNickname.current)return;
   void run('保存昵称',async()=>{
    await db.profiles.put({id:'default',nickname:value});
    savedNickname.current=value;
    setNickname(current=>current.trim()===value?value:current);
    setMessage('档案已保存在这台设备。');
   });
  }}>
   <label className="profile-field">档案昵称（可留空）<input maxLength={60} disabled={!loaded||mutatingRecords} value={nickname} onChange={e=>{setNickname(e.target.value);if(messageAt==='profile')setMessage('');}}/></label>
   <button type="submit" className="button" disabled={busy||!loaded||nickname.trim()===savedNickname.current}><Save size={18}/>保存昵称</button>
  </form>
  <div className="family-feedback-region" role="status">{messageAt==='profile'&&feedback&&<p className="family-feedback">{feedback}</p>}</div>
  {notes.length>0&&<div className="observations"><h3>家长记下的一句话</h3>{notes.map(note=><div key={note.id}><small>{content.activities.find(a=>a.id===note.activityId)?.title}</small><p>{note.text}</p></div>)}</div>}
  <p>昵称、观察和作品都只存在当前浏览器中。</p>
 </section>
 <section className="parent-card backup-card" aria-labelledby="backup-heading">
  <h2 id="backup-heading">备份与恢复</h2><p>浏览器可能清理本机记录。先导出一份备份，也可以在另一台设备上导入。</p>
  <div className="backup-actions" aria-busy={busy&&messageAt==='backup'}>
   <button className="button primary" disabled={busy} onClick={()=>void exportBackup()}><Download size={19}/>导出本机备份</button>
   <label className="button file-button" data-disabled={busy}><Upload size={19}/>选择备份文件
    <input ref={fileInput} aria-label="选择备份文件" type="file" accept="application/json,.json" disabled={busy} onChange={e=>{
     const file=e.target.files?.[0];e.currentTarget.value='';if(!file)return;
     previewSource.current='file';setPending(undefined);
     void run('读取备份',async()=>{assertBackupFileSize(file.size);setPending(parseBackup(await file.text()));});
    }}/>
   </label>
  </div>
  {pending&&<div className="backup-preview">
   <h3 ref={previewHeading} tabIndex={-1}>导入前确认</h3>
   <p>档案：{pending.profile.nickname||'未命名档案'}<br/>收藏 {pending.favorites.length} 辆 · 探索 {pending.sessions.length} 条 · 故事 {pending.storyProgress.length} 条 · 作品 {pending.creations.length} 幅 · 观察 {pending.observations.length} 条</p>
   <p>确认后会用这份备份替换本机记录。我们会先下载一份当前记录，并在这台设备上保留恢复副本。</p>
   <button className="button primary" disabled={busy} onClick={()=>void run('替换记录',async()=>{
    await replaceBackup(pending,previous=>{
     try{downloadBackup(previous);}
     catch{throw Error('替换前备份暂时无法下载，本机记录还没有替换。请重试。');}
    });
    setPending(undefined);await reload();await refresh();setMessage('备份导入完成，记录已在本机恢复。替换前备份已准备好下载。');
   })}>替换并保存当前备份</button>
   <button className="text-button" disabled={busy} onClick={cancelImport}>取消导入</button>
  </div>}
  {hasRecovery&&!pending&&<div className="backup-actions family-recovery">
   <button ref={recoveryTrigger} className="text-button" disabled={busy} onClick={()=>{previewSource.current='recovery';void run('读取替换前记录',async()=>setPending(await readRecovery()));}}><RotateCcw size={18}/>恢复替换前记录</button>
   <button className="text-button" disabled={busy} onClick={()=>void run('准备替换前备份',async()=>{downloadBackup(await readRecovery());setMessage('替换前备份已准备好下载。');})}><Download size={18}/>下载替换前备份</button>
  </div>}
  <div className="family-feedback-region" role="status">{!clearConfirm&&messageAt==='backup'&&feedback&&<p className="family-feedback">{feedback}</p>}</div>
  {!pending&&<div className="clear-data">
   <button className="text-button danger" disabled={busy} aria-haspopup="dialog" onClick={()=>{setMessage('');setClearConfirm(true);}}><Trash2 size={17}/>清空这台设备的记录</button>
  </div>}
  {clearConfirm&&<dialog ref={clearDialog} className="parent-gate family-clear-dialog" aria-labelledby="family-clear-title" aria-describedby="family-clear-description" onCancel={e=>{e.preventDefault();if(!operationLock.current){setClearConfirm(false);setMessage('');}}}>
   <div>
    <h2 id="family-clear-title">清空这台设备的记录？</h2>
    <p id="family-clear-description">收藏、作品、探索、故事进度、观察、设置和恢复副本都会删除。清空后只能从备份文件恢复。</p>
    <div className="family-clear-actions">
     <button autoFocus className="button primary" disabled={busy} onClick={()=>{setClearConfirm(false);setMessage('');}}>保留记录</button>
     <button className="button" disabled={busy} onClick={()=>void exportBackup()}><Download size={18}/>先下载备份</button>
     <button className="text-button danger" disabled={busy} onClick={()=>void run('清空记录',async()=>{
      await clearLocalData();await reload();await refresh();setClearConfirm(false);setMessage('这台设备的记录已清空。');
     })}>确认清空本机记录</button>
    </div>
    <div className="family-feedback-region" role="status">{feedback&&<p className="family-feedback">{feedback}</p>}</div>
   </div>
  </dialog>}
 </section>
 <div className="full-width"><section className="town-teaching-map" aria-label="小镇教学地图"><h2>在小镇里，练习什么？</h2><p>{content.activities.length} 项活动，{domains.length} 个领域。跟着兴趣动手玩，家长可以在每项活动里查看目标和陪玩建议。</p><div>{townPlaces.map(place=><details key={place.id}><summary><PlaySymbol name={place.symbol}/><strong>{place.name}</strong><span>{place.activities.length} 项活动</span><Plus className="town-summary-expand"/><Minus className="town-summary-collapse"/></summary><ul>{content.activities.filter(a=>(place.activities as readonly string[]).includes(a.id)).map(a=><li key={a.id}><a href={activityHref(a.id,activeCar())}><PlayPicture id={a.id}/><span><strong>{a.title}</strong><small>{a.domain} · {a.mode==='open'?'记录参与':'按实际操作记录'}</small><p>{a.goal}</p></span></a></li>)}</ul></details>)}</div></section></div>
 <ReleaseStatus/>
 <section className="parent-card full-width"><h2>内容与素材说明</h2><p>当前本地版本有 {content.cars.length} 个真实车型系列、{townPlaces.length} 个小镇地点、{content.activities.length} 个活动与 {content.stories.length} 段四幕故事，覆盖英语、数学、中文表达、科学、动手思考、社会体验、艺术和生活习惯。开放表达与创作记“参与”，不自动判断说法好坏。</p><p>当前提供 {vehicleModels.length} 款真实车型系列的独立立体模型，车库支持品牌筛选和分页；玩法使用真实网格、透视镜头和直接触碰。当前目录中的每款车均有已登记的独立立体模型。新车型预览由对应模型渲染；部分旧图为 GPT 生成的教学演绎。来源与署名见下方，模型并非厂商工程数据。每款车都有随应用交付的全名语音。新增车名录音离线生成，播放时无需设备语音或远程合成服务。车轮装配、推力、阻力、桥路与光影也使用教学示意。</p><details><summary>查看立体模型来源与许可<ChevronDown className="town-disclosure"/></summary>{vehicleModels.map(model=><p key={model.id}>{content.cars.find(car=>car.id===model.id)?.name} · <a href={model.source.url} target="_blank" rel="noreferrer">{model.source.title}</a> · <a href={model.source.authorUrl} target="_blank" rel="noreferrer">{model.source.author}</a> · <a href={model.source.licenseUrl} target="_blank" rel="noreferrer">{model.source.license}</a>。经社区素材目录压缩；本应用统一摆放、调整指定车漆、移除场景地板并重新计算车漆法线，保留模型原有比例。</p>)}</details><p>下列照片与早期衍生素材的来源保留供追溯，不代表当前游戏仍使用这些旧车图。</p><details><summary>查看摄影来源与许可<ChevronDown className="town-disclosure"/></summary><p>Revuelto 参考：<a href="https://commons.wikimedia.org/wiki/File:2023_Lamborghini_Revuelto_1.jpg" target="_blank" rel="noreferrer">Calreyn88</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>，经 GPT Image 提取主体与教学配色改编。</p>{photoSources.map(source=><p key={source.id}><a href={source.page} target="_blank" rel="noreferrer">{content.cars.find(c=>c.id===source.id)?.name}</a> · {source.author} · <a href={source.licenseUrl} target="_blank" rel="noreferrer">{source.license}</a>。原始照片缩小并转 WebP；另经 GPT Image 制作透明主体与展厅情境图，衍生文件保留原许可，摄影者和汽车品牌未参与本项目。</p>)}</details><p>历史参考另含不同方向及座舱照片，来源可能是不同实车；与当前六角度生成图分别记录，不将它们描述为连续旋转的同一辆实车。</p><details><summary>查看多角度实拍来源<ChevronDown className="town-disclosure"/></summary>{photoViewSources.map(source=><p key={source.assetId}>{content.cars.find(car=>car.id===source.carId)?.model} · {source.label} · <a href={source.page} target="_blank" rel="noreferrer">{source.author}</a> · <a href={source.licenseUrl} target="_blank" rel="noreferrer">{source.license}</a>。保留完整照片，缩小并转 WebP。</p>)}</details><p>当前是浏览器审阅版。浏览器验证覆盖核心操作、响应式与能力降级；真实 iPad、iPhone、Android 尚未实测。声音听审与家庭体验观察尚未完成。无录音或云学习记录。</p><small>应用 {content.appVersion} · 内容 {content.id}</small></section></div></>;
}
