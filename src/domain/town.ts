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
  E01:'把小车送进同色的轮廓',E02:'碰一碰车轮、车灯和车门',E03:'绿灯推车，红灯停下',
  M01:'一辆小车，一个车位',M02:'配好车位，再看看还缺几个',M03:'三辆小车，四个车位',M04:'红、蓝、红、蓝，接着排',
  T01:'碰一碰，看看部件怎样帮忙',T02:'比一比桥板和河的宽度',T03:'转动路块，把两端接起来',T04:'装车身，再把两个轮子放好',
  H03:'擦净这辆，再换等待的小车',L02:'把招手卡送给朋友',
  S01:'先猜猜，再推推球和方块',S02:'移动小灯，观察影子',S03:'给雨天的背包装上雨伞和外套',P01:'一样的推动，不一样的路面',L01:'晴天带水和帽子，再检查安全带',H01:'带小车去看看不同的地方',
  C01:'摆一摆，讲讲你的发现',C02:'排一排，出发前先做什么',C03:'摆好场景，接着讲故事',A01:'给爱车设计一张海报',A02:'推推小车，画出轮印',L03:'按小车的颜色整理回家',H02:'把合适的工具送给伙伴',
};
