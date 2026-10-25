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


it('先完整结束最后一个英文词，才启动中文完成反馈', async () => {
  const pending = audio.play('white', 'color-success');
  await Promise.resolve();
  expect(harness.clips).toHaveLength(1);
  expect(harness.clips[0].options.src).toEqual([expect.stringContaining('white')]);
  expect(harness.clips[0].stop).not.toHaveBeenCalled();
  harness.clips[0].options.onend?.(1);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(harness.clips).toHaveLength(2);
  expect(harness.clips[1].options.src).toEqual([expect.stringContaining('color-success')]);
  harness.clips[1].options.onend?.(2);
  await pending;
});

it('本地中文反馈可读出不同短句，关闭声音后不会被迟到错误重新播放', () => {
 const utterances:{text:string;onstart?:()=>void;onerror?:()=>void}[]=[];
 const synth={getVoices:()=>[{lang:'zh-CN',localService:true}],speak:vi.fn(u=>utterances.push(u)),cancel:vi.fn()};
 vi.stubGlobal('window',{speechSynthesis:synth});
 vi.stubGlobal('SpeechSynthesisUtterance',class {constructor(public text:string){}});
 audio.feedback('两辆小车都有自己的停车位了。',['parking-success']);
 expect(utterances[0].text).toBe('两辆小车都有自己的停车位了。');utterances[0].onstart?.();
 audio.feedback('换个空车位，小车也能停进去。',['phrase-park']);
 expect(utterances[1].text).not.toBe(utterances[0].text);
 audio.setEnabled(false);utterances[0].onerror?.();utterances[1].onerror?.();
 expect(synth.cancel).toHaveBeenCalledTimes(2);expect(harness.clips).toHaveLength(0);
});

it('不使用远程中文声音，缺少本地声音或语音出错时退回现有音频', async () => {
 let spoken:{onerror?:()=>void}|undefined;
 const synth={getVoices:()=>[{lang:'zh-CN',localService:false}],speak:vi.fn(u=>{spoken=u;}),cancel:vi.fn()};
 vi.stubGlobal('window',{speechSynthesis:synth});vi.stubGlobal('SpeechSynthesisUtterance',class {constructor(public text:string){}});
 audio.feedback('小车停稳啦。',['parking-success']);expect(synth.speak).not.toHaveBeenCalled();expect(harness.clips).toHaveLength(1);
 synth.getVoices=()=>[{lang:'zh-CN',localService:true}];
 audio.feedback('车身和车轮装好啦。',['phrase-go']);expect(synth.speak).toHaveBeenCalledOnce();spoken?.onerror?.();
 expect(harness.clips).toHaveLength(2);expect(harness.clips[1].options.src).toEqual([expect.stringContaining('phrase-go')]);
 harness.clips[1].options.onend?.(2);await Promise.resolve();
});
