import {test,expect,type Page} from '@playwright/test';
import {openTouch,dropTouch,dragTouch,flickTouch,touchState,touchPosition,touchCanvas,completedTouch} from './touch-helpers';
import fs from 'node:fs';
const content=JSON.parse(fs.readFileSync('content/r3.json','utf8')) as {cars:{id:string;hotspots:{x:number;y:number}[]}[]};
const snapshot=async(page:Page)=>JSON.parse((await touchCanvas(page).getAttribute('data-state'))!);
async function tap(page:Page,p:{x:number;y:number}){const at=await touchPosition(page,p);await page.mouse.click(at.x,at.y);}
async function tapItem(page:Page,id:string){await tap(page,(await touchState(page)).items.find(i=>i.id===id)!);}
test('颜色分类不随自选黄车而变错，错放会演示正确目标 @smoke',async({page})=>{
 test.setTimeout(60000);
 await openTouch(page,'L03','CAR01');expect((await snapshot(page)).items[0].carId).toBe('CAR140');await expect.poll(async()=>await touchCanvas(page).evaluate(c=>(c as HTMLCanvasElement).height)).toBe(680);
 await dropTouch(page,'car-0','bay-1');expect((await touchState(page)).progress).toBe(0);expect((await snapshot(page)).hint).toBe(true);
 await expect.poll(async()=>(await touchState(page)).items[0].x).toBe(180);
 for(let i=0;i<3;i++)await dropTouch(page,`car-${i}`,`bay-${i}`);
 await page.getByRole('button',{name:'换成长短挂牌'}).click();
 for(const [i,slot] of [1,2,0].entries())await dropTouch(page,`car-${i}`,`bay-${slot}`);
 await completedTouch(page);
});
test('空白触碰不消耗示范，车顶不触发车灯，实际车灯和车轮才响应 @smoke',async({page})=>{
 await openTouch(page,'E02');await tap(page,{x:20,y:20});expect((await snapshot(page)).hint).toBe(true);
 await tap(page,{x:500,y:200});expect((await snapshot(page)).parts).toEqual([]);
 const H=await touchCanvas(page).evaluate(c=>(c as HTMLCanvasElement).height),car=content.cars.find(c=>c.id==='CAR03')!;
 for(const p of car.hotspots)await tap(page,{x:50+p.x*900,y:H*.49-202.5+p.y*405});await completedTouch(page);expect((await snapshot(page)).parts.sort()).toEqual(['door','light','wheel']);
});
test('装车可点选点放且两个相同车轮可以交换，错放后仍能恢复 @smoke',async({page})=>{
 await page.setViewportSize({width:390,height:844});await openTouch(page,'T04');
 await tapItem(page,'body');expect((await snapshot(page)).selected).toBe('body');await tap(page,(await touchState(page)).targets.find(t=>t.id==='body')!);
 await expect.poll(async()=>(await touchState(page)).items.find(i=>i.id==='body')?.placed).toBe(true);
 for(const [item,target]of [['wheel-0','wheel-1'],['wheel-1','wheel-0']]){await tapItem(page,item);await tap(page,(await touchState(page)).targets.find(t=>t.id===target)!);}
 await page.getByRole('button',{name:'推车试走'}).click();await completedTouch(page);
});
test('雨天进度只计算防雨必需物，随便装帽子饮料不能满条 @smoke',async({page})=>{
 await openTouch(page,'S03');await dropTouch(page,'pack-2','bag');await dropTouch(page,'pack-3','bag');expect((await touchState(page)).progress).toBe(0);expect((await touchState(page)).completed).toBe(false);
 await dropTouch(page,'pack-0','bag');expect((await touchState(page)).progress).toBe(.5);await dropTouch(page,'pack-1','bag');await completedTouch(page);
});
test('红灯不能直接推过线，也不能点灯跳过等候 @smoke',async({page})=>{
 await openTouch(page,'E03');await tapItem(page,'signal');expect((await snapshot(page)).signalGreen).toBe(false);
 await dragTouch(page,(await touchState(page)).items[0],{x:750,y:340});
 expect((await touchState(page)).items[0].x).toBeLessThanOrEqual(440);
 expect((await touchState(page)).completed).toBe(false);
 await expect.poll(async()=>(await snapshot(page)).signalGreen).toBe(true);
 await dragTouch(page,(await touchState(page)).items[0],{x:861,y:340});await completedTouch(page);
});
test('两路同推采用相同输入，粗糙路面实际停得更近 @smoke',async({page})=>{
 await openTouch(page,'P01');await flickTouch(page,(await touchState(page)).items[0],{x:400,y:340});await page.getByRole('button',{name:'交换路面'}).click();
 await page.getByRole('button',{name:'用同样的力再试'}).click();await completedTouch(page);const s=await snapshot(page);
 expect(s.comparison).toHaveLength(2);const [first,second]=s.comparison;
 expect(first.smooth).toBeGreaterThan(first.rough+20);expect(second.smooth).toBeCloseTo(first.smooth,1);expect(second.rough).toBeCloseTo(first.rough,1);
 expect(first.upper).toBeCloseTo(second.lower,1);expect(first.lower).toBeCloseTo(second.upper,1);
});
test('洗车依次轮流，两辆擦净后完成态保持100%，继续划不会降回93% @smoke',async({page})=>{
 test.setTimeout(60000);await openTouch(page,'H03');const H=await touchCanvas(page).evaluate(c=>(c as HTMLCanvasElement).height);
 const wash=async()=>{for(let y=H*.4-160;y<H*.4+180;y+=45)await dragTouch(page,{x:65,y},{x:935,y},4);};
 await wash();await expect.poll(async()=>(await snapshot(page)).wash.clean).toBe(1);expect((await touchState(page)).completed).toBe(false);await tapItem(page,'next-car');await expect.poll(async()=>(await snapshot(page)).wash.waiting).toBe(false);
 await page.getByRole('button',{name:'用海绵'}).click();await wash();
 await page.getByRole('button',{name:'喷水'}).click();await wash();await completedTouch(page);expect((await snapshot(page)).wash.clean).toBe(2);await dragTouch(page,{x:400,y:H*.4},{x:600,y:H*.4});expect((await touchState(page)).progress).toBe(1);
});
test('接路逐步展开，直路不会变弯路，最终实际开到公园 @smoke',async({page})=>{
 test.setTimeout(100000);await openTouch(page,'T03');
 await page.getByRole('button',{name:'让小车试路'}).click();
 await expect(page.locator('.town-action-cue')).toContainText('小车停在断口');
 expect((await snapshot(page)).completed).toBe(false);
 for(const [level,actions]of [[0,[['road-1',1]]],[1,[['road-1',2]]],[2,[['road-1',1],['road-2',2],['road-5',1]]]]as const){expect((await snapshot(page)).road.level).toBe(level);for(const [id,n]of actions)for(let i=0;i<n;i++)await tapItem(page,id);await page.getByRole('button',{name:'让小车试路'}).click();await expect.poll(async()=>(await snapshot(page)).road.won,{timeout:16000}).toBe(true);if(level<2)await tapItem(page,'next-road');}
 await completedTouch(page);
});
test('晴天出发要扣安全带；长车到场后可挪走占长位的小车 @smoke',async({page})=>{
 await openTouch(page,'L01');await page.getByRole('button',{name:'开车出门'}).click();
 await expect(page.locator('.town-action-cue')).toContainText('安全带');expect((await touchState(page)).completed).toBe(false);
 await dropTouch(page,'belt','seat');await page.getByRole('button',{name:'开车出门'}).click();
 await expect(page.locator('.town-action-cue')).toContainText('还缺水');await dropTouch(page,'water','bag');
 expect((await touchState(page)).completed).toBe(false);await page.getByRole('button',{name:'开车出门'}).click();await completedTouch(page);
 await openTouch(page,'M03');expect((await snapshot(page)).items[2].available).toBe(false);
 await dropTouch(page,'car-0','bay-3');await dropTouch(page,'car-1','bay-1');
 await expect(page.locator('.town-action-cue')).toContainText('长车位有人');
 await dropTouch(page,'car-2','bay-2');expect((await touchState(page)).completed).toBe(false);
 await expect.poll(async()=>(await snapshot(page)).recovering).toBe(false);
 await tapItem(page,'car-0');await tap(page,(await touchState(page)).targets.find(t=>t.id==='bay-0')!);
 await expect(page.locator('.town-action-cue')).toContainText('长车到了');
 await dropTouch(page,'car-2','bay-3');await completedTouch(page);
 expect((await touchState(page)).targets.filter(t=>!t.occupied)).toHaveLength(1);
});
test('拖贴纸不会生成轮印，推车才产生可保存的印迹 @smoke',async({page})=>{
 await openTouch(page,'A02');await dragTouch(page,(await touchState(page)).items.find(i=>i.id==='stamp-0')!,{x:200,y:230});expect((await touchState(page)).completed).toBe(false);await dragTouch(page,(await touchState(page)).items[0],{x:700,y:250});await completedTouch(page);
});
test('求助场景向伙伴招手后出现帮助，自由表达只记参与 @smoke',async({page})=>{
 await openTouch(page,'L02');expect((await touchState(page)).completed).toBe(false);
 await dragTouch(page,(await touchState(page)).items[0],{x:778,y:350});
 await expect(page.getByRole('button',{name:'招招手'})).toBeVisible();
 await dropTouch(page,'request','friend');
 await expect(page.locator('.town-action-cue')).toContainText('挡板挪开了');
 expect((await touchState(page)).completed).toBe(false);
 await page.getByRole('button',{name:'推推小车'}).click();await completedTouch(page);
});
test('颜色框依次给出红蓝白，单次红车配对不会冒充全部颜色完成 @smoke',async({page})=>{
 await openTouch(page,'E01');await dropTouch(page,'red','color-home');expect((await touchState(page)).progress).toBeCloseTo(1/3);expect((await touchState(page)).completed).toBe(false);await expect.poll(async()=>(await snapshot(page)).colorStage?.presenting).toBe(false);
 const whiteAt=(await touchState(page)).items.find(i=>i.id==='white')!.x;expect(whiteAt).not.toBe(810);
 await dropTouch(page,'white','color-home');await expect.poll(async()=>(await touchState(page)).items.find(i=>i.id==='white')!.x).toBe(whiteAt);expect((await touchState(page)).progress).toBeCloseTo(1/3);await dropTouch(page,'blue','color-home');await dropTouch(page,'white','color-home');await completedTouch(page);
});
