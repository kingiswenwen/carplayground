import '../styles/family.css';
import {TownHeading} from '../components/Town';
import {useCallback, useEffect, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, Volume2, Pause, RotateCcw, Check} from '../components/TownIcons';
import {StoryScene} from '../components/StoryScene';
import {PlaySymbol} from '../components/PlaySymbol';
import {activeCar} from '../domain/active-car';
import {content} from '../domain/content';
import {audio} from '../services/audio';
import {db, safely} from '../services/storage';

export function Story({storyId, initialFrame}: {storyId: string; initialFrame?: number}) {
  const story = content.stories.find(s => s.id === storyId)!;
  const [frame, setFrame] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [finished, setFinished] = useState(false);
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'failed'>('saving');
  const saving = useRef(false);
  const epoch = useRef(0);
  const requestedNarration=useRef(false);
  const [narration,setNarration]=useState(0);

  const [listening,setListening]=useState(false);
  const voiceId=useRef(0);
  const turnDirection=useRef(0);
  const stopNarration=useCallback(()=>{
    voiceId.current++;
    audio.stop();
    setListening(false);
  },[]);
  const playNarration=useCallback(async(clip:string,requested:boolean)=>{
    const id=++voiceId.current;
    setListening(true);
    try{await (requested?audio.playRequested(clip):audio.play(clip));}
    finally{if(id===voiceId.current)setListening(false);}
  },[]);

  const consumeReturnStep = () => {
    // The return step is an entry instruction, not a permanent progress override.
    if (initialFrame !== undefined) history.replaceState(history.state, '', `${location.pathname}${location.search}#/stories/${storyId}`);
  };

  const writeProgress = async (nextFrame: number, nextFinished: boolean) => safely(async () => {
    await db.storyProgress.put({storyId, version: story.version, frame: nextFrame, finished: nextFinished, updatedAt: new Date().toISOString()});
    return true;
  }, false, `story:${storyId}`);

  useEffect(() => {
    const currentEpoch = ++epoch.current;
    setLoaded(false);
    saving.current = true;
    void (async () => {
      const saved = await safely(() => db.storyProgress.get(storyId), undefined, `story:read:${storyId}`);
      if (currentEpoch !== epoch.current) return;
      const nextFrame = initialFrame ?? saved?.frame ?? 0;
      const nextFinished = initialFrame !== undefined ? false : saved?.finished ?? false;
      const persisted = initialFrame === undefined && saved ? true : await writeProgress(nextFrame, nextFinished);
      if (currentEpoch !== epoch.current) return;
      if (persisted) consumeReturnStep();
      setFrame(nextFrame);
      setFinished(nextFinished);
      setSaveState(persisted ? 'saved' : 'failed');
      saving.current = false;
      setLoaded(true);
    })();
    return () => {epoch.current++; voiceId.current++; audio.stop();};
  }, [storyId, initialFrame]);

  // Commit first: once a new chapter is visible, an immediate refresh can
  // restore it. Failed writes still allow reading, with an explicit retry.
  const changeFrame = async (nextFrame: number, nextFinished = false, listen = false) => {
    if (saving.current) return;
    saving.current = true;
    const currentEpoch = epoch.current;
    stopNarration();
    if(listen)audio.prepareRequested();
    setSaveState('saving');
    const persisted = await writeProgress(nextFrame, nextFinished);
    if (currentEpoch !== epoch.current) return;
    if (persisted) consumeReturnStep();
    requestedNarration.current=listen;
    turnDirection.current=Math.sign(nextFrame-frame);
    setFrame(nextFrame);
    if(listen)setNarration(value=>value+1);
    setFinished(nextFinished);
    setSaveState(persisted ? 'saved' : 'failed');
    saving.current = false;
  };

  useEffect(()=>{if(loaded){const requested=requestedNarration.current;requestedNarration.current=false;void playNarration(story.frames[frame].audio,requested);}},[loaded,frame,story,narration,playNarration]);
  if (!loaded) return <div className="pictorial-loading" role="status" aria-label="故事正在打开"><PlaySymbol name="book"/></div>;
  const current=story.frames[frame];
  const activityTitle=content.activities.find(a=>a.id===current.activityId)?.title;
  const playHref=`#/play/${current.activityId}?story=${storyId}&step=${frame}&car=${activeCar()}`;
  return <div className="picture-story" data-frame={frame} data-story={storyId} data-save={saveState}>
   <TownHeading title={story.title} description={`第 ${frame+1} 幕 · ${current.title}`}/>
   <div className="picture-story-toolbar"><a className="picture-button" data-town-back href="#/explore" aria-label="回到探索"><ArrowLeft/></a><button className="picture-button" aria-label={listening?'停止朗读':'听这一幕'} aria-pressed={listening} onClick={()=>listening?stopNarration():void playNarration(current.audio,true)}>{listening?<Pause/>:<Volume2/>}</button><button className="picture-button" aria-label="从头听" disabled={saveState==='saving'} onClick={()=>void changeFrame(0,false,true)}><RotateCcw/></button></div>
   <a className="story-activity-link" href={playHref} aria-label={`一起玩：${activityTitle}`}>
     <figure>
       <span className={`story-picture scene-${story.scene} frame-${frame}`}><StoryScene storyId={storyId} frame={frame} carId={activeCar()}/></span>
       <figcaption className="town-story-caption" data-turn={turnDirection.current}><p key={frame}>{current.text}</p><span className="story-invitation">一起玩：{activityTitle}<ArrowRight aria-hidden="true"/></span></figcaption>
     </figure>
   </a>
   <div className="story-progress" aria-label="故事进度">{story.frames.map((item,i)=><button key={i} className="story-dot" aria-label={`第 ${i+1} 幕：${item.title}`} aria-current={frame===i?'step':undefined} disabled={saveState==='saving'} onClick={()=>{if(i!==frame)void changeFrame(i);}}/>)}</div>
   <div className="activity-controls"><button className="picture-button" aria-label="上一幕" disabled={frame===0||saveState==='saving'} onClick={()=>void changeFrame(frame-1)}><ArrowLeft/></button>{frame<3?<button className="picture-button" aria-label="跳过玩法，继续故事" disabled={saveState==='saving'} onClick={()=>void changeFrame(frame+1)}><ArrowRight/></button>:<button className="picture-button" aria-label={finished&&saveState==='saved'?'故事的小脚印已记下':'故事看完啦'} disabled={finished||saveState==='saving'} onClick={()=>void changeFrame(frame,true)}><Check/></button>}</div>
   {saveState==='failed'?<div className="activity-feedback pictorial-error"><span role="status">故事进度暂时没能保存。可以继续看，也可以重试。</span><button className="picture-button" aria-label="重试保存进度" onClick={()=>void changeFrame(frame,finished)}><RotateCcw/></button></div>:<span className={finished?'story-completion':'sr-only'} role="status">{saveState==='saving'?'正在记下这一幕…':finished?'这段故事已经记在这台设备。':''}</span>}
  </div>;
}
