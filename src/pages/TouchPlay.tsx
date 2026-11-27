import {visitPlaces} from '../domain/outings';
import {sequenceScenes} from '../domain/sequence-scene';
import {treadNames,treadShapes} from '../domain/tread-path';
import {standSceneNames} from '../domain/studio-scenes';
import {hasSceneArtwork} from '../visual/scene-artwork';
import {activityPlace,teachingActions} from '../domain/town';
import {PlayPicture} from '../components/PlayPicture';
import {PlaySymbol} from '../components/PlaySymbol';
import {CarThumbnail} from '../components/CarImage';
import {PlayGuide} from '../components/PlayGuide';
import {nextInvitation} from '../domain/play-journey';
import { lazy,Suspense,useCallback,useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import {Layers, ArrowLeft, ArrowRight, Box, Check, Hand, Pause, Play, RotateCcw, Save, Download, Smartphone, Users, Volume2 } from '../components/TownIcons';
import { getActivity,getCar,type ActivityId } from '../domain/content';
import { TouchBoard, type BoardSnapshot } from '../game/TouchBoard';
import { useLearningSession } from '../hooks/useLearningSession';
import { db, safely, type Creation, type Settings, type Mark } from '../services/storage';
import { audio } from '../services/audio';
import {stageGoal} from '../domain/play-level';
import {vehicleModel} from '../domain/vehicle-models';
import {vehiclePreview} from '../domain/vehicle-preview';
const TouchWorld3D=lazy(()=>import('../three/TouchWorld3D').then(m=>({default:m.TouchWorld3D})));

const empty:BoardSnapshot={ready:false,progress:0,completed:false,moving:false,hint:false,recovering:false,selected:null,signalGreen:false,road:{level:0,shapes:[],locked:[],won:false},comparison:[],wash:{clean:0,waiting:false},parts:[],items:[],targets:[]};
type OrientationPermission = typeof DeviceOrientationEvent & {requestPermission?:()=>Promise<string>};
export function TouchPlay({id,carId,settings,backHref='#/explore',continueHref}:{id:ActivityId;carId:string;settings:Settings;backHref?:string;continueHref?:string}){
  const activity=getActivity(id)!;
  const [threeFailed,setThreeFailed]=useState(false),[worldReady,setWorldReady]=useState(false);
  const [flat,setFlat]=useState(()=>{
    const view=new URLSearchParams(location.hash.split('?')[1]||'').get('view');
    return view==='2d'||(hasSceneArtwork(id)&&view!=='3d');
  });
  const model=vehicleModel(carId);
  // Colour rules need a recolourable body; fixed atlas paint can make red and
  // white choices look identical. The picture activity keeps their true colours.
  const threeAvailable=!!model&&(!['E01','M04','L03'].includes(id)||model.paintMaterials.length>0);
  const three=threeAvailable&&!threeFailed&&!flat;
  const session=useLearningSession(activity,settings,carId,true);
  const next=nextInvitation(id,carId);
  const canvas=useRef<HTMLCanvasElement>(null), board=useRef<TouchBoard|null>(null);
  const callbacks=useRef(session);callbacks.current=session;
  const [state,setState]=useState(empty),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[sensor,setSensor]=useState(false),[sensorMessage,setSensorMessage]=useState('');
  const [portrait,setPortrait]=useState(()=>window.matchMedia('(max-width: 600px)').matches);
  const [creationStatus,setCreationStatus]=useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [note,setNote]=useState(''),[noteMessage,setNoteMessage]=useState(''),[noteBusy,setNoteBusy]=useState(false);
  const [restartOpen,setRestartOpen]=useState(false);
  const restartDialog=useRef<HTMLDialogElement>(null);
  const played=useRef(false),savedNote=useRef('');
  const restart=()=>window.dispatchEvent(new Event('restart-activity'));
  const requestRestart=()=>{
    const unsavedWork=creation.current&&creationStatus!=='saved';
    if((!state.completed&&played.current)||unsavedWork||note.trim()!==savedNote.current){
      audio.stop();setRestartOpen(true);
    }else restart();
  };
  useEffect(()=>{
    if(!restartOpen)return;
    const dialog=restartDialog.current;
    dialog?.showModal();
    return()=>dialog?.close();
  },[restartOpen]);
  const [guideStep,setGuideStep]=useState<number|null>(null);
  const guide=(step:number|null)=>{board.current?.setGuideStep(step);setGuideStep(step);};
  const worldPreview=useRef<((canvas:HTMLCanvasElement,step:number,phase:number,large?:boolean)=>void)|null>(null);
  const renderWorldPreview=useCallback((canvas:HTMLCanvasElement,step:number,phase:number,large?:boolean)=>{
    worldPreview.current?.(canvas,step,phase,large);
  },[]);
  const revision=useRef(0);
  const [exporting,setExporting]=useState(false);
  const creation=useRef<Creation|null>(null),writeTimer=useRef<ReturnType<typeof setTimeout>|null>(null),writeChain=useRef(Promise.resolve());
  const writeCreation=()=>{
    if(!creation.current)return;
    const snapshot=structuredClone(creation.current),savingRevision=revision.current;setCreationStatus('saving');
    writeChain.current=writeChain.current.then(async()=>{
      const saved=await safely(async()=>{await db.creations.put(snapshot);return true;},false,`creation:${snapshot.id}`);
      if(creation.current?.id===snapshot.id&&savingRevision===revision.current){
        setCreationStatus(saved?'saved':'error');
      }
    });
  };
  const paint=(points:Mark[],background='#eef1d6')=>{
    const manual=id==='A01'||id==='C01';
    revision.current++;setCreationStatus(manual?'idle':'saving');
    creation.current={id:session.id,kind:id==='A02'?'tracks':'poster',carId,background,caption:'',marks:points.slice(-100),createdAt:creation.current?.createdAt||new Date().toISOString(),version:1};
    if(manual)return;
    if(writeTimer.current)clearTimeout(writeTimer.current);
    writeTimer.current=setTimeout(writeCreation,300);
  };
  useEffect(()=>{
    if((id==='A01'||id==='C01')&&creationStatus==='saved'&&!session.paused)board.current?.confirmPosterSaved();
  },[id,creationStatus,session.paused]);
  useEffect(()=>{
    const query=window.matchMedia('(max-width: 600px)');const adapt=()=>setPortrait(query.matches);
    query.addEventListener('change',adapt);return()=>query.removeEventListener('change',adapt);
  },[]);
  useEffect(()=>{
    let alive=true;
    if(!canvas.current)return;
    setState(empty);setError('');setGuideStep(null);
    const next=new TouchBoard(canvas.current,{id,carId,portrait,attempt,difficulty:session.difficulty,contentLevel:session.contentLevel,
      speak:(...sounds)=>{if(!callbacks.current.paused)void audio.play(...sounds);},
      speakRequested:sound=>{if(!callbacks.current.paused)void audio.playRequested(sound);},finish:(summary,sounds)=>callbacks.current.finish(summary,sounds),feedback:text=>callbacks.current.setMessage(text),
      changed:value=>{if(alive)setState(value);},paint:(points,background)=>{if(alive)paint(points,background);}});
    board.current=next;
    void next.load().catch(()=>{if(alive)setError('小车暂时没加载好，点一下再试。');});
    return()=>{alive=false;next.dispose();board.current=null;};
  },[id,carId,attempt]);
  useEffect(()=>{board.current?.resize(portrait);},[portrait]);
  useLayoutEffect(()=>{if(!three)board.current?.draw(0);},[three]);
  useEffect(()=>{
    if(session.paused||guideStep!==null||restartOpen){board.current?.cancel();return;}
    let request=0,previous=performance.now();
    const frame=(now:number)=>{const dt=Math.min(.25,(now-previous)/1000);previous=now;board.current?.draw(dt,!three);request=requestAnimationFrame(frame);};
    request=requestAnimationFrame(frame);return()=>cancelAnimationFrame(request);
  },[session.paused,portrait,attempt,guideStep,restartOpen,three]);
  useEffect(()=>()=>{
    if(writeTimer.current)clearTimeout(writeTimer.current);
    if(id==='A02'&&creation.current){const snapshot=structuredClone(creation.current);void writeChain.current.then(()=>safely(()=>db.creations.put(snapshot),undefined,`creation:${snapshot.id}`));}
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
  const trafficCue=state.traffic==='crossing'?'红灯，等行人走过'
    :state.traffic==='green'?'绿灯亮了，推车过路口'
    :state.traffic==='arrived'?'小车安全过路口啦':'把车推到停止线前';
  const bridge=state.bridge,poster=state.poster;
  const trackArt=state.trackArt;
  const stand=state.stand,story=state.story,colorStage=state.colorStage,showroom=state.showroom;
  const standCue=stand?.preview?'从观众的位置看看你的展位':'摆放灯、站牌和背景，再看看你的展位';
  const storyCue=story?.replaying?'看看你刚才编排的故事'
    :story?.act===1?(story.discovery?'第一幕带来了新物件，接着讲':'摆好第二幕，再把故事演一遍')
    :story?.doorOpen?'门开了，去第二幕看看':'移动小车、摆贴纸，或者打开门';
  const colorCue=state.completed?'车都登台啦':colorStage?.presenting?'灯亮了，小车登台啦':'看展台灯，选一辆同色的小车';
  const showroomCue=state.completed?'还可以继续转车轮、开关门和车灯':'转车轮、开车门、点亮车灯';
  const washCue=state.completed?'两辆小车都洗好啦':state.wash.waiting?'洗好啦，点等待的小车交换'
    :state.washing?.stubborn?'深色泥点要用海绵擦':state.washing?.foam?'用水冲掉白色泡沫':'用水冲掉浮尘';

  const parade=state.parade,sorting=state.sorting,assembly=state.assembly;
  const road=state.road;
  const roadCue=road.testing?'看小车能走到哪里':road.stopped?'小车停在断口，转一转路块再试'
    :road.won?(state.completed?'到公园啦！也可以试另一侧':'小车到了，去看下一段路')
    :road.level===2?'中间封路了，绕一侧去公园':'转动路块，再让小车试着开过去';
  const workshopCue=state.workshop==='wheel'?'小车想往前滚，哪个部件能帮忙？'
    :state.workshop==='door'?'有乘客要上车，找找从哪里进去'
    :state.workshop==='light'?'出口暗了，找能照亮路的部件':'小车准备好了';
  const helpful=state.requestHelp;
  const requestCue=helpful?.phase==='request'?'挡板挡住了车，可以请伙伴帮忙'
    :helpful?.phase==='helping'?'伙伴来了，正在挪开挡板'
    :helpful?.phase==='clear'?'挡板挪开了，再推推小车'
    :helpful?.phase==='done'?'小车开进洗车屋啦':'推推小车，看看能不能过去';
  const rolling=state.rollingTest;
  const sequence=state.sequence;
  const sequenceScene=sequence?sequenceScenes[sequence.scene]:undefined;
  const sequenceCue=sequence?.phase==='blocked'?sequence.blockedReason
    :sequence?.phase==='passed'?'小车按你的顺序做完了'
    :sequence?.phase==='play'&&sequence.index>=0?`正在做：${sequenceScene?.steps[sequence.order[sequence.index]]?.name||''}`
    :sequence?.order.includes(-1)?'把物件排进三个位置':'排好了，播放看看';
  const rain=state.rain,trip=state.trip,visit=state.visit;
  const place=visit?.location===null||visit?.location===undefined?undefined:visitPlaces[visit.location];
  const rainCue=rain?.testing?'看看雨滴落在哪里':rain?.result==='dry'?'纸卡还是干的':rain?.result==='wet'?'纸卡上留下了水点':'选雨具放到纸卡上方，再点云朵试试';
  const tripCue=trip?.phase==='arrived'?'车开出门啦':trip?.phase==='driving'?'出口打开了'
    :trip?.phase==='blocked'&&!trip.buckled?'车停在门口，看看安全带':trip?.phase==='blocked'&&!trip.packed?'背包里还缺水'
    :trip?.packed&&trip.buckled?'准备好了，推车出门':'晴天去公园，装好水，扣好安全带';
  const visitCue=place?(visit?.revealed?place.result:`到了${place.name}，${place.action}`):'开车去一个想看的地方';
  const trackCue=state.completed?'两次停点都留下了，看看车在哪条路上跑得远'
    :state.moving?'看两辆车各停在哪里'
    :state.trackRound===1?'用第一次的推力再试一遍'
    :state.comparison.length?'记住停点，交换两条路面':'推一辆车，两辆车会一起出发';
  const rollingCue=rolling?.phase==='predict'?(rolling.round?'坡面变粗了，猜猜谁会滚得更远':'先猜一猜，谁会滚得更远')
    :rolling?.phase==='release'?'猜好了，放开同一个挡板'
    :rolling?.phase==='rolling'?'看它们从同一个起点出发'
    :rolling?.phase==='compare'?'比一比两处停点，再换一种坡面':'看看两次实验的停点';
  const shadowCue=state.completed?'对比两道影子的方向和长短'
    :state.shadowViews?.length?'上一道影子留住了，把灯换到另一侧'
    :'移动小灯，让影子落到树旁或停车线旁';
  const helpers=state.helpers;
  const helperCue=helpers?.done===3?'三个伙伴都帮完忙了'
    :helpers?.active?'看看伙伴怎样用工具':'看看伙伴身边有什么，再挑合适的工具';
  const assemblyCue=assembly?.phase==='blocked'?(assembly.body?`还少${assembly.wheels===0?'两':'一'}只车轮，装好再试`:'先把车身装到台上')
    :assembly?.phase==='testing'?'看看小车能不能平稳滚过去':assembly?.phase==='done'?'小车稳稳开过去了'
    :assembly?.wheels===2?'车轮装齐了，推去试车':assembly?.body?'把两个轮子装进轮位':'先把车身装到台上';
  const paradeCue=parade?.phase==='next'?'这一队出发啦，接下来还有一队'
    :parade?.phase==='driving'?'看看你的车队出发':parade?.phase==='done'?'两队都出发啦'
    :parade?.round===1?'看看新的重复顺序，接上最后两辆':'看车队的颜色，接上最后两辆';
  const sortingCue=sorting==='next'?'颜色分好了，换挂牌再试试'
    :sorting==='lengths'?'比较车身长度，按长短进车位':'先看颜色，把车停到同色车位';
  const parking=state.parking;
  const parkingCue=id==='M01'?'绕开挡板，一辆车停一个空位'
    :id==='M02'?(parking?.spaceNeeded?'车比空位多，补一块车位板':`还有 ${parking?.waiting??3} 辆车在等`)
    :!parking?.longArrived?'先停小车，给晚到的长车留位'
    :parking.longBlocked?'长车位有人，挪开小车试试':'长车到了，给它找个够长的车位';
  const downloadPoster=async()=>{
    if(!creation.current)return;
    const snapshot=structuredClone(creation.current);setExporting(true);
    try{const {exportArtwork}=await import('../services/artwork');await exportArtwork(snapshot);session.setMessage('海报图片已准备好。');}
    catch{session.setMessage('海报图片暂时没能导出，请再试一次。');}
    finally{setExporting(false);}
  };
  const bridgeCue=bridge?.phase==='blocked'?(bridge.shed==='open'?'木料棚里找到了长板，换上再试':bridge.shed==='closed'?'桥板还够不到，看看岸边木料棚':'看亮起来的石头，桥板还够不到它')
    :bridge?.phase==='crossed'?(bridge.reach===0?'过河啦！前面还有更宽的一段':'两段河都过啦')
    :bridge?.phase==='try'?'推推小车，试试桥板':bridge?.reach===1?'河变宽了，再比一比桥板':'让桥板搭在两岸的石头上';
  return <div className={`touch-play town-play place-${activityPlace(id).id}`} data-activity={id} data-content-level={session.contentLevel} data-completed={state.completed}
    onPointerDownCapture={event=>{if(active&&event.target instanceof HTMLCanvasElement)played.current=true;}}
    onClickCapture={event=>{if(event.target instanceof Element&&event.target.closest('.touch-action-row button'))played.current=true;}}
    onKeyDownCapture={event=>{if(active&&event.target instanceof HTMLCanvasElement&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' ','[',']'].includes(event.key))played.current=true;}}>
    <div className="town-play-heading"><span>{activityPlace(id).name}</span><h1>{activity.title}</h1></div>
    <div className="touch-toolbar">
      <a className="touch-icon" data-town-back href={backHref} aria-label="回到乐园"><ArrowLeft/></a>
      <a className="touch-title" href={`#/cars/${carId}`} aria-label="旋转看看这辆车"><CarThumbnail className="touch-car-preview" imageId={vehiclePreview(carId)||getCar(carId)!.game!.side}/></a>
      <div className="touch-tools">
        {threeAvailable&&<button className="touch-icon" aria-label={three?'使用平面简化玩法':'打开立体玩法'} aria-pressed={three} onClick={()=>{setThreeFailed(false);setFlat(three);}}>{three?<Box/>:<Layers/>}<span className="play-view-label" aria-hidden="true">{three?'3D':'2D'}</span></button>}
        {id==='P01'&&typeof window.DeviceOrientationEvent!=='undefined'&&<button className="touch-icon" aria-label={sensor?'关闭倾斜操控':'启用倾斜操控'} aria-pressed={sensor} onClick={()=>void tilt()}><Smartphone/></button>}
        <button className="touch-icon help-demonstration" aria-label="看看怎么玩" aria-expanded={guideStep!==null} disabled={!active||state.completed||(three&&!worldReady)} onClick={()=>{if(guideStep!==null){guide(null);return;}guide(0);session.hint();}}><PlaySymbol name="hand"/><Play className="help-play" fill="currentColor"/></button>
        <button className="touch-icon" aria-label="重听玩法" disabled={session.paused} onClick={session.replay}><Volume2/></button>
        <button className="touch-icon" aria-label="重新玩" onClick={requestRestart}><RotateCcw/></button>
      </div>
    </div>
    {restartOpen&&<dialog className="parent-gate restart-play" ref={restartDialog} aria-labelledby="restart-title" onCancel={()=>setRestartOpen(false)}>
      <div><h2 id="restart-title">从头再玩？</h2><p>重新开始会清空当前玩法进度和未保存的内容。</p>
        <button className="button primary" onClick={()=>setRestartOpen(false)}>接着玩</button>
        <button className="text-button" onClick={restart}>从头再玩</button>
      </div></dialog>}
    <div className="touch-canvas-wrap">
      <canvas ref={canvas} className="touch-canvas" data-presentation={three?'three':'flat'} aria-hidden={three} aria-label={`${activity.title}互动场景，${['E02','T01'].includes(id)?(session.contentLevel==='starter'?'回车或空格找车轮':'回车或空格逐个探索车轮、车门和车灯'):id==='H03'?'回车或空格逐处擦洗车身，第一辆洗净后再按一次换车':id==='T02'?'方括号选择桥板和木料棚，回车放桥、开棚或推车，过河后回车去下一段':id==='S01'?'上箭头猜小球，下箭头猜方块，回车放挡板或换坡面':id==='A01'?'拖动贴纸，或者选择贴纸后点画纸；键盘用方括号选贴纸，回车放置':id==='E03'?'拖动车辆，或按回车推车；红灯停住等行人，绿灯再走':'直接拖动物体；键盘方向键移动，回车放下，Escape取消，左右方括号选择物体'}`} role="application" tabIndex={three?-1:0}
        data-state={JSON.stringify(state)}
        onPointerDown={event=>{if(!active)return;if(guideStep!==null)guide(null);event.currentTarget.setPointerCapture(event.pointerId);board.current?.down(event.pointerId,point(event),inputTime(event));}}
        onPointerMove={event=>{if(active)board.current?.move(event.pointerId,point(event),inputTime(event));}}
        onPointerUp={event=>{if(active)board.current?.up(event.pointerId,point(event),inputTime(event));if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
        onPointerCancel={event=>board.current?.cancel(event.pointerId)}
        onLostPointerCapture={event=>board.current?.cancel(event.pointerId)}
        onKeyDown={event=>{if(active&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' ','Escape','[',']'].includes(event.key)){event.preventDefault();if(guideStep!==null)guide(null);board.current?.keyboard(event.key);}}}
      >直接拖动车、零件和场景里的物件。</canvas>
      {three&&state.ready&&board.current&&<Suspense fallback={<div className="world-preparing" role="status" aria-label="正在准备立体场景"><Box/></div>}><TouchWorld3D board={board.current} carId={carId} id={id} state={state} paused={session.paused||guideStep!==null||restartOpen} onUnavailable={()=>setThreeFailed(true)} onReadyChange={setWorldReady} onPreview={render=>{worldPreview.current=render;}}/></Suspense>}
      {!state.ready&&!error&&<div className="touch-loading" role="status" aria-label="正在准备玩法"><PlaySymbol name="wheel"/></div>}
      {error&&<div className="touch-loading" role="alert"><PlaySymbol name="wheel"/><span>{error}</span><button className="touch-icon" aria-label="重新加载游戏跑车" onClick={()=>setAttempt(n=>n+1)}><RotateCcw/></button></div>}
      {session.paused&&<div className="pause-overlay"><Pause size={44}/><button className="touch-icon" aria-label="继续探索" onClick={session.resume}><Play/></button></div>}
    </div>
    {guideStep!==null&&board.current&&<PlayGuide board={board.current} step={guideStep} onStep={guide} close={()=>guide(null)} portrait={portrait} renderPreview={three?renderWorldPreview:undefined}/>}
    <div className="touch-bottom">
      <span className="town-action-cue"><Hand size={20}/><span>{id==='H03'?washCue:id==='T02'?bridgeCue:id==='E03'?trafficCue:assembly?assemblyCue:id==='T03'?roadCue:helpers?helperCue:helpful?requestCue:rolling?rollingCue:rain?rainCue:trip?tripCue:visit?visitCue:sequence?sequenceCue:stand?standCue:story?storyCue:colorStage?colorCue:showroom?showroomCue:id==='S02'?shadowCue:id==='P01'?trackCue:state.workshop?workshopCue:parking?(state.completed?'车都停好啦':parkingCue):parade?paradeCue:sorting?sortingCue:teachingActions[id]}</span></span>
      <div className="touch-progress" aria-label="本次探索进度" role="progressbar" aria-valuenow={Math.round(state.progress*100)} aria-valuemin={0} aria-valuemax={100}><span style={{transform:`scaleX(${Math.min(1,state.progress)})`}}/></div>
      {state.completed&&session.recordStatus==='saved'&&<span className="town-record-state"><Check aria-label="记录一次探索"/>{activity.mode==='open'?'已记下一次参与':'已记下这次发现'}</span>}
      {continueHref&&state.completed&&<a className="touch-icon" aria-label="继续故事" href={continueHref}><ArrowRight/></a>}
    </div>
    {helpful&&(helpful.phase==='stuck'||helpful.phase==='clear')&&<div className="touch-action-row">
      <button className="button primary" disabled={!active||guideStep!==null} onClick={()=>board.current?.tryHelpCar()}>推推小车</button>
    </div>}
    {helpful?.phase==='request'&&<div className="touch-action-row" aria-label="请伙伴帮忙">
      <button className="button" disabled={!active||guideStep!==null} onClick={()=>board.current?.askForHelp('wave')}>招招手</button>
      <button className="button" disabled={!active||guideStep!==null} onClick={()=>board.current?.askForHelp('call')}>喊伙伴</button>
      <button className="button" disabled={!active||guideStep!==null} onClick={()=>board.current?.askForHelp('card')}>递求助卡</button>
    </div>}
    {rolling&&(rolling.phase==='predict'||rolling.phase==='release')&&<div className="touch-action-row" aria-label="预测谁滚得更远">
      <button className={rolling.guess==='ball'?'button primary':'button'} aria-pressed={rolling.guess==='ball'} disabled={!active||guideStep!==null} onClick={()=>board.current?.predictRolling('ball')}>猜小球更远</button>
      <button className={rolling.guess==='cube'?'button primary':'button'} aria-pressed={rolling.guess==='cube'} disabled={!active||guideStep!==null} onClick={()=>board.current?.predictRolling('cube')}>猜方块更远</button>
      {rolling.phase==='release'&&<button className="button primary" disabled={!active||guideStep!==null} onClick={()=>board.current?.releaseRolling()}>放开挡板</button>}
    </div>}
    {rolling?.phase==='compare'&&<div className="touch-action-row">
      <button className="button primary" disabled={!active||guideStep!==null} onClick={()=>board.current?.nextRolling()}>换个坡面</button>
    </div>}
    {id==='P01'&&state.comparison.length===1&&!state.moving&&<div className="touch-action-row">
      <button className="button primary" disabled={!active||guideStep!==null}
        onClick={()=>state.trackRound===1?board.current?.repeatPush():board.current?.swapTracks()}>
        {state.trackRound===1?'用同样的力再试':'交换路面'}
      </button>
    </div>}
    {rain&&<div className="touch-action-row">
      <button className="button primary" disabled={!active||guideStep!==null||rain.testing}
        onClick={()=>rain.result?board.current?.resetRain():board.current?.testRain()}>
        {rain.result?'换一套再试':'试试下雨'}
      </button>
      {rain.samples.length>0&&<span className="town-test-results" role="group" aria-label="试验记录">
        {rain.samples.map((sample,index)=><span key={index}>{index>0&&<ArrowRight size={15}/>}
          {sample.result==='wet'?'湿':'干'}</span>)}
      </span>}
    </div>}
    {trip&&trip.phase!=='arrived'&&<div className="touch-action-row">
      <button className="button primary" disabled={!active||guideStep!==null||trip.phase==='driving'} onClick={()=>board.current?.departTrip()}>开车出门</button>
    </div>}
    {visit&&<div className="touch-action-row" aria-label="小镇地图">
      {place
        ?<>
          {!visit.revealed&&<button className="button primary" disabled={!active||guideStep!==null} onClick={()=>board.current?.discoverVisit()}>{place.action}</button>}
          <button className="button" disabled={!active||guideStep!==null} onClick={()=>board.current?.showVisitMap()}>回地图</button>
        </>
        :visitPlaces.map(({name},i)=><button className="button" key={name} disabled={!active||guideStep!==null}
          onClick={()=>board.current?.goVisit(i)}>去{name}{visit.visited.includes(i)&&<Check size={16} aria-label="去过"/>}</button>)}
    </div>}
    {sequence&&sequenceScene&&<div className="touch-action-row" aria-label={sequenceScene.name}>
      <button className="button primary" disabled={!active||guideStep!==null||sequence.phase==='play'||sequence.order.includes(-1)}
        onClick={()=>board.current?.playSequence()}><Play size={18}/>照顺序演一遍</button>
      <button className="button" disabled={!active||guideStep!==null||sequence.phase==='play'} onClick={()=>board.current?.changeSequence()}>{sequenceScene.next}</button>
    </div>}
    {colorStage&&!state.completed&&<div className="touch-action-row">
      <button className="button" disabled={!active||guideStep!==null||colorStage.presenting} onClick={()=>board.current?.hearStageCar()}><Volume2 size={18}/>听登场提示</button>
    </div>}
    {stand&&<div className="touch-action-row" aria-label="布置展位">
      {!stand.preview&&<>
        <button className="button" title={standSceneNames[stand.scene]} disabled={!active||guideStep!==null} onClick={()=>board.current?.nextStandScene()}>换背景</button>
        <button className="button" disabled={!active||guideStep!==null||!stand.canUndo} onClick={()=>board.current?.undoPoster()}><RotateCcw size={18}/>撤回</button>
        {stand.selected&&<button className="button" disabled={!active||guideStep!==null} onClick={()=>board.current?.removeStandProp()}>移除道具</button>}
      </>}
      <button className="button" disabled={!active||guideStep!==null} onClick={()=>board.current?.setStandView(!stand.preview)}>{stand.preview?'继续布置':'从观众席看'}</button>
      <button className="button primary" disabled={!active||guideStep!==null||!stand.preview||creationStatus==='saving'||creationStatus==='saved'}
        onClick={writeCreation}><Save size={18}/>{creationStatus==='saved'?'展位已保存':creationStatus==='saving'?'正在保存':'保存展位'}</button>
    </div>}
    {story&&<div className="touch-action-row" aria-label="编排故事">
      <button className="button" disabled={!active||guideStep!==null||story.replaying} onClick={()=>board.current?.changeStory(story.act===0?1:0)}>{story.act===0?'去第二幕':'回第一幕'}</button>
      <button className="button" disabled={!active||guideStep!==null||!story.count||story.replaying} onClick={()=>board.current?.undoStory()}><RotateCcw size={18}/>撤回</button>
      <button className="button primary" disabled={!active||guideStep!==null||!story.count||story.replaying} onClick={()=>board.current?.playStory()}><Play size={18}/>播放我的故事</button>
    </div>}
    {id==='H03'&&state.washing&&!state.wash.waiting&&!state.completed&&<div className="touch-action-row" aria-label="洗车工具">
      <button className={state.washing.tool==='water'?'button primary':'button'} aria-pressed={state.washing.tool==='water'}
        disabled={!active||guideStep!==null} onClick={()=>board.current?.selectWashTool('water')}>喷水</button>
      <button className={state.washing.tool==='sponge'?'button primary':'button'} aria-pressed={state.washing.tool==='sponge'}
        disabled={!active||guideStep!==null} onClick={()=>board.current?.selectWashTool('sponge')}>用海绵</button>
    </div>}
    {id==='T03'&&<div className="touch-action-row">
      {road.won&&!state.completed
        ?<button className="button primary" disabled={!active||guideStep!==null} onClick={()=>board.current?.nextRoad()}>去下一段路<ArrowRight size={18}/></button>
        :<button className="button primary" disabled={!active||guideStep!==null||road.testing} onClick={()=>board.current?.tryRoad()}>{state.completed?'再试这条路':'让小车试路'}</button>}
    </div>}
    {assembly&&!state.completed&&<div className="touch-action-row">
      <button className="button primary" disabled={!active||guideStep!==null||assembly.phase==='testing'} onClick={()=>board.current?.tryAssembly()}>推车试走</button>
      {!!assembly.wheels&&<button className="button" disabled={!active||guideStep!==null||assembly.phase==='testing'} onClick={()=>board.current?.removeAssemblyWheel()}>取下一只轮子</button>}
    </div>}
    {bridge&&(bridge.phase==='try'||bridge.phase==='crossed'&&bridge.reach===0)&&<div className="touch-action-row">
      {bridge.phase==='try'
        ?<button className="button primary" disabled={!active||guideStep!==null} onClick={()=>board.current?.tryBridge()}>推车试桥</button>
        :<button className="button primary" disabled={!active||guideStep!==null} onClick={()=>board.current?.nextBridgeReach()}>去更宽的河段<ArrowRight size={18}/></button>}
    </div>}
    {(parade?.phase==='next'||sorting==='next')&&<div className="touch-action-row">
      <button className="button primary" disabled={!active||guideStep!==null}
        onClick={()=>parade?.phase==='next'?board.current?.nextParade():board.current?.nextSorting()}>
        {parade?.phase==='next'?'接下一队车':'换成长短挂牌'}<ArrowRight size={18}/>
      </button>
    </div>}
    {poster&&<div className="touch-action-row" aria-label="海报工具">
      <button className="button" disabled={!active||guideStep!==null||!poster.canUndo} onClick={()=>board.current?.undoPoster()}><RotateCcw size={18}/>撤回</button>
      <button className="button primary" disabled={!active||guideStep!==null||!poster.count||creationStatus==='saving'||creationStatus==='saved'} onClick={writeCreation}><Save size={18}/>{creationStatus==='saved'?'已保存':creationStatus==='saving'?'正在保存':'保存海报'}</button>
      <button className="button" disabled={!active||guideStep!==null||!poster.count||exporting} onClick={()=>void downloadPoster()}><Download size={18}/>下载图片</button>
    </div>}
    {trackArt&&<div className="touch-action-row" aria-label="轮印工具">
      {treadShapes.map((tread,i)=><button className={trackArt.tread===tread?'button primary':'button'} key={tread}
        aria-pressed={trackArt.tread===tread} disabled={!active||guideStep!==null} onClick={()=>board.current?.changeTread(tread)}>{treadNames[i]}</button>)}
      <button className="button" disabled={!active||guideStep!==null||!trackArt.canUndo} onClick={()=>board.current?.undoTrack()}><RotateCcw size={18}/>撤回</button>
      {creationStatus==='saved'&&<span className="town-record-state" role="status"><Check/>轮印已自动保存</span>}
    </div>}
    {state.completed&&!continueHref&&<div className="next-invitation" role="region" aria-label="小车接下来想去哪里">
      {session.completion&&<button className="completion-replay" aria-label="重听这次发现" onClick={()=>audio.announce(session.completion!.text,session.completion!.sounds,session.completion!.preferClips)}><PlaySymbol name={session.completion.symbol}/><Volume2/><span className="sr-only">{session.completion.text}</span></button>}
      <span className="invitation-trail" aria-hidden="true"/>
      <a href={next.href} className="next-destination" aria-label={next.label}><PlayPicture id={next.picture}/><ArrowRight aria-hidden="true"/></a>
    </div>}
    <span className="sr-only" role="status" aria-live="polite">{session.message}</span>
    {(session.recordStatus==='error'||creationStatus==='error')&&<div className="pictorial-error" role="status"><span>{creationStatus==='error'?'作品暂时没保存。':'这次记录暂时没保存。'}</span><button className="picture-button" aria-label="重试保存" onClick={()=>{if(session.recordStatus==='error')void session.retrySave();if(creationStatus==='error')writeCreation();}}><RotateCcw/></button></div>}
    {sensorMessage&&<span className="sr-only" role="status">{sensorMessage}</span>}
    <details className="touch-adult"><summary role="button" aria-label="给一起玩的家长"><Users/></summary><p>{stageGoal(id,session.contentLevel)||activity.goal}</p>{activity.mode==='open'&&<p>这里只记录参与探索，不自动评价表达能力或学习掌握程度。</p>}<p>{activity.extension}</p><p>直接触碰画面中的物体开始。需要时点手掌播放按钮，按三幅图查看当前这一步的示范；演示不替孩子操作，也不计入完成记录。拖动不方便时，可以点选物件再点轮廓。车辆使用各自登记来源的立体模型和游戏预览；运动和装配使用教学示意，不代表车型真实性能或维修步骤。</p><p>会话：{session.recordStatus==='saved'?'已保存在本机':session.recordStatus==='saving'?'正在保存':session.recordStatus==='error'?'暂时没保存':'探索中'}{creationStatus==='saved'?'；作品已保存':''}</p><label>家长观察（可选）<textarea readOnly={noteBusy} aria-label="家长观察（可选）" maxLength={500} value={note} onChange={event=>{setNote(event.target.value);setNoteMessage('');}}/></label><button disabled={noteBusy||!note.trim()||note.trim()===savedNote.current} onClick={async()=>{setNoteBusy(true);const saved=await session.observe(note);if(saved)savedNote.current=note.trim();setNoteBusy(false);setNoteMessage(saved?'观察已保存在本机':'观察暂时没保存，文字仍在，可以重试');}}>保存观察</button>{noteMessage&&<p role="status">{noteMessage}</p>}</details>
  </div>;
}
