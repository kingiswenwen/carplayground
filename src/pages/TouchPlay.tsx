import {PlayPicture} from '../components/PlayPicture';
import {PlaySymbol} from '../components/PlaySymbol';
import {PlayGuide} from '../components/PlayGuide';
import {nextInvitation} from '../domain/play-journey';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, Hand, Pause, Play, RotateCcw, Smartphone, Users, Volume2 } from 'lucide-react';
import { getActivity, type ActivityId } from '../domain/content';
import { TouchBoard, type BoardSnapshot } from '../game/TouchBoard';
import { useLearningSession } from '../hooks/useLearningSession';
import { db, safely, type Creation, type Settings, type Mark } from '../services/storage';
import { audio } from '../services/audio';

const empty:BoardSnapshot={ready:false,progress:0,completed:false,moving:false,hint:false,recovering:false,selected:null,signalGreen:false,road:{level:0,shapes:[],locked:[],won:false},comparison:[],wash:{clean:0,waiting:false},parts:[],items:[],targets:[]};
type OrientationPermission = typeof DeviceOrientationEvent & {requestPermission?:()=>Promise<string>};
export function TouchPlay({id,carId,settings,backHref='#/explore',continueHref}:{id:ActivityId;carId:string;settings:Settings;backHref?:string;continueHref?:string}){
  const activity=getActivity(id)!;
  const session=useLearningSession(activity,settings,carId,true);
  const next=nextInvitation(id,carId);
  const canvas=useRef<HTMLCanvasElement>(null), board=useRef<TouchBoard|null>(null);
  const callbacks=useRef(session);callbacks.current=session;
  const [state,setState]=useState(empty),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[sensor,setSensor]=useState(false),[sensorMessage,setSensorMessage]=useState('');
  const [portrait,setPortrait]=useState(()=>window.matchMedia('(max-width: 600px)').matches);
  const [creationStatus,setCreationStatus]=useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [note,setNote]=useState(''),[noteMessage,setNoteMessage]=useState(''),[noteBusy,setNoteBusy]=useState(false);
  const [guideStep,setGuideStep]=useState<number|null>(null);
  const guide=(step:number|null)=>{board.current?.setGuideStep(step);setGuideStep(step);};
  const revision=useRef(0);
  const creation=useRef<Creation|null>(null),writeTimer=useRef<ReturnType<typeof setTimeout>|null>(null),writeChain=useRef(Promise.resolve());
  const writeCreation=()=>{
    if(!creation.current)return;
    const snapshot=structuredClone(creation.current),savingRevision=revision.current;setCreationStatus('saving');
    writeChain.current=writeChain.current.then(async()=>{
      const saved=await safely(async()=>{await db.creations.put(snapshot);return true;},false);
      if(creation.current?.id===snapshot.id&&savingRevision===revision.current)setCreationStatus(saved?'saved':'error');
    });
  };
  const paint=(points:Mark[],background='#eef1d6')=>{
    revision.current++;setCreationStatus('saving');
    creation.current={id:session.id,kind:id==='A02'?'tracks':'poster',carId,background,caption:'',marks:points.slice(-100),createdAt:creation.current?.createdAt||new Date().toISOString(),version:1};
    if(writeTimer.current)clearTimeout(writeTimer.current);
    writeTimer.current=setTimeout(writeCreation,300);
  };
  useEffect(()=>{
    const query=window.matchMedia('(max-width: 600px)');const adapt=()=>setPortrait(query.matches);
    query.addEventListener('change',adapt);return()=>query.removeEventListener('change',adapt);
  },[]);
  useEffect(()=>{
    let alive=true;
    if(!canvas.current)return;
    setState(empty);setError('');setGuideStep(null);
    const next=new TouchBoard(canvas.current,{id,carId,portrait,
      speak:(...sounds)=>{if(!callbacks.current.paused)void audio.play(...sounds);},finish:(summary,sounds)=>callbacks.current.finish(summary,sounds),feedback:text=>callbacks.current.setMessage(text),
      changed:value=>{if(alive)setState(value);},paint:(points,background)=>{if(alive)paint(points,background);}});
    board.current=next;
    void next.load().catch(()=>{if(alive)setError('跑车素材暂时没准备好，请重试。');});
    return()=>{alive=false;next.dispose();board.current=null;};
  },[id,carId,attempt]);
  useEffect(()=>{board.current?.resize(portrait);},[portrait]);
  useEffect(()=>{
    if(session.paused||guideStep!==null){board.current?.cancel();return;}
    let request=0,previous=performance.now();
    const frame=(now:number)=>{const dt=Math.min(.05,(now-previous)/1000);previous=now;board.current?.draw(dt);request=requestAnimationFrame(frame);};
    request=requestAnimationFrame(frame);return()=>cancelAnimationFrame(request);
  },[session.paused,portrait,attempt,guideStep]);
  useEffect(()=>()=>{
    if(writeTimer.current)clearTimeout(writeTimer.current);
    if(creation.current){const snapshot=structuredClone(creation.current);void writeChain.current.then(()=>safely(()=>db.creations.put(snapshot),undefined));}
    audio.stop();
  },[]);
  useEffect(()=>{
    if(!sensor||session.paused)return;
    const handle=(event:DeviceOrientationEvent)=>{if(board.current)board.current.tilt=Math.max(-25,Math.min(25,event.gamma||0));};
    window.addEventListener('deviceorientation',handle);
    return()=>{window.removeEventListener('deviceorientation',handle);if(board.current)board.current.tilt=0;};
  },[sensor,session.paused]);
  const point=(event:PointerEvent<HTMLCanvasElement>)=>{
    const box=event.currentTarget.getBoundingClientRect();return{x:(event.clientX-box.left)/box.width*1000,y:(event.clientY-box.top)/box.height*(board.current?.height||680)};
  };
  const tilt=async()=>{
    if(sensor){setSensor(false);return;}
    try{
      const api=window.DeviceOrientationEvent as OrientationPermission|undefined;
      if(!api){setSensorMessage('这台设备可以直接用手指推车。');return;}
      if(api.requestPermission&&await api.requestPermission()!=='granted'){setSensorMessage('可以继续用手指推车。');return;}
      setSensor(true);setSensorMessage('轻轻倾斜设备，手指也能继续控制。');
    }catch{setSensor(false);setSensorMessage('可以继续用手指推车。');}
  };
  const inputTime=(event:PointerEvent<HTMLCanvasElement>)=>event.timeStamp>1e12?event.timeStamp-performance.timeOrigin:event.timeStamp;
  const active=!session.paused&&state.ready&&!error;
  return <div className="touch-play" data-activity={id} data-completed={state.completed}>
    <div className="touch-toolbar">
      <a className="touch-icon" href={backHref} aria-label="回到乐园"><ArrowLeft/></a>
      <a className="touch-title" href={`#/cars/${carId}`} aria-label="旋转看看这辆车"><PlayPicture id={id} carId={carId}/></a>
      <div className="touch-tools">
        {id==='P01'&&typeof window.DeviceOrientationEvent!=='undefined'&&<button className="touch-icon" aria-label={sensor?'关闭倾斜操控':'启用倾斜操控'} aria-pressed={sensor} onClick={()=>void tilt()}><Smartphone/></button>}
        <button className="touch-icon help-demonstration" aria-label="看看怎么玩" aria-expanded={guideStep!==null} disabled={!active||state.completed} onClick={()=>{if(guideStep!==null){guide(null);return;}guide(0);session.hint();}}><PlaySymbol name="hand"/><Play className="help-play" fill="currentColor"/></button>
        <button className="touch-icon" aria-label="重听玩法" disabled={session.paused} onClick={()=>{void audio.play(activity.instructionAudio);}}><Volume2/></button>
        <button className="touch-icon" aria-label="重新玩" onClick={()=>window.dispatchEvent(new Event('restart-activity'))}><RotateCcw/></button>
      </div>
    </div>
    <div className="touch-canvas-wrap">
      <canvas ref={canvas} className="touch-canvas" aria-label={`${activity.title}互动场景，直接拖动物体；键盘方向键移动，回车放下，Escape取消，左右方括号选择物体`} role="application" tabIndex={0}
        data-state={JSON.stringify(state)}
        onPointerDown={event=>{if(!active)return;if(guideStep!==null)guide(null);event.currentTarget.setPointerCapture(event.pointerId);board.current?.down(event.pointerId,point(event),inputTime(event));}}
        onPointerMove={event=>{if(active)board.current?.move(event.pointerId,point(event),inputTime(event));}}
        onPointerUp={event=>{if(active)board.current?.up(event.pointerId,point(event),inputTime(event));if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
        onPointerCancel={event=>board.current?.cancel(event.pointerId)}
        onLostPointerCapture={event=>board.current?.cancel(event.pointerId)}
        onKeyDown={event=>{if(active&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' ','Escape','[',']'].includes(event.key)){event.preventDefault();if(guideStep!==null)guide(null);board.current?.keyboard(event.key);}}}
      >直接拖动车、零件和场景里的物件。</canvas>
      {!state.ready&&!error&&<div className="touch-loading" role="status"><span>🛞</span></div>}
      {error&&<div className="touch-loading" role="alert"><span aria-hidden="true">🛞</span><span className="sr-only">{error}</span><button className="touch-icon" aria-label="重新加载游戏跑车" onClick={()=>setAttempt(n=>n+1)}><RotateCcw/></button></div>}
      {session.paused&&<div className="pause-overlay"><Pause size={44}/><button className="touch-icon" aria-label="继续探索" onClick={session.resume}><Play/></button></div>}
    </div>
    {guideStep!==null&&board.current&&<PlayGuide board={board.current} step={guideStep} onStep={guide} close={()=>guide(null)} portrait={portrait}/>}
    <div className="touch-bottom">
      <span aria-hidden="true"><Hand size={20}/></span>
      <div className="touch-progress" aria-label="本次探索进度" role="progressbar" aria-valuenow={Math.round(state.progress*100)} aria-valuemin={0} aria-valuemax={100}><span style={{transform:`scaleX(${Math.min(1,state.progress)})`}}/></div>
      {state.completed&&<Check aria-label="记录一次探索"/>}
      {continueHref&&state.completed&&<a className="touch-icon" aria-label="继续故事" href={continueHref}><ArrowRight/></a>}
    </div>
    {state.completed&&!continueHref&&<div className="next-invitation" role="region" aria-label="小车接下来想去哪里">
      {session.completion&&<button className="completion-replay" aria-label="重听这次发现" onClick={()=>audio.feedback(session.completion!.text,session.completion!.sounds,session.completion!.preferClips)}><PlaySymbol name={session.completion.symbol}/><Volume2/><span className="sr-only">{session.completion.text}</span></button>}
      <span className="invitation-trail" aria-hidden="true"/>
      <a href={next.href} className="next-destination" aria-label={next.label}><PlayPicture id={next.picture} carId={carId}/><ArrowRight aria-hidden="true"/></a>
    </div>}
    <span className="sr-only" role="status" aria-live="polite">{session.message}</span>
    {(session.recordStatus==='error'||creationStatus==='error')&&<div className="pictorial-error" role="status"><span className="sr-only">这次记录暂时没保存。</span><button className="picture-button" aria-label="重试保存" onClick={()=>{void session.retrySave();writeCreation();}}><RotateCcw/></button></div>}
    {sensorMessage&&<span className="sr-only" role="status">{sensorMessage}</span>}
    <details className="touch-adult"><summary role="button" aria-label="给一起玩的家长"><Users/></summary><p>{activity.goal}</p>{activity.mode==='open'&&<p>这里只记录参与探索，不自动评价表达能力或学习掌握程度。</p>}<p>{activity.extension}</p><p>直接触碰画面中的物体开始。需要时点手掌播放按钮，按三幅图查看当前这一步的示范；演示不替孩子操作，也不计入完成记录。拖动不方便时，可以点选物件再点轮廓。游戏车为GPT重新生成的跑车素材；运动和装配使用教学示意，不代表车型真实性能或维修步骤。</p><p>会话：{session.recordStatus==='saved'?'已保存在本机':session.recordStatus==='saving'?'正在保存':'探索中'}{creationStatus==='saved'?'；作品已保存':''}</p><label>家长观察（可选）<textarea aria-label="家长观察（可选）" maxLength={500} value={note} onChange={event=>setNote(event.target.value)}/></label><button disabled={noteBusy} onClick={async()=>{setNoteBusy(true);const saved=await session.observe(note);setNoteBusy(false);setNoteMessage(saved?'观察已保存在本机':'观察暂时没保存，文字仍在，可以重试');}}>保存观察</button>{noteMessage&&<p role="status">{noteMessage}</p>}</details>
  </div>;
}
