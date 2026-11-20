import {content, type ActivityId} from './content';

// Presentation map only: preserve original activity IDs, rules and stored scene IDs.
export const townPlaces = [
  {id:'showroom', name:'车展大厅', invitation:'走近一点，发现小车的秘密', action:'看一看', symbol:'car', color:'sage', activities:['E01','E02','E03','C01'], x:25, y:29},
  {id:'parking', name:'停车广场', invitation:'给每一辆小车，找一个家', action:'停一停', symbol:'garage', color:'coral', activities:['M01','M02','M03','M04','L03'], x:77, y:29},
  {id:'workshop', name:'修车与搭建工坊', invitation:'搭一搭，转一转，再试一次', action:'搭一搭', symbol:'tool', color:'ochre', activities:['T01','T02','T03','T04','H02'], x:24, y:59},
  {id:'wash', name:'泡泡洗车屋', invitation:'你洗好啦，就轮到我啦', action:'擦一擦', symbol:'sponge', color:'teal', activities:['H03','L02'], x:77, y:59},
  {id:'park', name:'出游科学公园', invitation:'带上好奇心，去试试为什么', action:'试一试', symbol:'tree', color:'green', activities:['S01','S02','S03','P01','L01','H01'], x:25, y:92},
  {id:'studio', name:'故事画室', invitation:'小车的故事，由你接着画', action:'画一画', symbol:'palette', color:'lilac', activities:['C02','C03','A01','A02'], x:77, y:92},
] as const;
export type TownPlace = typeof townPlaces[number];
export type TownId = TownPlace['id'];
export const townIds: readonly string[] = townPlaces.map(place=>place.id);
export function getTownPlace(id:string) {return townPlaces.find(place=>place.id===(id==='travel'?'park':id));}
export function activityPlace(id:string) {return townPlaces.find(place=>(place.activities as readonly string[]).includes(id))!;}
export function activityHref(id:string,carId:string) {
  const activity=content.activities.find(a=>a.id===id)!;
  return `#/play/${id}?car=${activity.carIds.includes(carId)?carId:activity.carIds[0]}`;
}
export const teachingActions: Record<ActivityId,string> = {
  E01:'看灯光，送同色小车上台',E02:'转车轮、开车门、点亮车灯',E03:'绿灯推车，红灯停下',
  M01:'绕开挡板，找一个空车位',M02:'看看缺几个车位，补上空位',M03:'给晚到的长车留位',M04:'看两队不同的规律，接着排',
  T01:'碰一碰，看看部件怎样帮忙',T02:'比一比桥板和河的宽度',T03:'转动路块，把两端接起来',T04:'装车身，再把两个轮子放好',
  H03:'喷水、擦泥、冲泡沫',L02:'小车卡住了，叫伙伴来帮忙',
  S01:'先猜一猜，再放开球和方块',S02:'移动小灯，对比两道影子',S03:'试试雨具，看看纸卡有没有湿',P01:'交换路面，用同样的力再试',L01:'带水、扣好安全带，再开车出门',H01:'开车去一站，动手找一个发现',
  C01:'给爱车布置自己的展位',C02:'排好顺序，照着演一遍',C03:'把第一幕的动作接到第二幕',A01:'给爱车设计一张海报',A02:'换轮纹和颜色，推车印花纹',L03:'先按颜色停，再按长短停',H02:'把合适的工具送给伙伴',
};
