import {safely, saveSessionResult, type SessionResult} from './storage';

// Retain failed completions across in-app journeys. A full reload still depends
// on successful browser storage; this queue never claims a failed write saved.
const pending = new Map<string, {result: SessionResult; started: Promise<boolean>}>();
let tail: Promise<unknown> = Promise.resolve();
export const hasPendingResults = () => pending.size > 0;
export function queueSessionResult(result: SessionResult, started: Promise<boolean>) {
  pending.set(result.id, {result, started});
}
export function retryPendingResults(): Promise<boolean> {
  const run = async () => {
    for (const [id, item] of pending) {
      const started = await item.started;
      if (await safely(() => saveSessionResult(item.result, !started), false)) pending.delete(id);
    }
    return pending.size === 0;
  };
  const next = tail.then(run, run);
  tail = next;
  return next;
}

// Serialize explicit parent replacement/clear with in-flight retries. Failed
// operations leave the queue available; successful ones cannot resurrect it.
export function resetPendingResultsAfter<T>(work: () => Promise<T>): Promise<T> {
  const run = async () => {const value = await work(); pending.clear(); return value;};
  const next = tail.then(run, run);
  tail = next.catch(() => undefined);
  return next;
}
