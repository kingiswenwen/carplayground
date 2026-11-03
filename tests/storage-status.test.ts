import 'fake-indexeddb/auto';
import {afterAll, beforeEach, expect, it} from 'vitest';
import {db, safely, storageStatus} from '../src/services/storage';

beforeEach(async () => {storageStatus.reset();await db.storyProgress.clear();await db.settings.clear();});
afterAll(() => db.delete());
const story = {storyId:'ST01',version:1,frame:3,finished:true,updatedAt:'2026-11-02T01:00:00.000Z'};
const fail = async () => {throw new DOMException('Storage full','QuotaExceededError');};

it('unrelated reads cannot hide a failed story write; retrying that write clears the warning', async () => {
  expect(await safely(fail,false,'story:ST01')).toBe(false);
  await safely(() => db.settings.get('default'),undefined,'settings:read');
  expect(storageStatus.get()).toBe(true);
  await safely(() => db.storyProgress.put(story),undefined,'story:ST01');
  expect(await db.storyProgress.get('ST01')).toEqual(story);
  expect(storageStatus.get()).toBe(false);
});

it('recovering one write leaves another failed write visible', async () => {
  await safely(fail,false,'story:ST01');
  await safely(fail,false,'settings:write');
  await safely(() => db.storyProgress.put(story),undefined,'story:ST01');
  expect(storageStatus.get()).toBe(true);
  await safely(async () => {await db.settings.put({id:'default',sound:false,difficulty:'gentle',simple:false});return true;},false,'settings:write');
  expect(storageStatus.get()).toBe(false);
});

it('an unsuccessful mutation result does not count as recovered storage', async () => {
  await safely(fail,false,'session:missing');
  await safely(async () => false,false,'session:missing');
  expect(storageStatus.get()).toBe(true);
});

it('a stale failure cannot revive a warning after a newer successful retry', async () => {
  let reject!: (reason:Error) => void;
  const earlier=safely(() => new Promise<boolean>((_,no) => {reject=no;}),false,'story:ST01');
  await safely(() => db.storyProgress.put(story),undefined,'story:ST01');
  reject(Error('Late failure'));
  await earlier;
  expect(storageStatus.get()).toBe(false);
});

it('a stale success cannot hide a newer failed write', async () => {
  let resolve!: (value:boolean) => void;
  const earlier=safely(() => new Promise<boolean>(yes => {resolve=yes;}),false,'story:ST01');
  await safely(fail,false,'story:ST01');
  resolve(true);await earlier;
  expect(storageStatus.get()).toBe(true);
});

it('legacy unscoped failures remain visible until records are explicitly reset', async () => {
  await safely(fail,false);
  await safely(() => db.settings.get('default'),undefined,'settings:read');
  expect(storageStatus.get()).toBe(true);
  storageStatus.reset();
  expect(storageStatus.get()).toBe(false);
});
