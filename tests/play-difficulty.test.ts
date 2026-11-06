import {describe,it,expect} from 'vitest';
import {content} from '../src/domain/content';
import {inside} from '../src/domain/direct-play';
import {hitPart,partRegions} from '../src/domain/play-guidance';
import {hitDifficultyPart,playDifficulty,withinPartRange} from '../src/domain/play-difficulty';

describe('保守操作辅助分级（不改变概念规则）',()=>{
  it('默认保留旧参数，探索档仅稍收紧额外辅助',()=>{
    expect(playDifficulty()).toEqual({placementScale:1,partScale:1,washScale:1});
    const explore=playDifficulty('explore');
    expect(explore.partScale).toBe(1);
    expect(30*explore.placementScale).toBe(12);
    expect(18*explore.placementScale).toBeCloseTo(7.2);
    expect(100*explore.washScale).toBe(85);
    expect(130*explore.washScale).toBe(110.5);
    expect(1.65*explore.washScale).toBeCloseTo(1.4025);
    const target={x:500,y:400,w:300,h:150},edge={x:500,y:495};
    expect(inside(edge,target,30*playDifficulty().placementScale)).toBe(true);
    expect(inside(edge,target,30*explore.placementScale)).toBe(false);
    expect(inside(target,target,30*explore.placementScale)).toBe(true);
  });
  it('各车真实部件中心两档均可命中，gentle与原热点结果一致，空地仍不算部件',()=>{
    const rect={x:500,y:340,w:900,h:405};
    for(const car of content.cars){
      for(const p of partRegions(car,rect)){
        expect(hitDifficultyPart(car,rect,p,'gentle')).toBe(hitPart(car,rect,p));
        expect(hitDifficultyPart(car,rect,p,'explore')).toBe(p.id);
        const edge={x:p.x+p.rx*.95,y:p.y};
        for(const mode of ['gentle','explore'] as const)expect(hitDifficultyPart(car,rect,edge,mode)).toBe(hitPart(car,rect,edge));
      }
      for(const mode of ['gentle','explore'] as const)expect(hitDifficultyPart(car,rect,{x:30,y:40},mode)).toBeUndefined();
    }
  });
  it('两档部件几何备用区域均保留原大热点和开区间边界',()=>{
    expect(withinPartRange(.325,.22,.43,1)).toBe(true);
    expect(withinPartRange(.225,.22,.43,1)).toBe(true);
    for(const mode of ['gentle','explore'] as const){
      expect(withinPartRange(.225,.22,.43,playDifficulty(mode).partScale)).toBe(true);
      expect(withinPartRange(.325,.22,.43,playDifficulty(mode).partScale)).toBe(true);
    }
    expect(withinPartRange(.22,.22,.43,1)).toBe(false);
  });
});
