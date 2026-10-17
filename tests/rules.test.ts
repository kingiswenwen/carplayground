import 'fake-indexeddb/auto';
import { afterAll, describe, expect, it } from 'vitest';
import release from '../content/r3.json';
import { releaseSchema } from '../src/domain/content';
import { colorOptions, createParking, parkingComplete, parkedCount, placeCar } from '../src/domain/parking';
import { db, finishSession, type SessionRecord } from '../src/services/storage';

describe('一车一位的共享停车规则', () => {
  it('连点、已停车辆与占用车位均不改变现有占位', () => {
    const first = placeCar(createParking(), 'car-0', 0);
    expect(parkedCount(first)).toBe(1);
    expect(placeCar(first, 'car-0', 1)).toBe(first);
    expect(placeCar(first, 'car-1', 0)).toBe(first);
    expect(placeCar(first, 'car-0', 0)).toBe(first);
    expect(parkingComplete(first)).toBe(false);
    expect(parkingComplete(placeCar(first, 'car-1', 1))).toBe(true);
  });
  it('两种放置顺序和不同车位都满足唯一占位', () => {
    for (const firstCar of ['car-0', 'car-1']) for (const slot of [0, 1]) {
      const first = placeCar(createParking(), firstCar, slot);
      const next = placeCar(first, firstCar === 'car-0' ? 'car-1' : 'car-0', 1 - slot);
      expect(parkingComplete(next)).toBe(true);
      expect(new Set(next.slots).size).toBe(2);
    }
  });
  it('拒绝边界以外或未知车辆', () => {
    const state = createParking();
    for (const slot of [-1, 2, 0.5, NaN]) expect(placeCar(state, 'car-0', slot)).toBe(state);
    expect(placeCar(state, 'unknown', 0)).toBe(state);
  });
  it('有额外空位时以所有车已停为完成条件', () => {
    const state = { cars: ['car-0'], slots: [null, null] };
    expect(parkingComplete(placeCar(state, 'car-0', 1))).toBe(true);
  });
});
describe('颜色与内容发布', () => {
  it('每种目标在两个难度中均恰好出现一次', () => {
    for (const target of ['red', 'blue', 'white']) for (const expanded of [false, true]) {
      const options = colorOptions(target, expanded);
      expect(options.filter(o => o === target)).toHaveLength(1);
      expect(new Set(options).size).toBe(expanded ? 3 : 2);
    }
  });
  it('拒绝未审核、断链和重复素材', () => {
    const draft = structuredClone(release); draft.assets[0].status = 'draft';
    expect(releaseSchema.safeParse(draft).success).toBe(false);
    const broken = structuredClone(release); broken.car.images.white = 'missing';
    expect(releaseSchema.safeParse(broken).success).toBe(false);
    const duplicate = structuredClone(release); duplicate.assets.push(duplicate.assets[0]);
    expect(releaseSchema.safeParse(duplicate).success).toBe(false);
  });
});
describe('事务化会话结束', () => {
  const session: SessionRecord = { id: 'test-session', activityId: 'M01', activityVersion: 1, contentReleaseId: release.id,
    carIds: ['CAR01'], difficulty: 'gentle', locale: 'zh-CN', audioEnabled: false, startedAt: new Date().toISOString(), state: 'playing', hints: 0, durationMs: 0 };
  it('并发完成仅成功一次，清理不能将完成改为退出', async () => {
    await db.sessions.put(session);
    const results = await Promise.all([finishSession(session.id, 'completed', 1, 1000), finishSession(session.id, 'completed', 1, 1000)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await finishSession(session.id, 'exited', 1, 1200)).toBe(false);
    expect((await db.sessions.get(session.id))?.state).toBe('completed');
  });
  it('已退出会话的迟到完成和未知会话不更新数据', async () => {
    await db.sessions.put({ ...session, id: 'old-session' });
    await finishSession('old-session', 'exited', 0, 10);
    expect(await finishSession('old-session', 'completed', 0, 10)).toBe(false);
    expect(await finishSession('unknown', 'completed', 0, 10)).toBe(false);
  });
  afterAll(() => db.delete());
});
