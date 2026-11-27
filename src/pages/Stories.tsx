import '../styles/family.css';
import {TownHeading} from '../components/Town';
import {useCallback, useEffect, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, Volume2, Pause, RotateCcw, Check} from '../components/TownIcons';
import {StoryScene} from '../components/StoryScene';
import {PlaySymbol} from '../components/PlaySymbol';
import {activeCar} from '../domain/active-car';
import {content} from '../domain/content';
import {audio} from '../services/audio';
import {db, safely, type StoryProgress} from '../services/storage';
import {bufferStoryProgress, pendingStoryProgress, releaseStoryProgress} from '../services/pending-story-progress';

export function Story({storyId, initialFrame}: {storyId: string; initialFrame?: number}) {
  const story = content.stories.find(s => s.id === storyId)!;
  const [draft] = useState(() => pendingStoryProgress(storyId, story.version, story.frames.length));
  const [frame, setFrame] = useState(initialFrame ?? draft?.frame ?? 0);
  const [loaded, setLoaded] = useState(initialFrame !== undefined || !!draft);
  const [finished, setFinished] = useState(draft?.finished ?? false);
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'failed'>('saving');
  const epoch = useRef(0);
  const saveAttempt = useRef(0);
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
    if (initialFrame !== undefined && location.hash.startsWith(`#/stories/${storyId}?`)) {
      history.replaceState(history.state, '', `${location.pathname}${location.search}#/stories/${storyId}`);
    }
  };

  const makeProgress = (nextFrame: number, nextFinished: boolean): StoryProgress => ({
    storyId, version: story.version, frame: nextFrame, finished: nextFinished, updatedAt: new Date().toISOString(),
  });

  const persist = async (progress: StoryProgress) => {
    const attempt = ++saveAttempt.current;
    const currentEpoch = epoch.current;
    if (bufferStoryProgress(progress)) consumeReturnStep();
    setSaveState('saving');
    const saved = await safely(async () => {await db.storyProgress.put(progress);return true;}, false, `story:${storyId}`);
    if (saved) releaseStoryProgress(progress);
    if (currentEpoch !== epoch.current || attempt !== saveAttempt.current) return;
    if (saved) consumeReturnStep();
    setSaveState(saved ? 'saved' : 'failed');
  };

  useEffect(() => {
    const currentEpoch = ++epoch.current;
    const initialAttempt = saveAttempt.current;
    void (async () => {
      const saved = await safely(() => db.storyProgress.get(storyId), undefined, `story:read:${storyId}`);
      if (currentEpoch !== epoch.current || saveAttempt.current !== initialAttempt) return;
      const pending = draft && (!saved || draft.updatedAt >= saved.updatedAt) ? draft : undefined;
      const previous = pending ?? saved;
      const nextFrame = initialFrame ?? previous?.frame ?? 0;
      const nextFinished = previous?.finished ?? false;
      setFrame(nextFrame);
      setFinished(nextFinished);
      setLoaded(true);
      if (initialFrame !== undefined || !previous) void persist(makeProgress(nextFrame, nextFinished));
      else if (pending) void persist(pending);
      else {
        if (draft) releaseStoryProgress(draft);
        setSaveState('saved');
      }
    })();
    return () => {epoch.current++; voiceId.current++; audio.stop();};
  }, [storyId, initialFrame]);

  const changeFrame = (nextFrame: number, nextFinished = finished, listen = false) => {
    stopNarration();
    if (listen) audio.prepareRequested();
    requestedNarration.current = listen;
    turnDirection.current = Math.sign(nextFrame - frame);
    setFrame(nextFrame);
    setFinished(nextFinished);
    if (listen) setNarration(value => value + 1);
    void persist(makeProgress(nextFrame, nextFinished));
  };

  useEffect(()=>{if(loaded){const requested=requestedNarration.current;requestedNarration.current=false;void playNarration(story.frames[frame].audio,requested);}},[loaded,frame,story,narration,playNarration]);
  if (!loaded) return <div className="pictorial-loading story-loading" data-route-pending role="status"><PlaySymbol name="book"/><span>故事正在打开…</span></div>;
  const current=story.frames[frame];
  const activityTitle=content.activities.find(a=>a.id===current.activityId)?.title;
  const playHref=`#/play/${current.activityId}?story=${storyId}&step=${frame}&car=${activeCar()}`;
  return <div className="picture-story" data-frame={frame} data-story={storyId} data-save={saveState}>
   <TownHeading title={story.title} description={`第 ${frame+1} 幕 · ${current.title}`}/>
   <div className="picture-story-toolbar"><a className="picture-button" data-town-back href="#/explore" aria-label="回到探索"><ArrowLeft/></a><button className="picture-button" aria-label={listening?'停止朗读':'听这一幕'} aria-pressed={listening} onClick={()=>listening?stopNarration():void playNarration(current.audio,true)}>{listening?<Pause/>:<Volume2/>}</button><button className="picture-button" aria-label="从头听" onClick={()=>changeFrame(0,finished,true)}><RotateCcw/></button></div>
   <a className="story-activity-link" href={playHref} aria-label={`一起玩：${activityTitle}`}>
     <figure>
       <span className={`story-picture scene-${story.scene} frame-${frame}`}><StoryScene storyId={storyId} frame={frame} carId={activeCar()}/></span>
       <figcaption className="town-story-caption" data-turn={turnDirection.current}><p key={frame}>{current.text}</p><span className="story-invitation">一起玩：{activityTitle}<ArrowRight aria-hidden="true"/></span></figcaption>
     </figure>
   </a>
   <div className="story-progress" aria-label="故事进度">{story.frames.map((item,i)=><button key={i} className="story-dot" aria-label={`第 ${i+1} 幕：${item.title}`} aria-current={frame===i?'step':undefined} onClick={()=>{if(i!==frame)changeFrame(i);}}/>)}</div>
   <div className="activity-controls"><button className="picture-button" aria-label="上一幕" disabled={frame===0} onClick={()=>changeFrame(frame-1)}><ArrowLeft/></button>{frame<3?<button className="button story-turn-button" aria-label="跳过玩法，继续故事" onClick={()=>changeFrame(frame+1)}><ArrowRight/><span className="story-control-label">下一幕</span></button>:<button className="button story-turn-button" aria-label={finished&&saveState==='saved'?'故事的小脚印已记下':'故事看完啦'} aria-disabled={finished} onClick={()=>{if(!finished)changeFrame(frame,true);}}><Check/><span className="story-control-label">{finished?'已读完':'故事看完啦'}</span></button>}</div>
   {saveState==='failed'?<div className="activity-feedback pictorial-error"><span role="status">故事进度暂时没能保存。可以继续看，也可以重试。</span><button className="picture-button" aria-label="重试保存进度" onClick={()=>void persist(makeProgress(frame,finished))}><RotateCcw/></button></div>:<span className={finished&&frame===story.frames.length-1?'story-completion':'sr-only'} role="status">{saveState==='saving'?'正在记下这一幕…':finished?'这段故事已经记在这台设备。':''}</span>}
  </div>;
}
