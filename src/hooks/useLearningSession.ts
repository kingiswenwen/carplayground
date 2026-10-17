import{useEffect,useRef,useState}from'react';
import{content,type ActivityDefinition}from'../domain/content';import{newSessionId}from'../domain/session-id';import{audio}from'../services/audio';import{db,finishSession,safely,type Settings}from'../services/storage';
export function useLearningSession(activity:ActivityDefinition,settings:Settings,carId:string){
 const[id]=useState(newSessionId);const[done,setDone]=useState(false);const[paused,setPaused]=useState(document.hidden);const[message,setMessage]=useState('');const ended=useRef(false),alive=useRef(true),hints=useRef(0),isPaused=useRef(document.hidden),elapsed=useRef(0),last=useRef(performance.now()),start=useRef<Promise<unknown>>(Promise.resolve());
 const replay=()=>{if(!isPaused.current)void audio.play(activity.instructionAudio);};
 useEffect(()=>{let cancelled=false,started=false;alive.current=true;queueMicrotask(()=>{if(cancelled)return;started=true;start.current=safely(()=>db.sessions.put({id,activityId:activity.id,activityVersion:activity.version,contentReleaseId:content.id,carIds:[carId],difficulty:settings.difficulty,locale:'zh-CN',audioEnabled:settings.sound,startedAt:new Date().toISOString(),state:'playing',hints:0,durationMs:0}),undefined);});
 const hide=()=>{if(document.hidden&&!isPaused.current){elapsed.current+=performance.now()-last.current;isPaused.current=true;setPaused(true);audio.stop();}};document.addEventListener('visibilitychange',hide);replay();return()=>{cancelled=true;alive.current=false;document.removeEventListener('visibilitychange',hide);audio.stop();const duration=elapsed.current+(isPaused.current?0:performance.now()-last.current);if(started)void start.current.then(()=>safely(()=>finishSession(id,'exited',hints.current,duration),false));};
 // One immutable attempt owns these entry settings and content.
 },[id]);
 const finish=(summary:string)=>{if(!alive.current||ended.current||isPaused.current)return;ended.current=true;setDone(true);const duration=elapsed.current+performance.now()-last.current;void start.current.then(()=>safely(()=>finishSession(id,activity.mode==='open'?'participated':'completed',hints.current,duration,summary),false));void audio.play(activity.mode==='open'?'expression-done':activity.completeAudio);};
 const hint=()=>{if(isPaused.current)return;hints.current++;setMessage(activity.hint);void audio.play(activity.hintAudio);};
 const resume=()=>{last.current=performance.now();isPaused.current=false;setPaused(false);};
 const observe=async(text:string)=>{if(!text.trim())return;await safely(()=>db.observations.put({id,activityId:activity.id,text:text.trim().slice(0,500),createdAt:new Date().toISOString()}),undefined);};
 return{id,done,paused,message,setMessage,replay,finish,hint,resume,observe};
}
