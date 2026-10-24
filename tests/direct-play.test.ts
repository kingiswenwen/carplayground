import {describe,it,expect} from 'vitest';
import {coast,flickVelocity,snapTarget,sampledSegment} from '../src/domain/direct-play';
import {content} from '../src/domain/content';

describe('直接操作的有效结果',()=>{
 it('松手采用最近的手势速度；停住后松开不会凭旧动作启动',()=>{
  const samples=[{x:50,y:100,t:0},{x:100,y:100,t:100},{x:170,y:100,t:170}];
  expect(flickVelocity(samples,180).x).toBeCloseTo(1000,6);
  expect(flickVelocity(samples,400)).toEqual({x:0,y:0});
  expect(flickVelocity([{x:20,y:20,t:10}],10)).toEqual({x:0,y:0});
 });
 it('惯性保留松手后的位移，逐渐减速并在场地边界停下',()=>{
  const first=coast(300,500,.02,200);
  expect(first.x).toBeGreaterThan(300);expect(first.velocity).toBeLessThan(500);expect(first.velocity).toBeGreaterThan(0);
  expect(coast(865,800,.03,200)).toEqual({x:870,velocity:0});
  expect(coast(400,0,.03,200)).toEqual({x:400,velocity:0});
 });
 it('同样一推在粗糙路面停得更近，左推不会向右漂移',()=>{
  const run=(resistance:number)=>{let x=400,v=-200;for(let i=0;i<1000&&v;i++){const next=coast(x,v,.01,resistance,0,1000);x=next.x;v=next.velocity;}return x;};
  expect(run(450)).toBeGreaterThan(run(160));expect(run(160)).toBeLessThan(400);
 });
 it('占用的车位不能靠吸附覆盖，远离目标也不会自动完成',()=>{
  const slots=[{x:200,y:200,w:140,h:80,occupied:true},{x:600,y:200,w:140,h:80}];
  expect(snapTarget({x:200,y:200},slots)).toBe(-1);expect(snapTarget({x:580,y:220},slots)).toBe(1);expect(snapTarget({x:900,y:550},slots)).toBe(-1);
 });
 it('快速擦过的两次采样之间仍覆盖连续路径',()=>{
  const points=sampledSegment({x:0,y:0},{x:200,y:0},20);expect(points[0]).toEqual({x:0,y:0});expect(points.at(-1)).toEqual({x:200,y:0});expect(points.length).toBe(11);
 });
 it('三十款车每辆都有全新侧视、俯视和独立轮位；全部活动引用有效',()=>{
  expect(content.cars).toHaveLength(30);
  const sides=content.cars.map(car=>car.game?.side);expect(new Set(sides).size).toBe(30);
  for(const car of content.cars){expect(car.game?.side).toBe(`play-${car.id}-side`);expect(car.game?.top).toBe(`play-${car.id}-top`);expect(car.game?.wheels).toHaveLength(2);for(const view of [car.game!.side,car.game!.top])expect(content.assets.find(a=>a.id===view)?.path).toMatch(/^media\/play-cars\//);}
  for(const activity of content.activities)expect(activity.carIds).toHaveLength(30);
 });
});
