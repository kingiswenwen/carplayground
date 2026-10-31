import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import {partTouchPoints,flickTouch} from './touch-helpers';
const content=JSON.parse(fs.readFileSync('content/r3.json','utf8')) as {cars:{id:string;brand:string;model:string}[];activities:{id:string}[]};
const modelIds=new Set((JSON.parse(fs.readFileSync('content/vehicle-models.json','utf8')) as {id:string}[]).map(m=>m.id));
type State={ready:boolean;completed:boolean;progress:number;moving:boolean;items:{id:string;x:number;y:number;placed:boolean}[];targets:{id:string;x:number;y:number;occupied?:boolean}[]};
const canvas=(page:Page)=>page.locator('canvas.touch-canvas');
const state=async(page:Page):Promise<State>=>JSON.parse((await canvas(page).getAttribute('data-state'))!);
async function open(page:Page,id:string,car='CAR02'){
 await page.goto(`/#/play/${id}?car=${car}&view=2d`);await expect(canvas(page)).toBeVisible();await expect.poll(async()=>(await state(page)).ready).toBe(true);
}
async function position(page:Page,p:{x:number;y:number}){
 const box=(await canvas(page).boundingBox())!,height=await canvas(page).evaluate(c=>(c as HTMLCanvasElement).height);
 return{x:box.x+p.x/1000*box.width,y:box.y+p.y/height*box.height};
}
async function drag(page:Page,from:{x:number;y:number},to:{x:number;y:number},steps=14){
 const a=await position(page,from),b=await position(page,to);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps});await page.mouse.up();
}
async function drop(page:Page,itemId:string,targetId:string){await expect.poll(async()=>JSON.parse((await canvas(page).getAttribute('data-state'))!).recovering).toBe(false);const s=await state(page);await drag(page,s.items.find(i=>i.id===itemId)!,s.targets.find(t=>t.id===targetId)!);}
async function complete(page:Page){await expect.poll(async()=>(await state(page)).completed,{timeout:12000}).toBe(true);}

test('立体车库支持品牌筛选、八辆分页与对应模型默认打开 @smoke',async({page})=>{
 // This journey opens the showroom and two detail viewers, including GLB loads.
 test.setTimeout(90000);
 await page.goto('/#/cars');await expect(page.locator('.car-gallery-card')).toHaveCount(8);await expect(page.locator('.garage-count')).toContainText(String(modelIds.size));
 const first=await page.locator('.car-gallery-card').first().getAttribute('aria-label');await page.getByRole('button',{name:'下一组跑车'}).click();await expect(page.locator('.car-gallery-card').first()).not.toHaveAttribute('aria-label',first!);
 const ferraris=content.cars.filter(car=>car.brand==='Ferrari'&&modelIds.has(car.id));
 await page.getByRole('combobox',{name:'按汽车品牌筛选'}).selectOption('Ferrari');
 await expect(page.locator('.car-gallery-card')).toHaveCount(Math.min(8,ferraris.length));
 await expect(page.locator('.car-gallery-card .garage-car-name')).toHaveText(ferraris.slice(0,8).map(car=>car.model));
 await page.goto('/#/cars/CAR135');await expect(page.locator('.vehicle-webgl[data-ready=true]')).toHaveAttribute('data-car','CAR135',{timeout:45000});
 await page.goto('/#/cars/CAR02');await expect(page.locator('.vehicle-angle')).toBeVisible();await expect(page.getByRole('button',{name:'打开车型立体模型',exact:true})).toHaveCount(0);
});
test('所有26个玩法均进入直接操作场景，无必读文字选择器 @smoke',async({page})=>{
 test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const activity of content.activities){await open(page,activity.id);await expect(page.locator('.motion-controls,.power-options,.assembly-tray,.parking-mode,.studio-tools select')).toHaveCount(0);}
 expect(errors).toEqual([]);
});
test('停车直接拖车，错误车位不覆盖，拖动取消不计数 @smoke',async({page})=>{
 await open(page,'M01');const initial=await state(page);const p=await position(page,initial.items[0]);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+40,p.y+30);await canvas(page).dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();
 expect((await state(page)).progress).toBe(0);
 await drop(page,'car-0','bay-0');await expect.poll(async()=>(await state(page)).items[0].placed).toBe(true);
 await drop(page,'car-1','bay-0');expect((await state(page)).completed).toBe(false);
 await drop(page,'car-1','bay-1');await complete(page);
});
test('实际擦洗减少污渍，背景乱划不完成，不点洗好按钮 @smoke',async({page})=>{
 await open(page,'H03');await drag(page,{x:50,y:30},{x:900,y:30});expect((await state(page)).progress).toBe(0);
 const H=await canvas(page).evaluate(c=>(c as HTMLCanvasElement).height);
 for(let round=0;round<2;round++){for(let y=H*.4-170;y<=H*.4+180;y+=50)await drag(page,{x:60,y},{x:940,y});if(round===0){const next=(await state(page)).items.find(i=>i.id==='next-car')!,at=await position(page,next);await page.mouse.click(at.x,at.y);}}
 await complete(page);expect((await state(page)).progress).toBe(1);
});
test('生成车身与独立轮子直接拖装，错放不能计为装好 @smoke',async({page})=>{
 await open(page,'T04');const s=await state(page);await drag(page,s.items.find(i=>i.id==='wheel-0')!,{x:40,y:40});expect((await state(page)).progress).toBe(0);
 await drop(page,'body','body');await drop(page,'wheel-0','wheel-0');await drop(page,'wheel-1','wheel-1');await complete(page);
});
test('推车松手之后继续滑行，无启动和完成按钮 @smoke',async({page})=>{
 await open(page,'P01');
 await flickTouch(page,(await state(page)).items.find(i=>i.id==='runner')!,{x:500,y:340});
 await expect.poll(async()=>(await state(page)).items[0].x,{timeout:3000}).toBeGreaterThan(520);await complete(page);
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
 await open(page,id);await drop(page,'car-0','bay-0');await drop(page,'car-1','bay-1');expect((await state(page)).completed).toBe(false);await drop(page,'extra-bay','bay-2');await drop(page,'car-2','bay-2');await complete(page);
});
test('颜色和规律用图像对象配对，不读取答案按钮',async({page})=>{
 await open(page,'E01');await drop(page,'blue','color-home');expect((await state(page)).completed).toBe(false);for(const color of ['red','blue','white'])await drop(page,color,'color-home');await complete(page);
 await open(page,'M04');await drop(page,'blue','pattern-4');expect((await state(page)).completed).toBe(false);await drop(page,'red','pattern-4');await drop(page,'blue','pattern-5');await complete(page);
});
test('转动路块之后，小车实际走到终点；桥板太短不会通过',async({page})=>{
 test.setTimeout(60000);await open(page,'T02');await drop(page,'short','bridge');expect((await state(page)).completed).toBe(false);await drop(page,'long','bridge');await complete(page);
 await open(page,'T03');for(const actions of [[['road-1',1]],[['road-1',2]],[['road-1',1],['road-2',2],['road-5',1]]]as const){for(const [id,times]of actions){const p=await position(page,(await state(page)).items.find(i=>i.id===id)!);for(let i=0;i<times;i++)await page.mouse.click(p.x,p.y);}await expect.poll(async()=>JSON.parse((await canvas(page).getAttribute('data-state'))!).road.won,{timeout:12000}).toBe(true);const next=(await state(page)).items.find(i=>i.id==='next-road');if(next){const p=await position(page,next);await page.mouse.click(p.x,p.y);}}
 await complete(page);expect((await state(page)).items[0].y).toBeGreaterThan(400);
});
test('移动光源、装雨具、顺序图卡和职业工具实际操作完成',async({page})=>{
 await open(page,'S02');await drag(page,(await state(page)).items[0],{x:200,y:140});await drag(page,(await state(page)).items[0],{x:800,y:140});await complete(page);
 for(const id of ['S03']){await open(page,id);await drop(page,'pack-0','bag');await drop(page,'pack-1','bag');await complete(page);}
 await open(page,'C02');for(let i=0;i<3;i++)await drop(page,`step-${i}`,`step-${i}`);await complete(page);
 await open(page,'H02');for(let i=0;i<3;i++)await drop(page,`tool-${i}`,`help-${i}`);await complete(page);
});
test('到达目的地、分类停车、场景表达无需输入或确认文字',async({page})=>{
 await open(page,'H01');await drop(page,'visitor','place-0');await complete(page);
 await open(page,'L03');for(let i=0;i<3;i++)await drop(page,`car-${i}`,`bay-${i}`);await complete(page);
 for(const id of ['C01','C03','A01']){await open(page,id);let s=await state(page);await drag(page,s.items.find(i=>i.id==='stamp-0')!,{x:200,y:250});s=await state(page);await drag(page,s.items.find(i=>i.id==='stamp-1')!,{x:750,y:200});await complete(page);}
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
 await open(page,'P01');await page.getByRole('button',{name:'启用倾斜操控'}).click();await expect(page.getByRole('button',{name:'启用倾斜操控'})).toBeVisible();await flickTouch(page,(await state(page)).items[0],{x:520,y:340});await complete(page);
});
test('部件探索、出发停止和形状滚动均由触碰物体完成',async({page})=>{
 for(const id of ['E02','T01']){await open(page,id);for(const p of partTouchPoints()){const at=await position(page,p);await page.mouse.click(at.x,at.y);}await complete(page);}
 for(const id of ['S01']){await open(page,id);await flickTouch(page,(await state(page)).items[0],{x:500,y:340});await complete(page);}
});
test('新车图失败时不接受空图操作，重试后可继续 @smoke',async({page})=>{
 let fail=true;await page.route('**/play-cars/*car02-side.webp',route=>fail?route.abort():route.continue());
 await page.goto('/#/play/M01?car=CAR02');await expect(page.getByRole('button',{name:'重新加载游戏跑车'})).toBeVisible();expect((await state(page)).ready).toBe(false);
 fail=false;await page.getByRole('button',{name:'重新加载游戏跑车'}).click();await expect.poll(async()=>(await state(page)).ready).toBe(true);await drop(page,'car-0','bay-0');await drop(page,'car-1','bay-1');await complete(page);
});
test('切后台暂停后物体不漂移，返回须恢复操作 @smoke',async({page})=>{
 await open(page,'P01');await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 const before=await state(page);await page.waitForTimeout(250);expect((await state(page)).items).toEqual(before.items);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
 await page.getByRole('button',{name:'继续探索',exact:true}).click();await flickTouch(page,(await state(page)).items[0],{x:500,y:340});await complete(page);
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

test('慢推红绿灯场景仍能明确出发和停止，不凭旧速度漂移',async({page})=>{
 await open(page,'E03');let signal=await position(page,(await state(page)).items.find(i=>i.id==='signal')!);await page.mouse.click(signal.x,signal.y);const from=await position(page,(await state(page)).items[0]),to=await position(page,{x:500,y:340});await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});await page.waitForTimeout(250);await page.mouse.up();expect((await state(page)).moving).toBe(false);await page.mouse.click(signal.x,signal.y);await complete(page);
});
