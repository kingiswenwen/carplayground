import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import {partTouchPoints,flickTouch} from './touch-helpers';
const content=JSON.parse(fs.readFileSync('content/r3.json','utf8')) as {cars:{id:string;brand:string;model:string}[];activities:{id:string}[]};
const modelIds=new Set((JSON.parse(fs.readFileSync('content/vehicle-models.json','utf8')) as {id:string}[]).map(m=>m.id));
type State={ready:boolean;completed:boolean;progress:number;moving:boolean;items:{id:string;x:number;y:number;placed:boolean}[];targets:{id:string;x:number;y:number;occupied?:boolean}[]};
const canvas=(page:Page)=>page.locator('canvas.touch-canvas');
const state=async(page:Page):Promise<State>=>JSON.parse((await canvas(page).getAttribute('data-state'))!);
async function open(page:Page,id:string,car='CAR03'){
 await page.goto(`/#/play/${id}?car=${car}&view=2d`);await expect(canvas(page)).toBeVisible();await expect.poll(async()=>(await state(page)).ready).toBe(true);
}
async function position(page:Page,p:{x:number;y:number}){
 const box=(await canvas(page).boundingBox())!,height=await canvas(page).evaluate(c=>(c as HTMLCanvasElement).height);
 return{x:box.x+p.x/1000*box.width,y:box.y+p.y/height*box.height};
}
async function drag(page:Page,from:{x:number;y:number},to:{x:number;y:number},steps=14){
 const a=await position(page,from),b=await position(page,to);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps});await page.mouse.up();
}
async function drop(page:Page,itemId:string,targetId:string){await expect.poll(async()=>JSON.parse((await canvas(page).getAttribute('data-state'))!).recovering).toBe(false);if(targetId==='color-home')await expect.poll(async()=>JSON.parse((await canvas(page).getAttribute('data-state'))!).colorStage.presenting).toBe(false);const s=await state(page);await drag(page,s.items.find(i=>i.id===itemId)!,s.targets.find(t=>t.id===targetId)!);}
async function complete(page:Page){await expect.poll(async()=>(await state(page)).completed,{timeout:12000}).toBe(true);}

test('立体车库支持品牌筛选、八辆分页与对应模型默认打开 @smoke',async({page})=>{
 // This journey opens the showroom and two detail viewers, including GLB loads.
 test.setTimeout(90000);
 await page.goto('/#/cars');await expect(page.locator('.car-gallery-card')).toHaveCount(8);await expect(page.locator('.garage-count')).toContainText(String(modelIds.size));
 const first=await page.locator('.car-gallery-card').first().getAttribute('aria-label');await page.getByRole('button',{name:'下一组跑车'}).click();await expect(page.locator('.car-gallery-card').first()).not.toHaveAttribute('aria-label',first!);
 const ferraris=content.cars.filter(car=>car.brand==='Ferrari'&&modelIds.has(car.id));
 await page.getByRole('combobox',{name:'按汽车品牌筛选'}).click();await page.getByRole('option',{name:'法拉利',exact:true}).click();
 await expect(page.locator('.car-gallery-card')).toHaveCount(Math.min(8,ferraris.length));
 await expect(page.locator('.car-gallery-card .garage-car-name')).toHaveText(ferraris.slice(0,8).map(car=>car.model));
 await page.goto('/#/cars/CAR135');await expect(page.locator('.vehicle-webgl[data-ready=true]')).toHaveAttribute('data-car','CAR135',{timeout:45000});
 await page.goto('/#/cars/CAR03');await page.getByRole('button',{name:'外观图',exact:true}).click();await expect(page.locator('.vehicle-angle')).toBeVisible();await expect(page.getByRole('button',{name:'立体模型',exact:true})).toBeVisible();
});
test('所有26个玩法均进入直接操作场景，无必读文字选择器 @smoke',async({page})=>{
 test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const activity of content.activities){
  await page.goto(`/#/play/${activity.id}?car=CAR03`);
  await expect(canvas(page)).toHaveAttribute('data-presentation','flat');
  await expect(canvas(page)).toHaveAttribute('data-scene-art','illustrated');
  await expect(page.locator('.motion-controls,.power-options,.assembly-tray,.parking-mode,.studio-tools select')).toHaveCount(0);
 }
 expect(errors).toEqual([]);
});
test('停车直接拖车，错误车位不覆盖，拖动取消不计数 @smoke',async({page})=>{
 await open(page,'M01');const initial=await state(page);const p=await position(page,initial.items[0]);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+40,p.y+30);await canvas(page).dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();
 expect((await state(page)).progress).toBe(0);
 await drop(page,'car-0','blocked-bay');expect((await state(page)).items[0].placed).toBe(false);
 await expect.poll(async()=>JSON.parse((await canvas(page).getAttribute('data-state'))!).recovering).toBe(false);
 const blocked=initial.targets.find(t=>t.id==='blocked-bay')!;
 const blockedEdge=await position(page,{x:blocked.x-125,y:blocked.y});
 await page.mouse.move(p.x,p.y);await page.mouse.down();
 await page.mouse.move(blockedEdge.x,blockedEdge.y,{steps:14});
 await expect.poll(async()=>(await state(page)).items[0].y).toBeLessThan(blocked.y);
 await page.mouse.up();
 expect((await state(page)).progress).toBe(0);
 await drop(page,'car-0','bay-0');await expect.poll(async()=>(await state(page)).items[0].placed).toBe(true);
 await drop(page,'car-1','bay-0');expect((await state(page)).completed).toBe(false);
 await drop(page,'car-1','bay-1');await complete(page);
});
test('实际擦洗减少污渍，背景乱划不完成，不点洗好按钮 @smoke',async({page})=>{
 test.setTimeout(90000);
 await open(page,'H03');await drag(page,{x:50,y:30},{x:900,y:30});expect((await state(page)).progress).toBe(0);
 const H=await canvas(page).evaluate(c=>(c as HTMLCanvasElement).height);
 const sweep=async()=>{for(let y=H*.4-170;y<=H*.4+180;y+=50)await drag(page,{x:60,y},{x:940,y});};
 const washing=async()=>JSON.parse((await canvas(page).getAttribute('data-state'))!).washing;
 await sweep();
 const next=(await state(page)).items.find(i=>i.id==='next-car')!,at=await position(page,next);await page.mouse.click(at.x,at.y);
 const mud=(await washing()).stubborn;
 await sweep();expect((await washing()).stubborn).toBe(mud);expect((await state(page)).completed).toBe(false);
 await page.getByRole('button',{name:'用海绵'}).click();await sweep();
 expect((await washing()).stubborn).toBe(0);expect((await washing()).foam).toBeGreaterThan(0);
 await page.getByRole('button',{name:'喷水'}).click();await sweep();
 await complete(page);expect((await state(page)).progress).toBe(1);
});
test('生成车身与独立轮子直接拖装，错放不能计为装好 @smoke',async({page})=>{
 test.setTimeout(60000);
 await open(page,'T04');const s=await state(page);await drag(page,s.items.find(i=>i.id==='wheel-0')!,{x:40,y:40});expect((await state(page)).progress).toBe(0);
 await drop(page,'body','body');await drop(page,'wheel-0','wheel-0');
 await page.getByRole('button',{name:'推车试走'}).click();await expect(page.locator('.town-action-cue')).toContainText('还少一只车轮');
 expect((await state(page)).completed).toBe(false);
 await drop(page,'wheel-1','wheel-1');await page.getByRole('button',{name:'取下一只轮子'}).click();
 await drop(page,'wheel-1','wheel-1');await page.getByRole('button',{name:'推车试走'}).click();await complete(page);
 const x=(await state(page)).items.find(i=>i.id==='body')!.x;
 await page.setViewportSize({width:390,height:844});
 await expect.poll(()=>canvas(page).evaluate(c=>(c as HTMLCanvasElement).height)).toBe(1200);
 expect((await state(page)).items.find(i=>i.id==='body')!.x).toBeCloseTo(x,6);
});
test('推车松手之后继续滑行，无启动和完成按钮 @smoke',async({page})=>{
 await open(page,'P01');
 await flickTouch(page,(await state(page)).items.find(i=>i.id==='runner')!,{x:500,y:340});
 await expect.poll(async()=>(await state(page)).items[0].x,{timeout:3000}).toBeGreaterThan(520);await repeatTrack(page);await complete(page);
 await expect(page.getByRole('button',{name:/推一下|我发现了/})).toHaveCount(0);
});
test('把车拖过旧发车上限后停住，松手不跳回、不自动补速度 @smoke',async({page})=>{
 await open(page,'P01');const start=await position(page,(await state(page)).items[0]),end=await position(page,{x:740,y:230});
 await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:6});
 const held=await state(page);expect(held.items[0].x).toBeGreaterThan(700);
 await page.waitForTimeout(180);await page.mouse.up();await page.waitForTimeout(150);
 const released=await state(page);expect(released.items[0].x).toBeCloseTo(held.items[0].x);expect(released.items[1].x).toBeCloseTo(held.items[1].x);expect(released.moving).toBe(false);expect(released.completed).toBe(false);
});
for(const id of ['M02'])test(`${id}拖动补车位之后再停第三辆车`,async({page})=>{
 await open(page,id);await drop(page,'car-0','bay-0');await drop(page,'car-1','bay-1');expect((await state(page)).completed).toBe(false);await expect(page.locator('.town-action-cue')).toContainText('补一块车位板');await drop(page,'extra-bay','bay-extra');await drop(page,'car-2','bay-extra');await complete(page);
});
test('颜色和规律用图像对象配对，不读取答案按钮',async({page})=>{
 test.setTimeout(75000);
 await open(page,'E01');await drop(page,'blue','color-home');expect((await state(page)).completed).toBe(false);for(const color of ['red','blue','white'])await drop(page,color,'color-home');await complete(page);
 await open(page,'M04');
 await drop(page,'blue','pattern-4');expect((await state(page)).completed).toBe(false);
 await drop(page,'red','pattern-4');await drop(page,'blue','pattern-5');
 await page.getByRole('button',{name:'接下一队车'}).click();
 await drop(page,'red','pattern-4');expect((await state(page)).completed).toBe(false);
 await drop(page,'blue','pattern-4');await drop(page,'red','pattern-5');await complete(page);
});
test('转动路块之后，小车实际走到终点；桥板太短不会通过',async({page})=>{
 test.setTimeout(90000);await open(page,'T02');
 const trial=page.getByRole('button',{name:'推车试桥'});
 await drop(page,'short','bridge');await trial.click();
 await expect(page.locator('.town-action-cue')).toContainText('桥板还够不到');
 expect((await state(page)).completed).toBe(false);
 await drop(page,'long','bridge');await trial.click();
 await page.getByRole('button',{name:'去更宽的河段'}).click();
 await expect(page.locator('.town-action-cue')).toContainText('河变宽了');
 await drop(page,'short','bridge');await trial.click();
 await expect(page.locator('.town-action-cue')).toContainText('桥板还够不到');
 const wide=await state(page);expect(wide.items.find(i=>i.id==='long')).toMatchObject({available:false});
 const shed=await position(page,wide.items.find(i=>i.id==='bridge-shed')!);await page.mouse.click(shed.x,shed.y);
 expect((await state(page)).items.find(i=>i.id==='long')).toMatchObject({available:true});
 expect((await state(page)).progress).toBe(.5);
 await drop(page,'long','bridge');await trial.click();await complete(page);
 await open(page,'T03');for(const actions of [[['road-1',1]],[['road-1',2]],[['road-1',1],['road-2',2],['road-5',1]]]as const){for(const [id,times]of actions){const p=await position(page,(await state(page)).items.find(i=>i.id===id)!);for(let i=0;i<times;i++)await page.mouse.click(p.x,p.y);}await page.getByRole('button',{name:'让小车试路'}).click();await expect.poll(async()=>JSON.parse((await canvas(page).getAttribute('data-state'))!).road.won,{timeout:12000}).toBe(true);const next=(await state(page)).items.find(i=>i.id==='next-road');if(next){const p=await position(page,next);await page.mouse.click(p.x,p.y);}}
 await complete(page);expect((await state(page)).items[0].y).toBeGreaterThan(400);
});
test('移动光源、装雨具、顺序图卡和职业工具实际操作完成',async({page})=>{
 test.setTimeout(85000);
 await open(page,'S02');await drag(page,(await state(page)).items[0],{x:176,y:228});expect((await state(page)).progress).toBe(.5);
 await drag(page,(await state(page)).items[0],{x:800,y:144});await complete(page);
 const samples=JSON.parse((await canvas(page).getAttribute('data-state'))!).shadowViews;
 expect(samples.map((s:{side:string})=>s.side)).toEqual(['right','left']);expect(samples[0].lampY).not.toBe(samples[1].lampY);
 await open(page,'S03');await drop(page,'pack-2','bag');await page.getByRole('button',{name:'试试下雨'}).click();
 await expect(page.locator('.town-action-cue')).toContainText('水点');await page.getByRole('button',{name:'换一套再试'}).click();
 await drop(page,'pack-0','bag');await page.getByRole('button',{name:'试试下雨'}).click();await complete(page);
 await expect(page.locator('.town-action-cue')).toContainText('还是干的');
 await open(page,'C02');
 for(const [i,slot] of [1,2,0].entries())await drop(page,`step-${i}`,`step-${slot}`);
 const sequence=page.getByRole('button',{name:'照顺序演一遍'});await sequence.click();
 await expect(page.locator('.town-action-cue')).toContainText('车门还开着');
 expect((await state(page)).completed).toBe(false);
 await drop(page,'step-2','step-2');await drop(page,'step-0','step-0');
 await sequence.click();await complete(page);
 await open(page,'H02');await drop(page,'tool-1','help-0');expect((await state(page)).progress).toBe(0);
 for(let i=0;i<3;i++)await drop(page,`tool-${i}`,`help-${i}`);await complete(page);
});
test('到达目的地、分类停车、场景表达无需输入或确认文字',async({page})=>{
 test.setTimeout(90000);
 await open(page,'H01');await drop(page,'visitor','place-0');expect((await state(page)).completed).toBe(false);
 const flower=await position(page,(await state(page)).items.find(i=>i.id==='exhibit')!);await page.mouse.click(flower.x,flower.y);await complete(page);
 await page.getByRole('button',{name:'回地图'}).click();await expect(page.getByRole('button',{name:/去公园/})).toContainText('公园');
 await drop(page,'visitor','place-1');await page.getByRole('button',{name:'翻开故事书'}).click();await expect(page.locator('.town-action-cue')).toContainText('小星星');
 expect(JSON.parse((await canvas(page).getAttribute('data-state'))!).visit.visited).toEqual([0,1]);
 await open(page,'L03');for(let i=0;i<3;i++)await drop(page,`car-${i}`,`bay-${i}`);
 await page.getByRole('button',{name:'换成长短挂牌'}).click();
 await drop(page,'car-1','bay-1');expect((await state(page)).items[1].placed).toBe(false);
 for(const [i,slot] of [1,2,0].entries())await drop(page,`car-${i}`,`bay-${slot}`);
 await complete(page);
 await open(page,'C01');
 await drag(page,(await state(page)).items.find(i=>i.id==='stamp-0')!,{x:245,y:250});
 await page.getByRole('button',{name:'换背景'}).click();
 await page.getByRole('button',{name:'从观众席看'}).click();await page.getByRole('button',{name:'保存展位'}).click();await complete(page);
 await open(page,'C03');
 const door=await position(page,(await state(page)).items.find(i=>i.id==='story-door')!);
 await page.mouse.click(door.x,door.y);await page.getByRole('button',{name:'去第二幕'}).click();
 expect(JSON.parse((await canvas(page).getAttribute('data-state'))!).story.discovery).toBe('butterfly');
 await drag(page,(await state(page)).items.find(i=>i.id==='story-find')!,{x:600,y:360});
 await page.getByRole('button',{name:'播放我的故事'}).click();await complete(page);
});
test('窄屏与尺寸变化保留停车状态，画面不横向溢出',async({page})=>{
 await page.setViewportSize({width:390,height:844});await open(page,'M01');await drop(page,'car-0','bay-0');await expect.poll(async()=>(await state(page)).items[0].placed).toBe(true);
 await page.setViewportSize({width:1000,height:760});
 // Viewport changes precede the media-query/layout update. Read new positions only after both settle.
 await expect.poll(async()=>({height:await canvas(page).evaluate(c=>(c as HTMLCanvasElement).height),y:(await state(page)).targets[0].y})).toEqual({height:680,y:442});
 await expect.poll(async()=>(await state(page)).items[0].placed).toBe(true);await drop(page,'car-1','bay-1');await complete(page);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('倾斜权限拒绝或没有传感器时仍可拖推',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(window,'DeviceOrientationEvent',{value:class {static requestPermission(){return Promise.resolve('denied');}},configurable:true});});
 await open(page,'P01');await page.getByRole('button',{name:'启用倾斜操控'}).click();await expect(page.getByRole('button',{name:'启用倾斜操控'})).toBeVisible();await flickTouch(page,(await state(page)).items[0],{x:520,y:340});await repeatTrack(page);await complete(page);
});
test('部件探索、出发停止和形状滚动均由触碰物体完成',async({page})=>{
 for(const id of ['E02','T01']){await open(page,id);for(const p of partTouchPoints()){const at=await position(page,p);await page.mouse.click(at.x,at.y);}await complete(page);}
 await open(page,'S01');
 await page.getByRole('button',{name:'猜方块更远'}).click();
 await page.getByRole('button',{name:'放开挡板'}).click();
 await page.getByRole('button',{name:'换个坡面'}).click();expect((await state(page)).progress).toBe(.5);
 await page.getByRole('button',{name:'猜小球更远'}).click();await page.getByRole('button',{name:'放开挡板'}).click();await complete(page);
 const observations=JSON.parse((await canvas(page).getAttribute('data-state'))!).rollingTest.stops;
 expect(observations[0].ball).toBeGreaterThan(observations[0].cube);
 expect(observations[0].ball).toBeGreaterThan(observations[1].ball);
});
test('新车图失败时不接受空图操作，重试后可继续 @smoke',async({page})=>{
 let fail=true,intercepted=false;await page.route('**/play-cars/*car03-side.webp',route=>{intercepted=true;return fail?route.abort():route.continue();});
 await page.goto('/#/play/M01?car=CAR03&view=2d');await expect(page.getByRole('button',{name:'重新加载游戏跑车'})).toBeVisible();expect((await state(page)).ready).toBe(false);
 expect(intercepted).toBe(true);
 fail=false;await page.getByRole('button',{name:'重新加载游戏跑车'}).click();await expect.poll(async()=>(await state(page)).ready).toBe(true);await drop(page,'car-0','bay-0');await drop(page,'car-1','bay-1');await complete(page);
});
test('切后台暂停后物体不漂移，返回须恢复操作 @smoke',async({page})=>{
 await open(page,'P01');await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 const before=await state(page);await page.waitForTimeout(250);expect((await state(page)).items).toEqual(before.items);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
 await page.getByRole('button',{name:'继续探索',exact:true}).click();await flickTouch(page,(await state(page)).items[0],{x:500,y:340});await repeatTrack(page);await complete(page);
});
test('手机原生触控拖车，第二根手指离开不会取消第一根拖动',async({page,browserName})=>{
 test.skip(browserName!=='chromium','原生触控通过Chromium输入协议验证');
 await page.setViewportSize({width:390,height:844});await open(page,'M01');
 const input=await page.context().newCDPSession(page),s=await state(page),start=await position(page,s.items[0]),end=await position(page,s.targets[0]),spare=await position(page,{x:930,y:1050});
 await input.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...start}]});
 await input.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...start},{id:2,...spare}]});
 await input.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{id:1,...start}]});
 for(let i=1;i<=12;i++)await input.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:start.x+(end.x-start.x)*i/12,y:start.y+(end.y-start.y)*i/12}]});
 await input.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect.poll(async()=>(await state(page)).items[0].placed).toBe(true);await input.detach();
});

test('红灯前松手不漂移，行人过完后还要再推才完成',async({page})=>{
 await open(page,'E03');
 await drag(page,(await state(page)).items[0],{x:700,y:340});
 await expect(page.locator('.town-action-cue')).toContainText('等行人走过');
 const stopped=(await state(page)).items[0].x;
 await expect(page.locator('.town-action-cue')).toContainText('绿灯亮了');
 expect((await state(page)).moving).toBe(false);
 expect((await state(page)).items[0].x).toBe(stopped);
 expect((await state(page)).completed).toBe(false);
 await drag(page,(await state(page)).items[0],{x:861,y:340});await complete(page);
});

async function repeatTrack(page:Page){
 await page.getByRole('button',{name:'交换路面'}).click();
 await page.getByRole('button',{name:'用同样的力再试'}).click();
}
