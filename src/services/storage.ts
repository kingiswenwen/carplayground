import Dexie, { type Table } from 'dexie';
import type { ActivityId } from '../domain/content';
export type Settings={id:'default';sound:boolean;difficulty:'gentle'|'explore';simple:boolean};
export type SessionRecord={id:string;activityId:ActivityId;activityVersion:number;contentReleaseId:string;carIds:string[];difficulty:string;locale:'zh-CN';audioEnabled:boolean;startedAt:string;endedAt?:string;state:'playing'|'completed'|'participated'|'exited';hints:number;durationMs:number;summary?:string};
export type Mark={x:number;y:number;color:string;shape:'star'|'leaf'|'sun'|'circle'|'stripe'|'zigzag'};
export type Creation={id:string;kind:'poster'|'tracks';carId:string;background:string;caption:string;marks:Mark[];createdAt:string;version:1};
export type Observation={id:string;activityId:ActivityId;text:string;createdAt:string};
export type StoryProgress={storyId:string;version:number;frame:number;finished:boolean;updatedAt:string};
export type Profile={id:'default';nickname:string};
class PlaygroundDB extends Dexie{
 settings!:Table<Settings,string>;favorites!:Table<{carId:string;at:string},string>;sessions!:Table<SessionRecord,string>;recent!:Table<{carId:string;at:string},string>;
 profiles!:Table<Profile,string>;storyProgress!:Table<StoryProgress,string>;creations!:Table<Creation,string>;observations!:Table<Observation,string>;recovery!:Table<{id:string;json:string;createdAt:string},string>;
 constructor(){super('carplayground-local-v1');this.version(1).stores({settings:'id',favorites:'carId',sessions:'id,activityId,state,startedAt',recent:'carId'});this.version(2).stores({settings:'id',favorites:'carId',sessions:'id,activityId,state,startedAt',recent:'carId',profiles:'id',storyProgress:'storyId',creations:'id,createdAt,kind',observations:'id,activityId,createdAt',recovery:'id'});}
}
export const db=new PlaygroundDB();
export const defaultSettings:Settings={id:'default',sound:false,difficulty:'gentle',simple:false};
const failures=new Set<string>(),attempts=new Map<string,number>(),listeners=new Set<()=>void>();
let unscopedFailure=false,sequence=0;
const failed=()=>unscopedFailure||failures.size>0;
function publish(previous:boolean){if(previous!==failed())listeners.forEach(fn=>fn());}
export const storageStatus={
 subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},get:failed,
 // Only explicit replacement/clearing of all local records resolves all old failures.
 reset(){const previous=failed();failures.clear();attempts.clear();unscopedFailure=false;publish(previous);},
};
export async function safely<T>(work:()=>Promise<T>,fallback:T,scope?:string):Promise<T>{
 const attempt=++sequence;if(scope)attempts.set(scope,attempt);
 try{
  const value=await work();
  // An unrelated read must not hide a failed write. False is used by mutations
  // to indicate that nothing was saved, even when no exception was thrown.
  if(scope&&value!==false&&attempts.get(scope)===attempt){const previous=failed();failures.delete(scope);publish(previous);}
  return value;
 }catch{
  const previous=failed();
  if(scope){if(attempts.get(scope)===attempt)failures.add(scope);}else unscopedFailure=true;
  publish(previous);return fallback;
 }finally{if(scope&&attempts.get(scope)===attempt)attempts.delete(scope);}
}
export async function finishSession(id:string,state:'completed'|'participated'|'exited',hints:number,durationMs:number,summary?:string){return db.transaction('rw',db.sessions,async()=>{const current=await db.sessions.get(id);if(!current||current.state!=='playing')return false;await db.sessions.update(id,{state,hints,durationMs,summary,endedAt:new Date().toISOString()});return true;});}
export type SessionResult=SessionRecord&{state:'completed'|'participated';endedAt:string};
export async function saveSessionResult(result:SessionResult,restoreFailedStart=false){
 return db.transaction('rw',db.sessions,async()=>{
  const current=await db.sessions.get(result.id);
  if(!current&&!restoreFailedStart)return false;
  if(current&&current.state!=='playing')return current.state===result.state&&current.endedAt===result.endedAt;
  // Retry with the original entry metadata even if the initial write failed.
  await db.sessions.put(result);
  return true;
 });
}
