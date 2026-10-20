import 'fake-indexeddb/auto';
import {afterAll, beforeEach, expect, it} from 'vitest';
import {db, finishSession, saveSessionResult, type SessionRecord, type SessionResult} from '../src/services/storage';
const initial: SessionRecord = {id: 'retry-attempt', activityId: 'C01', activityVersion: 1, contentReleaseId: 'test-release', carIds: ['CAR02'], difficulty: 'gentle', locale: 'zh-CN', audioEnabled: false, startedAt: '2026-10-21T01:00:00.000Z', state: 'playing', hints: 0, durationMs: 0};
const result: SessionResult = {...initial, state: 'participated', endedAt: '2026-10-21T01:00:03.000Z', hints: 2, durationMs: 2400, summary: '原来的表达'};
beforeEach(() => db.sessions.clear());
afterAll(() => db.delete());

it('初次建档失败可显式恢复原会话，但不重新创建已被清除的记录', async () => {
  expect(await saveSessionResult(result)).toBe(false);
  expect(await db.sessions.count()).toBe(0);
  expect(await saveSessionResult(result, true)).toBe(true);
  expect(await db.sessions.get(initial.id)).toEqual(result);
  await db.sessions.clear();
  expect(await saveSessionResult(result)).toBe(false);
  expect(await db.sessions.count()).toBe(0);
});

it('完成写入中断保留原记录，重试仍使用原结束时间、提示数和时长', async () => {
  await db.sessions.put(initial);
  const fail = () => {throw Error('quota failure');};
  db.sessions.hook('updating', fail);
  try {await expect(saveSessionResult(result)).rejects.toThrow('quota failure');}
  finally {db.sessions.hook('updating').unsubscribe(fail);}
  expect(await db.sessions.get(initial.id)).toEqual(initial);
  expect(await saveSessionResult(result)).toBe(true);
  expect(await db.sessions.get(initial.id)).toEqual(result);
});

it('并发重试与离开清理不能把完成改为退出，迟到完成也不能覆盖已有退出', async () => {
  await db.sessions.put(initial);
  expect(await Promise.all([saveSessionResult(result), saveSessionResult(result), finishSession(initial.id, 'exited', 99, 9999)])).toEqual([true, true, false]);
  expect(await db.sessions.get(initial.id)).toEqual(result);
  await db.sessions.clear();
  await db.sessions.put(initial);
  expect(await finishSession(initial.id, 'exited', 0, 1000)).toBe(true);
  const exited = await db.sessions.get(initial.id);
  expect(await saveSessionResult(result)).toBe(false);
  expect(await db.sessions.get(initial.id)).toEqual(exited);
});
