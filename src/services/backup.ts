import {download} from './download';
export {download} from './download';
import {z}from'zod';
import{activityIds,content,historicalCarIds}from'../domain/content';
import{db,defaultSettings,storageStatus}from'./storage';
import{resetPendingResultsAfter}from'./pending-session-results';
// Exported files, imported files and the pre-replacement recovery snapshot use
// the same limits. Per-field bounds and semantic validation remain in force.
export const MAX_BACKUP_BYTES=64*1024*1024;
export const MAX_BACKUP_RECORDS=100000;
const collectionKeys=['favorites','recent','sessions','storyProgress','creations','observations'] as const;
const byteLimitMessage='备份超过 64 MiB 安全上限。本机记录没有改变；请保留当前设备上的原记录，不要清空，并联系维护者协助分批备份。';
const recordLimitMessage='备份总记录超过 100000 条安全上限。本机记录没有改变；请保留当前设备上的原记录，不要清空，并联系维护者协助分批备份。';
export function assertBackupFileSize(bytes:number){
 if(!Number.isSafeInteger(bytes)||bytes<0)throw Error('备份文件大小无效。');
 if(bytes>MAX_BACKUP_BYTES)throw Error(byteLimitMessage);
}
function assertTextSize(text:string){
 // UTF-8 cannot be shorter than the UTF-16 code-unit count. Avoid allocating an
 // extra byte array for input that is already plainly over the limit.
 assertBackupFileSize(text.length);
 assertBackupFileSize(new TextEncoder().encode(text).byteLength);
}
const iso=z.string().datetime();const id=z.string().min(1).max(100);
const carId=z.enum(historicalCarIds as [string,...string[]]);
const settingsSchema=z.object({id:z.literal('default'),sound:z.boolean(),difficulty:z.enum(['gentle','explore']),contentLevel:z.enum(['starter','discover']).optional(),simple:z.boolean()});
const mark=z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1),color:z.string().regex(/^#[a-fA-F0-9]{6}$/),shape:z.enum(['star','leaf','sun','circle','stripe','zigzag'])});
export const backupSchema=z.object({formatVersion:z.literal(1),exportedAt:iso,profile:z.object({id:z.literal('default'),nickname:z.string().max(60)}),settings:settingsSchema,favorites:z.array(z.object({carId,at:iso})).max(historicalCarIds.length),recent:z.array(z.object({carId,at:iso})).max(historicalCarIds.length),sessions:z.array(z.object({id,activityId:z.enum(activityIds),activityVersion:z.number().int().positive(),contentReleaseId:z.string().max(100),carIds:z.array(carId).max(historicalCarIds.length),difficulty:z.string().max(20),contentLevel:z.enum(['starter','discover']).optional(),locale:z.literal('zh-CN'),audioEnabled:z.boolean(),startedAt:iso,endedAt:iso.optional(),state:z.enum(['playing','completed','participated','exited']),hints:z.number().int().min(0).max(100000),durationMs:z.number().min(0).max(604800000),summary:z.string().max(1000).optional()})).max(MAX_BACKUP_RECORDS,{message:recordLimitMessage}),storyProgress:z.array(z.object({storyId:z.enum(['ST01','ST02','ST03']),version:z.literal(1),frame:z.number().int().min(0).max(3),finished:z.boolean(),updatedAt:iso})).max(3),creations:z.array(z.object({id,kind:z.enum(['poster','tracks']),carId,background:z.string().regex(/^#[a-fA-F0-9]{6}$/),caption:z.string().max(80),marks:z.array(mark).max(100),createdAt:iso,version:z.literal(1)})).max(MAX_BACKUP_RECORDS,{message:recordLimitMessage}),observations:z.array(z.object({id,activityId:z.enum(activityIds),text:z.string().max(500),createdAt:iso})).max(MAX_BACKUP_RECORDS,{message:recordLimitMessage})}).superRefine((data,ctx)=>{
 let count=0;
 for(const key of collectionKeys){
  count+=data[key].length;
  const keys=data[key].map(row=>'id'in row?row.id:'carId'in row?row.carId:row.storyId);
  if(new Set(keys).size!==keys.length)ctx.addIssue({code:'custom',message:`${key} 包含重复编号`});
 }
 if(count>MAX_BACKUP_RECORDS){ctx.addIssue({code:'custom',message:recordLimitMessage});return;}
 // Measure the exact downloadable representation, not only the more compact
 // recovery JSON. A successful export must be accepted by parseBackup again.
 try{assertTextSize(JSON.stringify(data,null,2));}catch{ctx.addIssue({code:'custom',message:byteLimitMessage});}
});
export type Backup=z.infer<typeof backupSchema>;
const tables=()=>[db.profiles,db.settings,db.favorites,db.recent,db.sessions,db.storyProgress,db.creations,db.observations];
export async function makeBackup():Promise<Backup>{return db.transaction('r',tables(),async()=>checkedBackup({formatVersion:1,exportedAt:new Date().toISOString(),profile:await db.profiles.get('default')||{id:'default',nickname:''},settings:await db.settings.get('default')||defaultSettings,favorites:await db.favorites.toArray(),recent:await db.recent.toArray(),sessions:await db.sessions.toArray(),storyProgress:await db.storyProgress.toArray(),creations:await db.creations.toArray(),observations:await db.observations.toArray()}));}
function checkedBackup(input:unknown):Backup{
 // Reject excessive collections by length before Zod visits any row/field.
 // A small JSON file can still contain millions of tiny, invalid rows; building
 // one validation error per row would amplify memory far beyond the byte cap.
 if(input&&typeof input==='object'){
  let count=0;
  for(const key of collectionKeys){
   const rows=(input as Record<string,unknown>)[key];
   if(Array.isArray(rows))count+=rows.length;
   if(count>MAX_BACKUP_RECORDS)throw Error(recordLimitMessage);
  }
 }
 const result=backupSchema.safeParse(input);
 if(!result.success){
  const capacity=result.error.issues.find(issue=>issue.message===byteLimitMessage||issue.message===recordLimitMessage);
  throw Error(capacity?.message||'备份版本或内容格式不支持，当前记录没有改变。');
 }
 return result.data;
}
export function parseBackup(text:string){
 assertTextSize(text);
 let raw:unknown;try{raw=JSON.parse(text);}catch{throw Error('这不是有效的 JSON 备份。');}
 return checkedBackup(raw);
}
export function serializeBackup(backup:Backup){return JSON.stringify(checkedBackup(backup),null,2);}
export const downloadBackup=(backup:Backup)=>download(new Blob([serializeBackup(backup)],{type:'application/json'}),`carplayground-backup-${backup.exportedAt.slice(0,10)}.json`);
export async function replaceBackup(input:Backup,beforeReplace?:(current:Backup)=>void){
 const next=checkedBackup(input);
 const previous=await resetPendingResultsAfter(()=>db.transaction('rw',[...tables(),db.recovery],async()=>{
  // Keep the snapshot and replacement under one write transaction. Otherwise
  // another writer can commit between the snapshot and clearing the tables.
  const current=await makeBackup();
  // The caller can synchronously prepare/download this exact snapshot before
  // replacement. A failure aborts the transaction without changing records.
  beforeReplace?.(current);
  await db.recovery.put({id:'before-import',json:JSON.stringify(current),createdAt:new Date().toISOString()});
  for(const table of tables())await table.clear();
  await db.profiles.put(next.profile);
  await db.settings.put(next.settings);
  await db.favorites.bulkPut(next.favorites);
  await db.recent.bulkPut(next.recent);
  await db.sessions.bulkPut(next.sessions);
  await db.storyProgress.bulkPut(next.storyProgress);
  await db.creations.bulkPut(next.creations);
  await db.observations.bulkPut(next.observations);
  return current;
 }));
 storageStatus.reset();return previous;
}
export async function clearLocalData(){await resetPendingResultsAfter(()=>db.transaction('rw',[...tables(),db.recovery],async()=>{for(const table of [...tables(),db.recovery])await table.clear();}));storageStatus.reset();}
export function domainSummary(sessions:{activityId:string}[]){return content.activities.reduce((map,a)=>{map[a.domain]=(map[a.domain]||0)+sessions.filter(s=>s.activityId===a.id).length;return map;},{}as Record<string,number>);}
