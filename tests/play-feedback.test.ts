import {describe,expect,it} from 'vitest';
import {activityIds,content} from '../src/domain/content';
import {completionFeedback,playFeedback} from '../src/domain/play-feedback';

describe('contextual play feedback',()=>{
 it('every activity has three distinct invitations backed by existing audio, without generic thank-you clips',()=>{
  for(const id of activityIds){
   const r=playFeedback[id];expect(new Set(r.texts).size,id).toBe(3);
   for(let n=0;n<3;n++){
    const feedback=completionFeedback(id,n);expect(feedback.text).not.toMatch(/谢谢你分享|掌握了|真聪明/);
    for(const sound of feedback.sounds){expect(['expression-done','discovery-done','assembly-done']).not.toContain(sound);expect(content.speech[sound],`${id}/${sound}`).toBeDefined();expect(content.assets.find(a=>a.id===sound)?.kind).toBe('audio');}
   }
  }
 });
 it('repeat play changes the invitation, and different activities describe different actions',()=>{
  expect(completionFeedback('C03',0).text).not.toBe(completionFeedback('C03',1).text);
  expect(completionFeedback('H03',0).text).toContain('洗');expect(completionFeedback('P01',0).text).toContain('推');
  expect(completionFeedback('T04',0).text).toContain('装');expect(completionFeedback('M01',0).text).toContain('停车位');
 });
 it('a contextual audio override cannot mutate the next session recipe',()=>{
  const feedback=completionFeedback('H01',0);feedback.sounds.push('place-museum');
  expect(completionFeedback('H01',0).sounds).not.toContain('place-museum');
 });
});
