import {describe,it,expect} from 'vitest';
import {advanceMotion,motionResistance,type MotionState} from '../src/domain/motion';
import {assemblyParts,placeAssemblyPart} from '../src/domain/assembly';
function roll(speed:number,resistance:number,dt:number,braking=false){let state:MotionState={distance:0,speed};for(let i=0;i<10000&&state.speed>0;i++)state=advanceMotion(state,dt,resistance,braking);return state;}
describe('可观察的平地运动模型',()=>{
 it('同路面、同模型，较大初始推动得到更远的滑行；没有倒退',()=>{const gentle=roll(18,motionResistance.smooth,.016);const strong=roll(28,motionResistance.smooth,.016);expect(strong.distance).toBeGreaterThan(gentle.distance);expect(gentle.distance).toBeCloseTo(18*18/11,8);expect(strong.speed).toBe(0);});
 it('改变阻力与制动会缩短停止距离，制动仍有真实的减速过程',()=>{const smooth=roll(28,motionResistance.smooth,.016);expect(roll(28,motionResistance.rough,.016).distance).toBeLessThan(smooth.distance);const firstBrake=advanceMotion({distance:0,speed:28},.016,motionResistance.smooth,true);expect(firstBrake.speed).toBeGreaterThan(0);expect(firstBrake.speed).toBeLessThan(28);expect(roll(28,motionResistance.smooth,.016,true).distance).toBeLessThan(smooth.distance);});
 it('不同帧率的停止位置一致；停下后、无效时间不漂移',()=>{expect(roll(28,5.5,1/30).distance).toBeCloseTo(roll(28,5.5,1/120).distance,8);const stopped={distance:20,speed:0};expect(advanceMotion(stopped,5,5.5)).toBe(stopped);expect(advanceMotion(stopped,NaN,5.5)).toBe(stopped);});
});
describe('真实照片区域拼装',()=>{
 it('四块部件只接受对应轮廓，错放与重复不计数',()=>{const start:readonly string[]=[];expect(placeAssemblyPart(start,'front-wheel','door')).toBe(start);let placed:readonly string[]=start;for(const part of assemblyParts)placed=placeAssemblyPart(placed,part.id,part.id);expect(placed).toHaveLength(4);expect(placeAssemblyPart(placed,'door','door')).toBe(placed);expect(placeAssemblyPart(start,'fake-engine','fake-engine')).toBe(start);});
});
