import {useEffect, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, Volume2, RotateCcw, Check} from 'lucide-react';
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

  const consumeReturnStep = () => {
    // The return step is an entry instruction, not a permanent progress override.
    if (initialFrame !== undefined) history.replaceState(history.state, '', `${location.pathname}${location.search}#/stories/${storyId}`);
  };

  const writeProgress = async (nextFrame: number, nextFinished: boolean) => safely(async () => {
    await db.storyProgress.put({storyId, version: story.version, frame: nextFrame, finished: nextFinished, updatedAt: new Date().toISOString()});
    return true;
  }, false);

  useEffect(() => {
    const currentEpoch = ++epoch.current;
    setLoaded(false);
    saving.current = true;
    void (async () => {
      const saved = await safely(() => db.storyProgress.get(storyId), undefined);
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
    return () => {epoch.current++; audio.stop();};
  }, [storyId, initialFrame]);

  // Commit first: once a new chapter is visible, an immediate refresh can
  // restore it. Failed writes still allow reading, with an explicit retry.
  const changeFrame = async (nextFrame: number, nextFinished = false) => {
    if (saving.current) return;
    saving.current = true;
    const currentEpoch = epoch.current;
    audio.stop();
    setSaveState('saving');
    const persisted = await writeProgress(nextFrame, nextFinished);
    if (currentEpoch !== epoch.current) return;
    if (persisted) consumeReturnStep();
    setFrame(nextFrame);
    setFinished(nextFinished);
    setSaveState(persisted ? 'saved' : 'failed');
    saving.current = false;
  };

  useEffect(()=>{if(loaded)void audio.play(story.frames[frame].audio);},[loaded,frame,storyId]);
  if (!loaded) return <div className="pictorial-loading" role="status" aria-label="故事正在打开"><PlaySymbol name="book"/></div>;
  const current=story.frames[frame];
  return <div className="picture-story" data-frame={frame} data-story={storyId} data-save={saveState}>
   <div className="picture-story-toolbar"><a className="picture-button" href="#/explore" aria-label="回到探索"><ArrowLeft/></a><button className="picture-button" aria-label="听这一幕" onClick={()=>void audio.play(current.audio)}><Volume2/></button><button className="picture-button" aria-label="从头听" disabled={saveState==='saving'} onClick={()=>void changeFrame(0)}><RotateCcw/></button></div>
   <a className={`story-picture scene-${story.scene} frame-${frame}`} aria-label={`一起玩：${content.activities.find(a=>a.id===current.activityId)?.title}`} href={`#/play/${current.activityId}?story=${storyId}&step=${frame}&car=${activeCar()}`}><StoryScene storyId={storyId} frame={frame} carId={activeCar()}/></a>
   <div className="story-progress" aria-label="故事进度">{story.frames.map((item,i)=><button key={i} className="story-dot" aria-label={`第 ${i+1} 幕：${item.title}`} aria-current={frame===i?'step':undefined} disabled={saveState==='saving'} onClick={()=>void changeFrame(i)}/>)}</div>
   <div className="activity-controls"><button className="picture-button" aria-label="上一幕" disabled={frame===0||saveState==='saving'} onClick={()=>void changeFrame(frame-1)}><ArrowLeft/></button>{frame<3?<button className="picture-button" aria-label="跳过玩法，继续故事" disabled={saveState==='saving'} onClick={()=>void changeFrame(frame+1)}><ArrowRight/></button>:<button className="picture-button" aria-label={finished&&saveState==='saved'?'故事的小脚印已记下':'故事看完啦'} disabled={finished||saveState==='saving'} onClick={()=>void changeFrame(frame,true)}><Check/></button>}</div>
   {saveState==='failed'?<div className="activity-feedback pictorial-error"><span className="sr-only" role="status">故事进度暂时没能保存，仍可以继续看。可以再试一次记下小脚印。</span><button className="picture-button" aria-label="重试保存进度" onClick={()=>void changeFrame(frame,finished)}><RotateCcw/></button></div>:<span className="sr-only" role="status">{saveState==='saving'?'正在记下这一幕…':finished?'这段故事已经记在这台设备。':''}</span>}
   <span className="sr-only">{current.title}。{current.text}</span>
  </div>;
}
