import { SceneArt } from '../components/SceneArt';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { CircleHelp, RotateCcw, Volume2, ArrowLeft, ArrowRight, Check, Play, MousePointer2 } from 'lucide-react';
import { CarImage } from '../components/CarImage';
import { colors, colorNames, content, getActivity, type CoreActivityId, type Color, type Part } from '../domain/content';
import { colorOptions, createParking, parkedCount, parkingComplete, placeCar } from '../domain/parking';
import { audio } from '../services/audio';
import { newSessionId } from '../domain/session-id';
import { db, finishSession, safely, saveSessionResult, type SessionRecord, type SessionResult, type Settings } from '../services/storage';
const ParkingCanvas = lazy(() => import('../game/ParkingCanvas'));

function supportsWebGL() {
  try { const canvas = document.createElement('canvas'); const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return false; gl.getExtension('WEBGL_lose_context')?.loseContext(); return true;
  } catch { return false; }
}

export function Activity({ id, settings }: { id: CoreActivityId; settings: Settings }) {
  const activity = getActivity(id)!;
  const [initial] = useState<SessionRecord>(() => ({id: newSessionId(), activityId: id, activityVersion: activity.version, contentReleaseId: content.id,
    carIds: ['CAR01'], difficulty: settings.difficulty, locale: 'zh-CN', audioEnabled: settings.sound,
    startedAt: new Date().toISOString(), state: 'playing', hints: 0, durationMs: 0}));
  const sessionId = initial.id;
  const [completed, setCompleted] = useState(false);
  const completedRef = useRef(false);
  const [paused, setPaused] = useState(document.hidden);
  const pausedRef = useRef(document.hidden);
  const [target] = useState<Color>(() => colors[Math.floor(Math.random() * colors.length)]);
  const [part, setPart] = useState<Part>();
  const [message, setMessage] = useState('');
  const [hinted, setHinted] = useState(false);
  const [readyImages, setReadyImages] = useState<Record<string, boolean>>({});
  const hints = useRef(0);
  const elapsed = useRef(0);
  const lastActive = useRef(performance.now());
  const active = useRef(true);
  const startPromise = useRef<Promise<boolean>>(Promise.resolve(false));
  const result = useRef<SessionResult>(undefined), saving = useRef(false);
  const [recordStatus, setRecordStatus] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [parking, setParking] = useState(() => createParking(settings.difficulty === 'explore' ? 3 : 2, settings.difficulty === 'explore' ? 4 : 2));
  const parkingRef = useRef(parking); parkingRef.current = parking;
  const [selected, setSelected] = useState<string | null>(null);
  const [simple, setSimple] = useState(() => settings.simple || settings.difficulty === 'explore' || window.matchMedia('(max-width: 600px), (max-height: 600px)').matches || !supportsWebGL());
  const [fallbackReason, setFallbackReason] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 600px), (max-height: 600px)');
    const adapt = () => { if (query.matches) setSimple(true); };
    query.addEventListener('change', adapt);
    return () => query.removeEventListener('change', adapt);
  }, []);
  const [targetPart] = useState<Part>(() => settings.difficulty === 'gentle' ? 'wheel' : (['wheel', 'door', 'light'] as Part[])[Math.floor(Math.random() * 3)]);
  const partHints = { wheel: '看看圆圆的、能滚动的地方。', door: '看看坐进汽车前会打开的地方。', light: '看看车头能发光的地方。' };
  const hintMessage = id === 'E02' ? partHints[targetPart] : activity.hint;
  const options = (colorOptions(target, settings.difficulty === 'explore') as Color[]).sort((a, b) => colors.indexOf(a) - colors.indexOf(b));
  const colorsReady = options.every(color => readyImages[color]);
  const instruction = id === 'E01' ? `找找${colorNames[target]}的车。` : id === 'E02' ? `找找${content.car.hotspots.find(p => p.id === targetPart)?.zh}在哪里。` : activity.instruction;
  const replay = useCallback(() => {
    if (id === 'E01') void audio.play(`color-${target}`, target, ...(target === 'red' ? ['phrase-red'] : []));
    else if (id === 'E02') void audio.play(targetPart === 'wheel' ? 'parts-task' : `parts-task-${targetPart}`, targetPart, ...(targetPart === 'wheel' ? ['phrase-wheel'] : []));
    else void audio.play('parking-task', 'phrase-park');
  }, [id, target, targetPart]);
  useEffect(() => {
    active.current = true;
    let disposed = false;
    let started = false;
    // StrictMode discards its first setup synchronously. Never start a database
    // session for that discarded setup or let its cleanup end the live attempt.
    queueMicrotask(() => {
      if (disposed) return;
      started = true;
      startPromise.current = safely(async () => {await db.sessions.put(initial); return true;}, false);
    });
    const visibility = () => {
      audio.stop();
      if (document.hidden && !pausedRef.current) {
        elapsed.current += performance.now() - lastActive.current;
        pausedRef.current = true; setPaused(true);
      }
    };
    document.addEventListener('visibilitychange', visibility);
    replay();
    return () => {
      disposed = true; active.current = false; document.removeEventListener('visibilitychange', visibility); audio.stop();
      const duration = elapsed.current + (pausedRef.current ? 0 : performance.now() - lastActive.current);
      if (started && !completedRef.current) void startPromise.current.then(() => safely(() => finishSession(sessionId, 'exited', hints.current, duration), false));
    };
    // A new route/restart owns a new session; settings are frozen at entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);
  const retrySave = async () => {
    if (!active.current || pausedRef.current || !result.current || saving.current) return;
    saving.current = true; setRecordStatus('saving');
    const snapshot = result.current, started = await startPromise.current;
    const saved = await safely(() => saveSessionResult(snapshot, !started), false);
    saving.current = false;
    if (active.current) setRecordStatus(saved ? 'saved' : 'error');
  };
  const complete = (summary: string) => {
    if (!active.current || pausedRef.current || completedRef.current) return;
    completedRef.current = true; setCompleted(true);
    elapsed.current += performance.now() - lastActive.current;
    lastActive.current = performance.now();
    result.current = {...initial, state: 'completed', hints: hints.current, durationMs: elapsed.current, summary, endedAt: new Date().toISOString()};
    void retrySave();
  };
  const choosePart = (next: Part) => {
    if (pausedRef.current) return;
    setPart(next); void audio.play(`zh-${next}`, next);
    if (next === targetPart && !completedRef.current) { complete(`找到 ${targetPart}`); void audio.play(`zh-${next}`, next); }
  };
  const chooseColor = (next: Color) => {
    if (!active.current || pausedRef.current || completedRef.current) return;
    if (next === target) { complete(`目标 ${target}`); setMessage(`找到了，这是${colorNames[next]}！`); void audio.play(next, 'color-success'); }
    else { setMessage('再看看，也可以听一遍。'); void audio.play('color-retry'); }
  };
  const select = (car: string) => {
    if (active.current && !pausedRef.current && !completedRef.current && !parkingRef.current.slots.includes(car)) { setSelected(car); setMessage('选好了，点一个空车位吧。'); }
  };
  const place = (car: string, slot: number) => {
    if (!active.current || pausedRef.current || completedRef.current) return;
    const current = parkingRef.current;
    const next = placeCar(current, car, slot);
    if (next === current) { setMessage('这里已经有车了。'); void audio.play('parking-occupied'); return; }
    parkingRef.current = next; setParking(next); setSelected(null);
    const count = parkedCount(next);
    setMessage(`停好了 ${count} 辆小车。`);
    if (parkingComplete(next)) { complete(`${parking.cars.length} 辆车各占一个车位`); void audio.play(count === 3 ? 'three' : 'two', 'parking-success'); }
    else void audio.play(count === 2 ? 'two' : 'one');
  };
  const showHint = () => {
    if (!active.current || pausedRef.current || completedRef.current) return;
    hints.current++; setHinted(true); setMessage(hintMessage);
    const hintAudio = id === 'E02' && targetPart !== 'wheel' ? `parts-hint-${targetPart}` : activity.hintAudio;
    void audio.play(hintAudio, ...(id === 'E01' ? [target] : id === 'E02' ? [targetPart] : []));
  };
  return <>
    <div className="activity-top"><a className="text-button" href="#/cars/CAR01"><ArrowLeft size={20} />回去看车</a><a className="text-button scene-exit" href={`#/explore/${activity.scene}`}><ArrowLeft size={18}/>回到{activity.scene==='parking'?'停车小镇':'汽车展厅'}</a><button className="button subtle" onClick={replay} disabled={paused}><Volume2 size={20} />重听</button></div>
    <div className="activity-heading"><span className="capsule">{activity.title}</span><h1>{completed ? id === 'M01' ? '每辆车都有自己的位置了！' : '找到啦，真是个小发现！' : instruction}</h1>
      <p>{id === 'M01' ? '一辆小车，一个家。可以拖动，也可以点选。' : id === 'E01' ? '看一看，点一点你找到的颜色。' : '点点车上的圆点，也可以自由听听每个部件。'}</p></div>
    <section className={`play-surface ${id.toLowerCase()} ${hinted ? 'hinted' : ''} immersive-play`} data-activity={id}>
      {id !== 'E02' && <SceneArt scene={activity.scene} priority/>}
      {id === 'E02' && <><CarImage presentation="showcase" hotspots active={part || (hinted ? targetPart : undefined)} onPart={choosePart} />
        <div className="word-card"><span className="word-zh">{part ? content.car.hotspots.find(p => p.id === part)?.zh : '点一个部件按钮'}</span><strong>{part || 'Look & listen'}</strong>{part && <button className="round-button" aria-label={`重听 ${part}`} onClick={() => choosePart(part)}><Volume2 size={22} /></button>}</div></>}
      {id === 'E01' && <div className={`color-options count-${settings.difficulty === 'gentle' ? 2 : 3}`}>{options.map(color =>
        <div key={color} className={`color-option ${hinted && color === target ? 'suggested' : ''} ${completed && color === target ? 'correct' : ''}`}>
          <CarImage color={color} onReadyChange={ready => setReadyImages(current => ({ ...current, [color]: ready }))} /><span className={`color-dot ${color}`} /><span>{colorNames[color]}</span>{completed && color === target && <Check size={22} />}
          <button className="option-hit-area" aria-label={`${colorNames[color]}的车`} onClick={() => chooseColor(color)} disabled={paused || completed || !colorsReady} />
        </div>)}</div>}
      {id === 'M01' && <>
        <div className="parking-status"><span><i /> 停车小院</span><span>{parkedCount(parking)} / {parking.cars.length} 辆已停好</span></div>
        {simple || parking.cars.length !== 2 ? <div className="dom-parking"><div className="waiting-cars">{parking.cars.map((car, i) =>
          <div key={car} className={`waiting-car ${selected === car ? 'selected' : ''}`}>
            {parking.slots.includes(car) ? <span className="parked-tag"><Check />已停好</span> : <CarImage color={i === 2 ? 'red' : i ? 'blue' : 'white'} onReadyChange={ready => setReadyImages(current => ({ ...current, [car]: ready }))} />}
            <button className="option-hit-area" aria-label={`选择${i === 2 ? '红色' : i ? '蓝色' : '白色'}小车`} aria-pressed={selected === car} disabled={paused || parking.slots.includes(car) || !readyImages[car]} onClick={() => select(car)} />
          </div>)}</div>
          <div className="parking-divider" /><div className="parking-slots">{parking.slots.map((car, i) => <div key={i} className={`parking-slot ${car ? 'occupied' : ''}`}>
            {car && <CarImage color={car === 'car-0' ? 'white' : car === 'car-1' ? 'blue' : 'red'} />}<span>{i + 1}</span>
            <button className="option-hit-area" aria-label={`车位 ${i + 1}${car ? '，已占用' : '，空位'}`} disabled={paused} onClick={() => selected ? place(selected, i) : setMessage(car ? '这里已经有车了。' : '先点一辆小车吧。')} />
          </div>)}</div></div> :
          <Suspense fallback={<div className="canvas-parking"><span className="image-loading">停车场正在准备…</span></div>}><ParkingCanvas state={parking} selected={selected} paused={paused} select={select} place={place} fallback={() => { setSimple(true); setFallbackReason(true); }} /></Suspense>}
        <div className="parking-mode"><span>{fallbackReason ? '已为你换成轻松点选，玩法一样。' : simple ? '点一辆小车，再点一个空车位' : '拖动小车，或点车再点车位'}</span>{parking.cars.length === 2 && <button className="text-button" onClick={() => setSimple(value => !value)}><MousePointer2 size={16} />{simple ? '试试拖动模式' : '使用点选模式'}</button>}</div>
      </>}
      {paused && <div className="pause-overlay"><Play size={36} /><h2>休息一下，再出发</h2><button className="button primary" onClick={() => { pausedRef.current = false; lastActive.current = performance.now(); setPaused(false); }}>继续探索 <Play size={18} /></button></div>}
    </section>
    <div className="activity-feedback" role="status" aria-live="polite">{message || (completed ? '还想看看别的部分？可以继续点一点。' : '慢慢来，也可以随时回去看车。')}{' '}{recordStatus === 'saving' ? '正在保存本次探索记录…' : recordStatus === 'saved' ? '本次探索记录已保存在这台设备。' : recordStatus === 'error' ? '本次探索记录暂时没能保存，可以重试，也可以继续探索。' : ''}</div>
    {recordStatus === 'error' && <button className="button" disabled={paused} onClick={() => void retrySave()}>重试保存本次探索</button>}
    <div className="activity-controls">{completed ? <><button className="button primary" onClick={() => { window.dispatchEvent(new Event('restart-activity')); }}><RotateCcw size={20} />再玩一次</button><a className="button" href="#/cars/CAR01">回去看车 <ArrowRight size={20} /></a></> :
      <><button className="button" onClick={showHint} disabled={paused}><CircleHelp size={20} />需要帮忙</button>{id === 'M01' && <button className="text-button" onClick={() => window.dispatchEvent(new Event('restart-activity'))}><RotateCcw size={18} />重新摆放</button>}</>}</div>
    {id === 'M01' && completed && <p className="parent-extension">一起试试：拿两辆玩具车和两张纸，给它们也找个位置。</p>}
  </>;
}
