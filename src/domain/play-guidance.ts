import type {Car} from './content';
import type {Point,Rect} from './direct-play';
import type {RoadShape} from './learning';

/** Rotation preserves the physical road piece: straights never become corners. */
export function rotateRoad(shape:RoadShape):RoadShape {
 const clockwise:Record<RoadShape,RoadShape>={UD:'LR',LR:'UD',UR:'RD',RD:'DL',DL:'LU',LU:'UR'};
 return clockwise[shape];
}
export function partRegions(car:Car,rect:Rect){
 const point=(x:number,y:number)=>({x:rect.x-rect.w/2+x*rect.w,y:rect.y-rect.h/2+y*rect.h});
 return [...car.game!.wheels.map(w=>({id:'wheel' as const,...point(w.x,w.y),rx:w.r*rect.w+10,ry:w.r*rect.w+10})),
 ...car.hotspots.filter(p=>p.id!=='wheel').map(p=>({id:p.id,...point(p.x,p.y),rx:rect.w*(p.id==='door'?.1:.055),ry:rect.h*(p.id==='door'?.17:.1)}))];
}
export function hitPart(car:Car,rect:Rect,point:Point){
 return partRegions(car,rect).find(p=>((point.x-p.x)/p.rx)**2+((point.y-p.y)/p.ry)**2<=1)?.id;
}
export const roadLessons:{width:number;shapes:RoadShape[];locked:number[];end:number}[]=[
 {width:3,shapes:['LR','UD','LR'],locked:[0,2],end:2},
 {width:2,shapes:['RD','UR','UD','LU'],locked:[0,3],end:3},
 {width:3,shapes:['RD','UD','UR','UD','LR','LR','UR','UD','LU'],locked:[0,8],end:8},
];
