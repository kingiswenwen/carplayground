import 'fake-indexeddb/auto';
import Dexie, {type Transaction} from 'dexie';
import {afterAll, expect, it} from 'vitest';
import {makeBackup, parseBackup, replaceBackup, clearLocalData} from '../src/services/backup';
import {queueSessionResult, retryPendingResults, hasPendingResults} from '../src/services/pending-session-results';
import {content} from '../src/domain/content';
import {db, type SessionResult, type Profile} from '../src/services/storage';

it('替换前恢复副本必须对应清空前的数据，不能遗漏排队的并发写入', async () => {
  await db.profiles.put({id: 'default', nickname: '原档案'});
  const next = await makeBackup();
  next.profile.nickname = '导入档案';
  let queued = false;
  let concurrentWrite: Promise<unknown> = Promise.resolve();
  let beforeClear: Promise<string | undefined> = Promise.resolve(undefined);
  let exportedNickname: string | undefined;
  const reading = (profile: Profile) => {
    if (!queued) {
      queued = true;
      concurrentWrite = Dexie.ignoreTransaction(() => db.profiles.put({id: 'default', nickname: '并发修改'}));
    }
    return profile;
  };
  const recoveryCreating = (_key: unknown, _record: unknown, transaction: Transaction) => {
    beforeClear = transaction.table('profiles').get('default').then((profile: Profile | undefined) => profile?.nickname);
  };
  db.profiles.hook('reading', reading);
  db.recovery.hook('creating', recoveryCreating);
  try {
    const previous = await replaceBackup(next, snapshot => {exportedNickname = snapshot.profile.nickname;});
    await concurrentWrite;
    const actualBeforeClear = await beforeClear;
    const recovery = parseBackup((await db.recovery.get('before-import'))!.json);
    expect(previous.profile.nickname).toBe(actualBeforeClear);
    expect(exportedNickname).toBe(actualBeforeClear);
    expect(recovery.profile.nickname).toBe(actualBeforeClear);
  } finally {
    db.profiles.hook('reading').unsubscribe(reading);
    db.recovery.hook('creating').unsubscribe(recoveryCreating);
  }
});

it('准备替换前导出失败时不替换档案，也不覆盖原恢复副本', async () => {
  const before = await makeBackup();
  const recovery = await db.recovery.get('before-import');
  const next = structuredClone(before);
  next.profile.nickname = '不应导入';
  await expect(replaceBackup(next, () => {throw Error('导出失败');})).rejects.toThrow('导出失败');
  expect((await makeBackup()).profile).toEqual(before.profile);
  expect(await db.recovery.get('before-import')).toEqual(recovery);
});

it('三十辆车的收藏、会话与作品都能导出和恢复，未知车仍拒绝', async () => {
  await clearLocalData();
  const now=new Date().toISOString();
  await db.favorites.bulkPut(content.cars.map(car=>({carId:car.id,at:now})));
  await db.recent.bulkPut(content.cars.map(car=>({carId:car.id,at:now})));
  await db.sessions.put({id:'car30',activityId:'M01',activityVersion:1,contentReleaseId:content.id,carIds:['CAR30'],difficulty:'gentle',locale:'zh-CN',audioEnabled:false,startedAt:now,state:'completed',hints:0,durationMs:100,endedAt:now});
  await db.creations.put({id:'car30-art',kind:'poster',carId:'CAR30',background:'#e4edda',caption:'',marks:[],createdAt:now,version:1});
  const backup=await makeBackup();expect(backup.favorites).toHaveLength(30);expect(backup.recent).toHaveLength(30);
  await replaceBackup(parseBackup(JSON.stringify(backup)));
  expect((await makeBackup()).creations[0].carId).toBe('CAR30');
  const bad=structuredClone(backup);bad.favorites[0].carId='CAR99';expect(()=>parseBackup(JSON.stringify(bad))).toThrow();
});

it('导入前下载失败不会丢掉原待重试结果', async () => {
  await clearLocalData();const backup=await makeBackup(),now=new Date().toISOString();
  queueSessionResult({id:'pending-import',activityId:'M01',activityVersion:1,contentReleaseId:content.id,carIds:['CAR30'],difficulty:'gentle',locale:'zh-CN',audioEnabled:false,startedAt:now,state:'completed',hints:0,durationMs:100,endedAt:now},Promise.resolve(false));
  await expect(replaceBackup(backup,()=>{throw Error('download failed');})).rejects.toThrow('download failed');
  expect(hasPendingResults()).toBe(true);await retryPendingResults();expect((await db.sessions.get('pending-import'))?.state).toBe('completed');
});

it('家长清空记录时同时移除跨关卡待重试结果，不能在下一局复活', async () => {
  const now=new Date().toISOString();
  const result:SessionResult={id:'pending-clear',activityId:'M01',activityVersion:1,contentReleaseId:content.id,carIds:['CAR30'],difficulty:'gentle',locale:'zh-CN',audioEnabled:false,startedAt:now,state:'completed',hints:0,durationMs:100,endedAt:now};
  queueSessionResult(result,Promise.resolve(false));expect(hasPendingResults()).toBe(true);
  await clearLocalData();expect(hasPendingResults()).toBe(false);await retryPendingResults();expect(await db.sessions.count()).toBe(0);
});

afterAll(() => db.delete());
