import 'fake-indexeddb/auto';
import Dexie, {type Transaction} from 'dexie';
import {afterAll, expect, it} from 'vitest';
import {makeBackup, parseBackup, replaceBackup} from '../src/services/backup';
import {db, type Profile} from '../src/services/storage';

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

afterAll(() => db.delete());
