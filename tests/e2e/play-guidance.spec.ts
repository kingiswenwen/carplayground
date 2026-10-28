import {test,expect,type Page} from '@playwright/test';
import {openTouch,dropTouch,dragTouch,flickTouch,touchState,touchPosition,touchCanvas,completedTouch} from './touch-helpers';
import fs from 'node:fs';
const content=JSON.parse(fs.readFileSync('content/r3.json','utf8')) as {cars:{id:string;hotspots:{x:number;y:number}[]}[]};
const snapshot=async(page:Page)=>JSON.parse((await touchCanvas(page).getAttribute('data-state'))!);
async function tap(page:Page,p:{x:number;y:number}){const at=await touchPosition(page,p);await page.mouse.click(at.x,at.y);}
async function tapItem(page:Page,id:string){await tap(page,(await touchState(page)).items.find(i=>i.id===id)!);}
test('颜色分类不随自选黄车而变错，错放会演示正确目标 @smoke',async({page})=>{
 await openTouch(page,'L03','CAR01');expect((await snapshot(page)).items[0].carId).toBe('CAR02');await expect.poll(async()=>await touchCanvas(page).evaluate(c=>(c as HTMLCanvasElement).height)).toBe(680);
 await dropTouch(page,'car-0','bay-1');expect((await touchState(page)).progress).toBe(0);expect((await snapshot(page)).hint).toBe(true);
 await expect.poll(async()=>(await touchState(page)).items[0].x).toBe(180);
 for(let i=0;i<3;i++)await dropTouch(page,`car-${i}`,`bay-${i}`);await completedTouch(page);
});
test('空白触碰不消耗示范，车顶不触发车灯，实际车灯和车轮才响应 @smoke',async({page})=>{
 await openTouch(page,'E02');await tap(page,{x:20,y:20});expect((await snapshot(page)).hint).toBe(true);
 await tap(page,{x:500,y:200});expect((await snapshot(page)).parts).toEqual([]);
 const H=await touchCanvas(page).evaluate(c=>(c as HTMLCanvasElement).height),car=content.cars.find(c=>c.id==='CAR02')!;
 for(const p of car.hotspots)await tap(page,{x:50+p.x*900,y:H*.49-202.5+p.y*405});await completedTouch(page);expect((await snapshot(page)).parts.sort()).toEqual(['door','light','wheel']);
});
test('装车可点选点放且两个相同车轮可以交换，错放后仍能恢复 @smoke',async({page})=>{
 await page.setViewportSize({width:390,height:844});await openTouch(page,'T04');
 await tapItem(page,'body');expect((await snapshot(page)).selected).toBe('body');await tap(page,(await touchState(page)).targets.find(t=>t.id==='body')!);
 await expect.poll(async()=>(await touchState(page)).items.find(i=>i.id==='body')?.placed).toBe(true);
 for(const [item,target]of [['wheel-0','wheel-1'],['wheel-1','wheel-0']]){await tapItem(page,item);await tap(page,(await touchState(page)).targets.find(t=>t.id===target)!);}await completedTouch(page);
});
test('雨天进度只计算防雨必需物，随便装帽子饮料不能满条 @smoke',async({page})=>{
 await openTouch(page,'S03');await dropTouch(page,'pack-2','bag');await dropTouch(page,'pack-3','bag');expect((await touchState(page)).progress).toBe(0);expect((await touchState(page)).completed).toBe(false);
 await dropTouch(page,'pack-0','bag');expect((await touchState(page)).progress).toBe(.5);await dropTouch(page,'pack-1','bag');await completedTouch(page);
});
test('红灯不能直接推过线，绿灯出发后红灯才记录停止 @smoke',async({page})=>{
 await openTouch(page,'E03');await dragTouch(page,(await touchState(page)).items[0],{x:750,y:340});expect((await touchState(page)).items[0].x).toBeLessThanOrEqual(440);expect((await touchState(page)).completed).toBe(false);
 await tapItem(page,'signal');await dragTouch(page,(await touchState(page)).items[0],{x:650,y:340});expect((await snapshot(page)).signalGreen).toBe(true);expect((await touchState(page)).completed).toBe(false);await tapItem(page,'signal');await completedTouch(page);expect((await touchState(page)).moving).toBe(false);
});
test('两路同推采用相同输入，粗糙路面实际停得更近 @smoke',async({page})=>{
 await openTouch(page,'P01');await flickTouch(page,(await touchState(page)).items[0],{x:400,y:340});await completedTouch(page);const s=await snapshot(page);expect(s.comparison).toHaveLength(1);expect(s.comparison[0].smooth).toBeGreaterThan(s.comparison[0].rough+20);expect(s.items[0].y).not.toBe(s.items[1].y);
});
test('洗车依次轮流，两辆擦净后完成态保持100%，继续划不会降回93% @smoke',async({page})=>{
 test.setTimeout(60000);await openTouch(page,'H03');const H=await touchCanvas(page).evaluate(c=>(c as HTMLCanvasElement).height);
 const wash=async()=>{for(let y=H*.4-160;y<H*.4+180;y+=45)await dragTouch(page,{x:65,y},{x:935,y},4);};
 await wash();await expect.poll(async()=>(await snapshot(page)).wash.clean).toBe(1);expect((await touchState(page)).completed).toBe(false);await tapItem(page,'next-car');await expect.poll(async()=>(await snapshot(page)).wash.waiting).toBe(false);await wash();await completedTouch(page);expect((await snapshot(page)).wash.clean).toBe(2);await dragTouch(page,{x:400,y:H*.4},{x:600,y:H*.4});expect((await touchState(page)).progress).toBe(1);
});
test('接路逐步展开，直路不会变弯路，最终实际开到公园 @smoke',async({page})=>{
 test.setTimeout(60000);await openTouch(page,'T03');
 for(const [level,actions]of [[0,[['road-1',1]]],[1,[['road-1',2]]],[2,[['road-1',1],['road-2',2],['road-5',1]]]]as const){expect((await snapshot(page)).road.level).toBe(level);for(const [id,n]of actions)for(let i=0;i<n;i++)await tapItem(page,id);await expect.poll(async()=>(await snapshot(page)).road.won,{timeout:16000}).toBe(true);if(level<2)await tapItem(page,'next-road');}
 await completedTouch(page);
});
test('晴天出发准备包含安全带，数量的有余关有真实空车位 @smoke',async({page})=>{
 await openTouch(page,'L01');expect((await touchState(page)).targets.find(t=>t.id==='seat')).toHaveProperty('enabled',false);await dropTouch(page,'water','bag');await dropTouch(page,'hat','bag');await dropTouch(page,'belt','seat');await completedTouch(page);
 await openTouch(page,'M03');expect((await touchState(page)).targets).toHaveLength(4);for(let i=0;i<3;i++)await dropTouch(page,`car-${i}`,`bay-${i}`);await completedTouch(page);expect((await touchState(page)).targets.filter(t=>!t.occupied)).toHaveLength(1);
});
test('拖贴纸不会生成轮印，推车才产生可保存的印迹 @smoke',async({page})=>{
 await openTouch(page,'A02');await dragTouch(page,(await touchState(page)).items.find(i=>i.id==='stamp-0')!,{x:200,y:230});expect((await touchState(page)).completed).toBe(false);await dragTouch(page,(await touchState(page)).items[0],{x:700,y:250});await completedTouch(page);
});
test('求助场景向伙伴招手后出现帮助，自由表达只记参与 @smoke',async({page})=>{
 await openTouch(page,'L02');expect((await touchState(page)).completed).toBe(false);await dropTouch(page,'request','friend');await completedTouch(page);
});
test('颜色框依次给出红蓝白，单次红车配对不会冒充全部颜色完成 @smoke',async({page})=>{
 await openTouch(page,'E01');await dropTouch(page,'red','color-home');expect((await touchState(page)).progress).toBeCloseTo(1/3);expect((await touchState(page)).completed).toBe(false);await dropTouch(page,'white','color-home');await expect.poll(async()=>(await touchState(page)).items.find(i=>i.id==='white')!.x).toBe(810);expect((await touchState(page)).progress).toBeCloseTo(1/3);await dropTouch(page,'blue','color-home');await dropTouch(page,'white','color-home');await completedTouch(page);
});
