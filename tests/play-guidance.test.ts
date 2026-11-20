import {describe,it,expect} from 'vitest';
import {content} from '../src/domain/content';
import {hitPart,partRegions,rotateRoad,roadLessons} from '../src/domain/play-guidance';
import {traceRoad} from '../src/domain/road-route';
import {roadConnected,type RoadShape} from '../src/domain/learning';
describe('儿童看见的规则与真实接受规则一致',()=>{
 it('直线转四次仍为直线，弯角转四次回原形，每个关卡都有保持形状的解',()=>{
  for(const shape of ['UD','LR','UR','RD','DL','LU']as RoadShape[]){let next=shape;for(let i=0;i<4;i++){next=rotateRoad(next);expect(['UD','LR'].includes(next)).toBe(['UD','LR'].includes(shape));}expect(next).toBe(shape);}
  for(const lesson of roadLessons){expect(roadConnected(lesson.solution,lesson.width,0,lesson.end)).toBe(true);lesson.solution.forEach((shape,i)=>expect(['UD','LR'].includes(shape)).toBe(['UD','LR'].includes(lesson.shapes[i])));const visit=(shapes:RoadShape[],index:number):boolean=>{if(index===shapes.length)return roadConnected(shapes,lesson.width,0,lesson.end);if(lesson.locked.includes(index))return visit(shapes,index+1);let next=shapes[index];for(let i=0;i<4;i++){const copy=shapes.slice();copy[index]=next;if(visit(copy,index+1))return true;next=rotateRoad(next);}return false;};expect(roadConnected(lesson.shapes,lesson.width,0,lesson.end)).toBe(false);expect(visit(lesson.shapes,0)).toBe(true);}
 });
 it('封路后左右两侧仍能到达；断开的开口会让试车停下',()=>{
  const lesson=roadLessons[2];
  expect(traceRoad(lesson.shapes,3,8,lesson.closed)).toEqual({path:[0],reached:false,gap:1});
  expect(traceRoad(lesson.solution,3,8,[4]).path).toEqual([0,1,2,5,8]);
  const alternate:RoadShape[]=['UD','UD','UR','UD','UD','LR','UR','LR','LR'];
  expect(traceRoad(alternate,3,8,[4])).toEqual({path:[0,3,6,7,8],reached:true,gap:undefined});
  expect(traceRoad(['RD','UD','UD','UR','LR','LU'],3,5,[4])).toEqual({path:[0,3],reached:false,gap:4});
 });
 it('30辆车仅在实物热点识别部件，车顶不再被叫成车灯',()=>{
  const rect={x:500,y:340,w:900,h:405};
  for(const car of content.cars){for(const region of partRegions(car,rect))expect(hitPart(car,rect,region)).toBe(region.id);expect(hitPart(car,rect,{x:500,y:rect.y-rect.h*.35})).toBeUndefined();expect(hitPart(car,rect,{x:30,y:40})).toBeUndefined();}
 });
});
