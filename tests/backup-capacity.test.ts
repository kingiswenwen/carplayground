import 'fake-indexeddb/auto';
import {afterAll,beforeEach,expect,it} from 'vitest';
import {makeBackup,parseBackup,replaceBackup,clearLocalData,serializeBackup,MAX_BACKUP_BYTES,MAX_BACKUP_RECORDS,assertBackupFileSize,type Backup} from '../src/services/backup';
import {db,type Creation,type Observation} from '../src/services/storage';
const now='2026-11-06T00:00:00.000Z';
const creations=(count:number):Creation[]=>Array.from({length:count},(_,i)=>({id:`synthetic-art-${String(i).padStart(6,'0')}`,kind:'poster',carId:'CAR01',background:'#ffffff',caption:'合成作品',marks:[],createdAt:now,version:1}));
const observations=(count:number):Observation[]=>Array.from({length:count},(_,i)=>({id:`synthetic-note-${i}`,activityId:'M01',text:'合'.repeat(500),createdAt:now}));
it('过量raw集合只读取数组长度即拒绝，不访问档案或逐行字段getter',async()=>{
  const current=await makeBackup(),oldRecovery=await db.recovery.get('before-import');
  const oversized={...current,observations:new Array(MAX_BACKUP_RECORDS+1)} as Backup;
  const visited:string[]=[];
  Object.defineProperty(oversized,'profile',{get(){visited.push('profile');throw Error('must not validate profile');}});
  Object.defineProperty(oversized.observations,'0',{get(){visited.push('row');throw Error('must not visit rows');}});
  expect(()=>serializeBackup(oversized)).toThrow(/100000/);
  await expect(replaceBackup(oversized)).rejects.toThrow(/100000/);
  // JSON has no getters, but uses the identical preflight before row validation.
  expect(()=>parseBackup(JSON.stringify({observations:new Array(MAX_BACKUP_RECORDS+1).fill(null)}))).toThrow(/100000/);
  expect(visited).toEqual([]);
  expect(await db.recovery.get('before-import')).toEqual(oldRecovery);
  expect((await makeBackup()).profile).toEqual(current.profile);
});
beforeEach(()=>clearLocalData());
afterAll(()=>db.delete());

it('501幅合成作品完整导出、解析和恢复，不静默丢弃第501幅',async()=>{
  const rows=creations(501);await db.creations.bulkPut(rows);
  const backup=await makeBackup();
  expect(backup.creations).toEqual(rows);
  const parsed=parseBackup(JSON.stringify(backup,null,2));
  await replaceBackup(parsed);
  expect(await db.creations.toArray()).toEqual(rows);
});

it('超过10MiB的8000条中文观察可导出导入，并完整保存替换前501作品快照和反向恢复',async()=>{
  await db.observations.bulkPut(observations(8000));
  await db.profiles.put({id:'default',nickname:'合成大档案'});
  const exported=await makeBackup(),text=serializeBackup(exported);
  expect(new TextEncoder().encode(text).byteLength).toBeGreaterThan(10*1024*1024);
  const incoming=parseBackup(text);
  await clearLocalData();await db.creations.bulkPut(creations(501));
  await db.profiles.put({id:'default',nickname:'合成旧档案'});
  let beforeDownload='';
  await replaceBackup(incoming,current=>{beforeDownload=JSON.stringify(current,null,2);});
  expect(await db.observations.count()).toBe(8000);
  expect((await db.observations.get('synthetic-note-7999'))?.text).toBe('合'.repeat(500));
  const recovery=parseBackup((await db.recovery.get('before-import'))!.json);
  expect(recovery).toEqual(parseBackup(beforeDownload));
  expect(recovery.creations).toHaveLength(501);
  expect(recovery.profile.nickname).toBe('合成旧档案');
  await replaceBackup(recovery);
  expect(await db.creations.count()).toBe(501);
  expect(await db.observations.count()).toBe(0);
  expect((await db.profiles.get('default'))?.nickname).toBe('合成旧档案');
  expect(parseBackup((await db.recovery.get('before-import'))!.json).observations).toHaveLength(8000);
},30000);

it('统一64MiB真实UTF8边界，不能把中文的字符数当作字节数',()=>{
  expect(MAX_BACKUP_BYTES).toBe(64*1024*1024);
  expect(()=>assertBackupFileSize(MAX_BACKUP_BYTES)).not.toThrow();
  expect(()=>assertBackupFileSize(MAX_BACKUP_BYTES+1)).toThrow(/64 MiB/);
  for(const invalid of [-1,NaN,Infinity,1.5])expect(()=>assertBackupFileSize(invalid)).toThrow(/大小无效/);
  // Only one over-limit string at a time; never construct multiple 64MiB fixtures.
  expect(()=>parseBackup('合'.repeat(Math.floor(MAX_BACKUP_BYTES/3)+1))).toThrow(/64 MiB/);
});

it('统一总记录边界仍拒绝过量输入、重复编号及未知车型，本机和旧恢复副本不变',async()=>{
  const original=await makeBackup();original.profile.nickname='旧恢复点';
  await replaceBackup(original);
  const current=await makeBackup(),oldRecovery=await db.recovery.get('before-import');
  const over={...current,observations:Array.from({length:MAX_BACKUP_RECORDS+1},(_,i)=>({id:`n-${i}`,activityId:'M01' as const,text:'',createdAt:now}))};
  await expect(replaceBackup(over)).rejects.toThrow(/100000/);
  expect(()=>parseBackup(JSON.stringify(over))).toThrow(/100000/);
  const duplicate={...current,creations:[creations(1)[0],creations(1)[0]]};
  expect(()=>serializeBackup(duplicate)).toThrow(/格式不支持/);
  const invalid={...current,creations:[{...creations(1)[0],carId:'CAR999'}]};
  expect(()=>parseBackup(JSON.stringify(invalid))).toThrow(/格式不支持/);
  expect(await db.recovery.get('before-import')).toEqual(oldRecovery);
  expect((await makeBackup()).profile).toEqual(current.profile);
},30000);

it('总记录是跨表合计而非每表各100000，超过旧10000条的合法小记录仍可恢复',async()=>{
  const current=await makeBackup();
  current.observations=Array.from({length:10001},(_,i)=>({id:`n-${i}`,activityId:'M01',text:'',createdAt:now}));
  expect(parseBackup(serializeBackup(current)).observations).toHaveLength(10001);
  current.creations=creations(90000);
  await expect(replaceBackup(current)).rejects.toThrow(/100000/);
},30000);

it('本机总字节超限时导出和替换均安全中止，不调用下载、不改旧恢复点或删本机记录',async()=>{
  const incoming=await makeBackup();
  await db.recovery.put({id:'before-import',json:JSON.stringify(incoming),createdAt:now});
  const oldRecovery=await db.recovery.get('before-import');
  await db.observations.bulkPut(observations(44000));
  let called=false;
  await expect(makeBackup()).rejects.toThrow(/64 MiB.*不要清空/);
  await expect(replaceBackup(incoming,()=>{called=true;})).rejects.toThrow(/64 MiB/);
  expect(called).toBe(false);
  expect(await db.observations.count()).toBe(44000);
  expect((await db.observations.get('synthetic-note-43999'))?.text).toBe('合'.repeat(500));
  expect(await db.recovery.get('before-import')).toEqual(oldRecovery);
},30000);
