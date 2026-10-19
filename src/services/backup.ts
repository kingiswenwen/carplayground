import {z}from'zod';
import{activityIds,content}from'../domain/content';
import{db,defaultSettings}from'./storage';
const iso=z.string().datetime();const id=z.string().min(1).max(100);
const carId=z.enum(['CAR01','CAR02','CAR03','CAR04','CAR05','CAR06','CAR07','CAR08']);
const settingsSchema=z.object({id:z.literal('default'),sound:z.boolean(),difficulty:z.enum(['gentle','explore']),simple:z.boolean()});
const mark=z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1),color:z.string().regex(/^#[a-fA-F0-9]{6}$/),shape:z.enum(['star','leaf','sun','circle','stripe','zigzag'])});
export const backupSchema=z.object({formatVersion:z.literal(1),exportedAt:iso,profile:z.object({id:z.literal('default'),nickname:z.string().max(60)}),settings:settingsSchema,favorites:z.array(z.object({carId,at:iso})).max(8),recent:z.array(z.object({carId,at:iso})).max(8),sessions:z.array(z.object({id,activityId:z.enum(activityIds),activityVersion:z.number().int().positive(),contentReleaseId:z.string().max(100),carIds:z.array(carId).max(8),difficulty:z.string().max(20),locale:z.literal('zh-CN'),audioEnabled:z.boolean(),startedAt:iso,endedAt:iso.optional(),state:z.enum(['playing','completed','participated','exited']),hints:z.number().int().min(0).max(100000),durationMs:z.number().min(0).max(604800000),summary:z.string().max(1000).optional()})).max(10000),storyProgress:z.array(z.object({storyId:z.enum(['ST01','ST02','ST03']),version:z.literal(1),frame:z.number().int().min(0).max(3),finished:z.boolean(),updatedAt:iso})).max(3),creations:z.array(z.object({id,kind:z.enum(['poster','tracks']),carId,background:z.string().regex(/^#[a-fA-F0-9]{6}$/),caption:z.string().max(80),marks:z.array(mark).max(100),createdAt:iso,version:z.literal(1)})).max(500),observations:z.array(z.object({id,activityId:z.enum(activityIds),text:z.string().max(500),createdAt:iso})).max(10000)}).superRefine((data,ctx)=>{for(const key of ['favorites','recent','sessions','storyProgress','creations','observations']as const){const keys=data[key].map(row=>'id'in row?row.id:'carId'in row?row.carId:row.storyId);if(new Set(keys).size!==keys.length)ctx.addIssue({code:'custom',message:`${key} 包含重复编号`});}});
export type Backup=z.infer<typeof backupSchema>;
const tables=()=>[db.profiles,db.settings,db.favorites,db.recent,db.sessions,db.storyProgress,db.creations,db.observations];
export async function makeBackup():Promise<Backup>{return db.transaction('r',tables(),async()=>backupSchema.parse({formatVersion:1,exportedAt:new Date().toISOString(),profile:await db.profiles.get('default')||{id:'default',nickname:''},settings:await db.settings.get('default')||defaultSettings,favorites:await db.favorites.toArray(),recent:await db.recent.toArray(),sessions:await db.sessions.toArray(),storyProgress:await db.storyProgress.toArray(),creations:await db.creations.toArray(),observations:await db.observations.toArray()}));}
export function parseBackup(text:string){if(new TextEncoder().encode(text).length>10*1024*1024)throw Error('文件超过 10 MB，请选择较小的备份。');let raw:unknown;try{raw=JSON.parse(text);}catch{throw Error('这不是有效的 JSON 备份。');}const result=backupSchema.safeParse(raw);if(!result.success)throw Error('备份版本或内容格式不支持，当前记录没有改变。');return result.data;}
export function download(data:Blob,filename:string){const url=URL.createObjectURL(data);const link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export const downloadBackup=(backup:Backup)=>download(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),`carplayground-backup-${backup.exportedAt.slice(0,10)}.json`);
export async function replaceBackup(input:Backup){
 const next=backupSchema.parse(input);
 return db.transaction('rw',[...tables(),db.recovery],async()=>{
  // Keep the snapshot and replacement under one write transaction. Otherwise
  // another writer can commit between the snapshot and clearing the tables.
  const current=await makeBackup();
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
 });
}
export async function clearLocalData(){await db.transaction('rw',[...tables(),db.recovery],async()=>{for(const table of [...tables(),db.recovery])await table.clear();});}
export function domainSummary(sessions:{activityId:string}[]){return content.activities.reduce((map,a)=>{map[a.domain]=(map[a.domain]||0)+sessions.filter(s=>s.activityId===a.id).length;return map;},{}as Record<string,number>);}
