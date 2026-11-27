import {newSessionId} from '../domain/session-id';
import type {StoryProgress} from './storage';

const prefix = 'carplayground-story-pending:';
const revisionKey = 'carplayground-story-reset';
const drafts = new Map<string, {progress: StoryProgress; revision: string}>();

function revision() {
  try {return localStorage.getItem(revisionKey) ?? '';}
  catch {return '';}
}

export function pendingStoryProgress(storyId: string, version: number, frames: number) {
  try {
    const value = sessionStorage.getItem(prefix + storyId);
    if (value && !drafts.has(storyId)) drafts.set(storyId, JSON.parse(value));
  } catch {}
  const draft = drafts.get(storyId);
  const progress = draft?.progress;
  if (draft?.revision !== revision() || progress?.storyId !== storyId || progress.version !== version
      || !Number.isInteger(progress.frame) || progress.frame < 0 || progress.frame >= frames
      || typeof progress.finished !== 'boolean' || !Number.isFinite(Date.parse(progress.updatedAt))) return;
  return progress;
}

// A browser refresh can recover a turn before its IndexedDB transaction finishes.
export function bufferStoryProgress(progress: StoryProgress) {
  const draft = {progress, revision: revision()};
  drafts.set(progress.storyId, draft);
  try {
    sessionStorage.setItem(prefix + progress.storyId, JSON.stringify(draft));
    return true;
  } catch {return false;}
}

export function releaseStoryProgress(progress: StoryProgress) {
  if (drafts.get(progress.storyId)?.progress !== progress) return;
  drafts.delete(progress.storyId);
  try {sessionStorage.removeItem(prefix + progress.storyId);}
  catch {}
}

// A successful parent replacement invalidates cached turns in other open tabs too.
export function clearPendingStoryProgress() {
  drafts.clear();
  try {localStorage.setItem(revisionKey, newSessionId());}
  catch {}
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index--) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
    }
  } catch {}
}
