import {describe,it,expect} from 'vitest';
import {WashState} from '../src/domain/wash-state';
const points=Array.from({length:48},(_,id)=>({id,x:(id%12)*80+20,y:Math.floor(id/12)*100+30,rx:20,ry:15}));
describe('一个车身拥有唯一污点集合，投影不拥有进度',()=>{
  it('清同一污点幂等，未知身份不增加进度，布局重建不改分母或完成',()=>{
    const state=new WashState(points);state.clean([0,1,2]);const coverage=state.coverage,revision=state.revision;
    for(let i=0;i<10;i++){state.clean([0,1,999]);state.setLayout(points.map(p=>({x:p.x/1000,y:.8,z:p.y/450})));}
    expect(state.coverage).toBe(coverage);expect(state.revision).toBe(revision);expect(state.patches).toHaveLength(48);
    const layout=state.layout;state.setLayout(points.map(()=>({x:0,y:0,z:0})));expect(state.layout).toBe(layout);
    expect(state.coverage).toBeLessThan(.91);
  });
  it('连续真实擦洗仅清路径范围内污点，反复同区与切引擎不能刷到完成',()=>{
    const state=new WashState(points);expect(state.wipe({x:0,y:30},{x:200,y:30},30)).toBe(true);
    expect(state.patches.filter(p=>p.clean).map(p=>p.id)).toEqual([0,1,2]);
    expect(state.wipe({x:0,y:30},{x:200,y:30},30)).toBe(false);
    expect(state.wipe({x:-100,y:-100},{x:-90,y:-90},10)).toBe(false);
    expect(state.coverage).toBe(3/48);
  });
  it('小擦洗不自动洗净，超过91%才满足原阈值；下一辆独立且不继承布局',()=>{
    const first=new WashState(points);first.clean(points.slice(0,43).map(p=>p.id));expect(first.coverage>.91).toBe(false);
    first.clean([43]);expect(first.coverage>.91).toBe(true);
    const next=new WashState(points);expect(next.coverage).toBe(0);expect(next.layout).toBeNull();expect(next.revision).toBe(0);
  });
});
