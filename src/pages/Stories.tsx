import {useEffect, useState} from 'react';
import {ArrowLeft, ArrowRight, BookOpen, Volume2, RotateCcw} from 'lucide-react';
import {SceneArt} from '../components/SceneArt';
import {CarImage} from '../components/CarImage';
import {content} from '../domain/content';
import {audio} from '../services/audio';
import {db, safely} from '../services/storage';

type SaveResult = {frame: number; finished: boolean; attempt: number; status: 'saved' | 'failed'};

export function Story({storyId, initialFrame}: {storyId: string; initialFrame?: number}) {
  const story = content.stories.find(s => s.id === storyId)!;
  const [frame, setFrame] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [finished, setFinished] = useState(false);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const [saveResult, setSaveResult] = useState<SaveResult>();
  const saveState = saveResult?.frame === frame && saveResult.finished === finished && saveResult.attempt === saveAttempt
    ? saveResult.status : 'saving';

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setSaveResult(undefined);
    void safely(() => db.storyProgress.get(storyId), undefined).then(saved => {
      if (cancelled) return;
      setFrame(initialFrame ?? saved?.frame ?? 0);
      setFinished(initialFrame !== undefined ? false : saved?.finished ?? false);
      setLoaded(true);
    });
    return () => {cancelled = true; audio.stop();};
  }, [storyId, initialFrame]);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    void safely(async () => {
      await db.storyProgress.put({storyId, version: story.version, frame, finished, updatedAt: new Date().toISOString()});
      return true;
    }, false).then(saved => {
      // A completed write for an earlier frame must not approve the current one.
      if (!cancelled) setSaveResult({frame, finished, attempt: saveAttempt, status: saved ? 'saved' : 'failed'});
    });
    return () => {cancelled = true; audio.stop();};
  }, [frame, loaded, finished, storyId, story.version, saveAttempt]);

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
        <SceneArt scene={story.scene}/><CarImage/>
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
      {story.frames.map((item, i) => <button key={i} aria-label={`第 ${i + 1} 幕：${item.title}`} aria-current={frame === i ? 'step' : undefined} onClick={() => setFrame(i)}>{i + 1}</button>)}
    </div>
    <div className="activity-controls">
      <button className="button" disabled={frame === 0} onClick={() => setFrame(frame - 1)}><ArrowLeft size={18}/>上一幕</button>
      {frame < 3 ? <button className="button primary" onClick={() => setFrame(frame + 1)}>跳过玩法，继续故事 <ArrowRight size={18}/></button>
        : <button className="button primary" disabled={finished} onClick={() => setFinished(true)}>
          {finished && saveState === 'saved' ? '故事的小脚印已记下' : finished && saveState === 'saving' ? '正在记下小脚印…' : '故事看完啦'}
        </button>}
      <button className="text-button" onClick={() => {setFrame(0); setFinished(false);}}><RotateCcw size={18}/>从头听</button>
    </div>
    {saveState === 'failed' ? <div className="activity-feedback">
      <p role="status">故事进度暂时没能保存，仍可以继续看。可以再试一次记下小脚印。</p>
      <button className="button" onClick={() => setSaveAttempt(attempt => attempt + 1)}>重试保存进度</button>
    </div> : finished && <p className="activity-feedback" role="status">
      {saveState === 'saved' ? '这段故事已经记在这台设备。还可以和家人讲讲你最喜欢的一幕。' : '故事看完啦，正在记下这次小脚印。'}
    </p>}
  </>;
}
