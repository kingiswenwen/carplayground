import {useEffect, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, BookOpen, Volume2, RotateCcw} from 'lucide-react';
import {SceneArt} from '../components/SceneArt';
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
    setFrame(nextFrame);
    setFinished(nextFinished);
    setSaveState(persisted ? 'saved' : 'failed');
    saving.current = false;
  };

  if (!loaded) return <p>故事正在打开…</p>;
  const current = story.frames[frame];
  return <>
    <div className="activity-top">
      <a className="text-button" href="#/explore"><ArrowLeft size={20}/>回到探索</a>
      <span className="eyebrow">{story.title} · 第 {frame + 1} / 4 幕</span>
      <button className="button subtle" onClick={() => void audio.play(current.audio)}><Volume2 size={20}/>听这一幕</button>
    </div>
    <div className="story-reader">
      <div className={`story-picture scene-${story.scene} frame-${frame}`}>
        <SceneArt scene={story.scene} imageId={story.scene==='showroom'?'showcase-CAR01':`story-${story.scene}`} priority/>
        <span className="story-chapter">{String(frame + 1).padStart(2, '0')}</span>
      </div>
      <div className="story-copy">
        <span className="capsule"><BookOpen size={15}/>{story.title}</span>
        <h1>{current.title}</h1><p>{current.text}</p>
        <a className="button primary" href={`#/play/${current.activityId}?story=${storyId}&step=${frame}&car=CAR01`}>
          一起玩：{content.activities.find(a => a.id === current.activityId)?.title}<ArrowRight size={18}/>
        </a>
        <small>玩法是邀请，随时可以跳过、继续听故事。</small>
      </div>
    </div>
    <div className="story-progress" aria-label="故事进度">
      {story.frames.map((item, i) => <button key={i} aria-label={`第 ${i + 1} 幕：${item.title}`} aria-current={frame === i ? 'step' : undefined} disabled={saveState === 'saving'} onClick={() => void changeFrame(i)}>{i + 1}</button>)}
    </div>
    <div className="activity-controls">
      <button className="button" disabled={frame === 0 || saveState === 'saving'} onClick={() => void changeFrame(frame - 1)}><ArrowLeft size={18}/>上一幕</button>
      {frame < 3 ? <button className="button primary" disabled={saveState === 'saving'} onClick={() => void changeFrame(frame + 1)}>跳过玩法，继续故事 <ArrowRight size={18}/></button>
        : <button className="button primary" disabled={finished || saveState === 'saving'} onClick={() => void changeFrame(frame, true)}>
          {finished && saveState === 'saved' ? '故事的小脚印已记下' : finished && saveState === 'saving' ? '正在记下小脚印…' : '故事看完啦'}
        </button>}
      <button className="text-button" disabled={saveState === 'saving'} onClick={() => void changeFrame(0)}><RotateCcw size={18}/>从头听</button>
    </div>
    {saveState === 'saving' && !finished && <p className="activity-feedback" role="status">正在记下这一幕…</p>}
    {saveState === 'failed' ? <div className="activity-feedback">
      <p role="status">故事进度暂时没能保存，仍可以继续看。可以再试一次记下小脚印。</p>
      <button className="button" onClick={() => void changeFrame(frame, finished)}>重试保存进度</button>
    </div> : finished && <p className="activity-feedback" role="status">
      {saveState === 'saved' ? '这段故事已经记在这台设备。还可以和家人讲讲你最喜欢的一幕。' : '故事看完啦，正在记下这次小脚印。'}
    </p>}
  </>;
}
