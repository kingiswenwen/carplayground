import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {Howler} from 'howler';
import type {HowlOptions} from 'howler';

const harness = vi.hoisted(() => ({clips: [] as {options: HowlOptions; stop: ReturnType<typeof vi.fn>; unload: ReturnType<typeof vi.fn>}[]}));
vi.mock('howler', () => ({
  Howler: {volume: vi.fn(), ctx: {resume: () => Promise.resolve()}},
  Howl: class {
    stop = vi.fn();
    unload = vi.fn();
    play = vi.fn();
    constructor(public options: HowlOptions) {harness.clips.push(this);}
  },
}));
import {audio} from '../src/services/audio';

beforeEach(() => {
  audio.stop();
  harness.clips.length = 0;
  vi.stubGlobal('document', {hidden: false});
  audio.setEnabled(true);
});
afterEach(() => {audio.stop(); vi.restoreAllMocks(); vi.unstubAllGlobals();});

it('音频上下文无法恢复时结束队列并显示可重试提示', async () => {
  vi.spyOn(Howler.ctx, 'resume').mockRejectedValueOnce(new Error('Suspended audio context'));
  await audio.play('wheel', 'door');
  expect(audio.getError()).toContain('点“重听”再试一次');
  expect(harness.clips).toHaveLength(1);
  expect(harness.clips[0].unload).toHaveBeenCalledOnce();
});

it('取消仍在加载的声音会结束播放队列，不依赖Howler稍后发出stop事件', async () => {
  let settled = false;
  const pending = audio.play('wheel', 'door').then(() => {settled = true;});
  const clip = harness.clips[0];
  audio.stop();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(settled).toBe(true);
  await pending;
  expect(clip.unload).toHaveBeenCalledOnce();
  expect(harness.clips).toHaveLength(1);
});

it('旧声音迟到的结束或错误不会影响新队列，也不会显示旧错误', async () => {
  const previous = audio.play('wheel', 'door');
  const old = harness.clips[0];
  const next = audio.play('seat');
  old.options.onloaderror?.(1, 'late failure');
  old.options.onend?.(1);
  await previous;
  expect(audio.getError()).toBe('');
  expect(harness.clips).toHaveLength(2);
  expect(harness.clips[1].unload).not.toHaveBeenCalled();
  harness.clips[1].options.onend?.(2);
  await next;
  expect(harness.clips[1].unload).toHaveBeenCalledOnce();
});
