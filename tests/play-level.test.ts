import 'fake-indexeddb/auto';
import {afterAll,beforeEach,describe,expect,it} from 'vitest';
import {normalizeContentLevel,playLevel,stageGoal,starterCompletion,starterInstruction} from '../src/domain/play-level';
import {playDifficulty} from '../src/domain/play-difficulty';
import {content} from '../src/domain/content';
import {db,defaultSettings,type SessionRecord} from '../src/services/storage';
import {clearLocalData,makeBackup,parseBackup,replaceBackup,serializeBackup} from '../src/services/backup';

beforeEach(()=>clearLocalData());
afterAll(()=>db.delete());
describe('核心内容阶段与操作辅助独立',()=>{
  it('缺省discover保持旧三色、三部件、两车，显式starter是真实少量任务',()=>{
    expect(normalizeContentLevel()).toBe('discover');
    expect(defaultSettings.contentLevel).toBe('discover');
    expect(playLevel()).toEqual({colors:['red','blue','white'],parts:['wheel','light','door'],parkingCars:2});
    expect(playLevel('starter')).toEqual({colors:['red','blue'],parts:['wheel'],parkingCars:1});
    for(const mode of ['gentle','explore'] as const)expect(playDifficulty(mode).partScale).toBe(1);
  });
  it('仅四项活动有内容梯度；说明、完成与初始语音不声称更多目标已完成',()=>{
    const scoped=['E01','E02','T01','M01'];
    for(const activity of content.activities){
      expect(Boolean(stageGoal(activity.id,'starter'))).toBe(scoped.includes(activity.id));
      expect(Boolean(starterCompletion(activity.id,'starter'))).toBe(scoped.includes(activity.id));
      expect(starterCompletion(activity.id,'discover')).toBeUndefined();
    }
    expect(starterCompletion('E01','starter')).toContain('两种');
    expect(starterCompletion('M01','starter')).toContain('一辆');
    expect(starterCompletion('E02','starter')).not.toMatch(/车门|车灯|三个/);
    expect(starterInstruction('M01','starter')).toBe('phrase-park');
  });
  it('旧设置/记录没有阶段仍可备份恢复，并按discover解释；新字段完整往返',async()=>{
    const {contentLevel:_,...legacy}=defaultSettings;
    await db.settings.put(legacy);
    const record:SessionRecord={id:'synthetic-level-session',activityId:'E01',activityVersion:1,contentReleaseId:content.id,carIds:['CAR01'],difficulty:'gentle',locale:'zh-CN',audioEnabled:false,startedAt:new Date().toISOString(),state:'playing',hints:0,durationMs:0};
    await db.sessions.put(record);
    const old=parseBackup(serializeBackup(await makeBackup()));
    expect(old.settings.contentLevel).toBeUndefined();expect(old.sessions[0].contentLevel).toBeUndefined();
    expect(playLevel(old.settings.contentLevel)).toEqual(playLevel('discover'));
    await db.settings.put({...legacy,contentLevel:'starter'});
    await db.sessions.put({...record,contentLevel:'starter',state:'completed',summary:'红、蓝两色实际配对',endedAt:new Date().toISOString()});
    const current=parseBackup(serializeBackup(await makeBackup()));
    expect(current.settings.contentLevel).toBe('starter');expect(current.sessions[0].contentLevel).toBe('starter');
    await clearLocalData();await replaceBackup(current);
    expect((await db.settings.get('default'))?.contentLevel).toBe('starter');
    expect((await db.sessions.get(record.id))?.contentLevel).toBe('starter');
    expect(()=>parseBackup(JSON.stringify({...current,settings:{...current.settings,contentLevel:'unknown'}}))).toThrow();
    expect(()=>parseBackup(JSON.stringify({...current,sessions:[{...current.sessions[0],contentLevel:'unknown'}]}))).toThrow();
  });
});
