import {useEffect, useRef, useState} from 'react';
import {content, type ActivityDefinition} from '../domain/content';
import {newSessionId} from '../domain/session-id';
import {nextCompletionFeedback,type PlayFeedback} from '../domain/play-feedback';
import {audio} from '../services/audio';
import {db, finishSession, safely, type SessionRecord, type SessionResult, type Settings} from '../services/storage';

import {hasPendingResults, queueSessionResult, retryPendingResults} from '../services/pending-session-results';

export function useLearningSession(activity: ActivityDefinition, settings: Settings, carId: string, autoInstruction = true) {
  const [initial] = useState<SessionRecord>(() => ({id: newSessionId(), activityId: activity.id, activityVersion: activity.version,
    contentReleaseId: content.id, carIds: [carId], difficulty: settings.difficulty, locale: 'zh-CN', audioEnabled: settings.sound,
    startedAt: new Date().toISOString(), state: 'playing', hints: 0, durationMs: 0}));
  const id = initial.id;
  const [done, setDone] = useState(false);
  const [paused, setPaused] = useState(document.hidden);
  const [message, setMessage] = useState('');
  const [completion,setCompletion]=useState<PlayFeedback|null>(null);
  const [recordStatus, setRecordStatus] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const ended = useRef(false), alive = useRef(true), hints = useRef(0), isPaused = useRef(document.hidden);
  const elapsed = useRef(0), last = useRef(performance.now()), start = useRef<Promise<boolean>>(Promise.resolve(false));
  const result = useRef<SessionResult>(undefined), saving = useRef(false);
  const replay = () => {if (!isPaused.current) void audio.play(activity.instructionAudio);};

  useEffect(() => {
    let cancelled = false, started = false;
    alive.current = true;
    queueMicrotask(() => {
      if (cancelled) return;
      started = true;
      start.current = safely(async () => {await db.sessions.put(initial); return true;}, false);
      if (hasPendingResults()) void retrySave();
    });
    const hide = () => {
      if (document.hidden && !isPaused.current) {
        elapsed.current += performance.now() - last.current;
        isPaused.current = true; setPaused(true); audio.stop();
      }
    };
    document.addEventListener('visibilitychange', hide);
    if (autoInstruction) replay();
    return () => {
      cancelled = true; alive.current = false;
      document.removeEventListener('visibilitychange', hide); audio.stop();
      const duration = elapsed.current + (isPaused.current ? 0 : performance.now() - last.current);
      // A queued completion owns its terminal state. Leaving must not turn a
      // failed completion into a misleading exit record.
      if (started && !ended.current) void start.current.then(() => safely(() => finishSession(id, 'exited', hints.current, duration), false));
    };
    // Entry metadata belongs to this immutable attempt, including StrictMode setup.
  }, [id]);

  const retrySave = async () => {
    if (!alive.current || isPaused.current || !hasPendingResults() || saving.current) return;
    saving.current = true;
    setRecordStatus('saving');
    const saved = await retryPendingResults();
    saving.current = false;
    if (alive.current) setRecordStatus(saved ? (ended.current ? 'saved' : 'idle') : 'error');
  };
  const finish = (summary: string, sounds?: string[]) => {
    if (!alive.current || ended.current || isPaused.current) return;
    ended.current = true; setDone(true);
    result.current = {...initial, state: activity.mode === 'open' ? 'participated' : 'completed', hints: hints.current,
      durationMs: elapsed.current + performance.now() - last.current, summary, endedAt: new Date().toISOString()};
    queueSessionResult(result.current, start.current);
    void retrySave();
    const feedback=nextCompletionFeedback(activity.id);
    const contextual=sounds?.filter(id=>id!=='expression-done'&&id!=='discovery-done');
    if(contextual?.length){feedback.sounds=contextual;feedback.preferClips=true;}
    setCompletion(feedback);setMessage(feedback.text);
    audio.feedback(feedback.text,feedback.sounds,feedback.preferClips);
  };
  const hint = () => {if (!alive.current || isPaused.current) return; hints.current++; setMessage(activity.hint); void audio.play(activity.hintAudio);};
  const resume = () => {last.current = performance.now(); isPaused.current = false; setPaused(false);};
  const observe = async (text: string): Promise<boolean> => {
    if (!alive.current || isPaused.current) return false;
    if (!text.trim()) return true;
    return safely(async () => {
      await db.observations.put({id, activityId: activity.id, text: text.trim().slice(0, 500), createdAt: new Date().toISOString()});
      return true;
    }, false);
  };
  return {id, done, paused, message, setMessage, completion, replay, finish, hint, resume, observe, recordStatus, retrySave};
}
