import type { ActivityId, SceneId } from './content';
export const sceneAtmosphere: Record<SceneId, { invitation: string; intro: string; color: string; primary: ActivityId; spots: { id: ActivityId; x: number; y: number; label: string }[] }> = {
  showroom: { invitation: '灯光亮了，车展开门啦', intro: '走近看看车灯和车轮，再做一张属于自己的车展海报。', color: '#607e69', primary: 'E02', spots: [
    {id:'E02',x:49,y:58,label:'走近看车'}, {id:'E01',x:23,y:75,label:'找找颜色'}, {id:'C01',x:76,y:40,label:'说说小发现'}, {id:'A01',x:81,y:79,label:'做张车展海报'},
  ]},
  parking: { invitation: '滴滴，欢迎来到停车小镇', intro: '开进小院，给每辆车找位置。也可以去洗车，或者把去公园的路接起来。', color: '#ba7c44', primary: 'M01', spots: [
    {id:'M01',x:28,y:53,label:'开进停车场'}, {id:'P01',x:56,y:68,label:'让跑车跑起来'}, {id:'H03',x:84,y:36,label:'轮到谁洗车'}, {id:'T03',x:63,y:36,label:'把小路接起来'}, {id:'L03',x:18,y:27,label:'整理车库'},
  ]},
  workshop: { invitation: '小小工程师，今天试什么？', intro: '走到工作台边，滚一滚、搭一搭，看看改变之后会发生什么。', color: '#8b7294', primary: 'S01', spots: [
    {id:'S01',x:29,y:65,label:'试试谁会滚'}, {id:'T02',x:72,y:73,label:'给小车搭桥'}, {id:'S02',x:51,y:35,label:'打开光影实验'}, {id:'T04',x:79,y:30,label:'组装一辆跑车'}, {id:'H02',x:16,y:32,label:'请谁来帮忙'},
  ]},
  travel: { invitation: '带上好奇心，去小小旅行', intro: '先看天气、整理背包，再沿着小路去公园，听听一路上的故事。', color: '#5b899c', primary: 'H01', spots: [
    {id:'H01',x:47,y:43,label:'去哪里看看'}, {id:'S03',x:24,y:24,label:'看看今天的天气'}, {id:'C03',x:80,y:28,label:'树下讲个故事'}, {id:'L01',x:72,y:78,label:'整理出发背包'}, {id:'C02',x:25,y:73,label:'出发前先做什么'},
  ]},
};
