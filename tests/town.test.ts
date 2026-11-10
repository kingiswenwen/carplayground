import {describe,it,expect} from 'vitest';
import {content,activityIds,domains} from '../src/domain/content';
import {townPlaces,activityPlace,getTownPlace,activityHref,teachingActions} from '../src/domain/town';
import inventory from '../docs/TOWN_ACTIVITY_INVENTORY.json';

describe('汽车小镇的教学保留约束',()=>{
 it('六地点让26项教学活动各有一个归属，保留八领域和17/9记录边界',()=>{
  const ids=townPlaces.flatMap(place=>[...place.activities]);
  expect(ids).toHaveLength(26);expect(new Set(ids).size).toBe(26);
  expect([...ids].sort()).toEqual([...activityIds].sort());
  expect(new Set(content.activities.map(a=>a.domain))).toEqual(new Set(domains));
  expect(content.activities.filter(a=>a.mode==='closed')).toHaveLength(17);
  expect(content.activities.filter(a=>a.mode==='open')).toHaveLength(9);
  for(const row of inventory.activities){
   const current=content.activities.find(a=>a.id===row.id)!;
   expect(current.goal,row.id).toBe(row.goal);expect(current.mode,row.id).toBe(row.mode);
   expect(activityPlace(row.id).name,row.id).toBe(row.area);
   expect(teachingActions[current.id]).toBeTruthy();
  }
 });
 it('保留全部3条故事12幕的活动关联，包括雨后晴天准备的L01',()=>{
  for(const story of inventory.stories){const current=content.stories.find(s=>s.id===story.id)!;expect(current.frames.map(f=>f.activityId)).toEqual(story.frames.map(f=>f.activityId));}
  expect(getTownPlace('travel')?.id).toBe('park');
 });
 it('保留当前车型，受支持的车型进入相同活动；全部车型仍可选',()=>{
  expect(content.cars).toHaveLength(106);
  for(const a of content.activities)for(const carId of a.carIds)expect(activityHref(a.id,carId)).toBe(`#/play/${a.id}?car=${carId}`);
 });
});
