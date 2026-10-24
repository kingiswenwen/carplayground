import {describe,it,expect} from 'vitest';
import {content,getActivity,type ActivityId} from '../src/domain/content';
import {nextInvitation} from '../src/domain/play-journey';

describe('open invitations after play',()=>{
 it('can visit all activities before returning home, without a cycle or dead link',()=>{
  const visited=new Set<string>();let id:ActivityId='H03';
  for(let guard=0;guard<=content.activities.length;guard++){
   expect(visited.has(id)).toBe(false);visited.add(id);
   const next=nextInvitation(id,'CAR01');
   if(next.href==='#/garage')break;
   const match=next.href.match(/^#\/play\/([^?]+)\?car=(CAR\d{2})$/)!;
   expect(match).not.toBeNull();const activity=getActivity(match[1])!;
   expect(activity.carIds).toContain(match[2]);id=activity.id;
  }
  expect([...visited].sort()).toEqual(content.activities.map(a=>a.id).sort());
 });
 it('preserves a compatible selected car and resolves an unsupported car safely',()=>{
  for(const activity of content.activities){
   const next=nextInvitation(activity.id,'CAR30');
   if(next.href!=='#/garage'){
    const [path,query]=next.href.split('?'),destination=getActivity(path.split('/')[2])!;
    const car=new URLSearchParams(query).get('car');
    expect(destination.carIds).toContain(car);
    if(destination.carIds.includes('CAR30'))expect(car).toBe('CAR30');
   }
  }
 });
});
