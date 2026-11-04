import {test,expect,type Page} from '@playwright/test';
import {touchCanvas,touchPosition,dragTouch,localRows} from './touch-helpers';
import fs from 'node:fs';

const cars=JSON.parse(fs.readFileSync('content/r3.json','utf8')).cars as {id:string;hotspots:{id:string;x:number;y:number}[]}[];
const state=async(page:Page)=>JSON.parse((await touchCanvas(page).getAttribute('data-state'))!);
const variants=[
 {name:'保留车型主动选择平面',car:'CAR03',query:'&view=2d',webgl:false},
 {name:'有模型车辆主动选择平面',car:'CAR01',query:'&view=2d',webgl:false},
 {name:'WebGL 不可用后的平面回退',car:'CAR01',query:'',webgl:true},
];
async function open(page:Page,id:string,variant=variants[0]){
 if(variant.webgl)await page.addInitScript(()=>{
  const original=HTMLCanvasElement.prototype.getContext;
  Reflect.set(HTMLCanvasElement.prototype,'getContext',function(this:HTMLCanvasElement,type:string,...args:unknown[]){
   return type.startsWith('webgl')?null:Reflect.apply(original,this,[type,...args]);
  });
 });
 await page.goto(`/#/play/${id}?car=${variant.car}${variant.query}`);
 await expect(touchCanvas(page)).toHaveAttribute('data-presentation','flat');
 await expect.poll(async()=>(await state(page)).ready).toBe(true);
}
async function washToNextCar(page:Page,clean:number){
 let presses=0;
 while((await state(page)).wash.clean===clean&&presses<100){
  await touchCanvas(page).press(presses%2?'Space':'Enter');presses++;
 }
 expect((await state(page)).wash.clean).toBe(clean+1);
 return presses;
}
async function completed(page:Page){
 await expect(page.locator('.touch-play')).toHaveAttribute('data-completed','true');
 await expect(page.getByRole('progressbar',{name:'本次探索进度'})).toHaveAttribute('aria-valuenow','100');
 await expect(page.getByRole('region',{name:'小车接下来想去哪里'})).toBeVisible();
 await expect.poll(async()=>(await localRows(page,'sessions')).filter(r=>r.state==='completed').length).toBe(1);
}

for(const variant of variants){
 for(const id of ['E02','T01'])test(`${variant.name}：${id} 按键逐个探索真实部件 @smoke`,async({page})=>{
  await open(page,id,variant);
  for(const [i,key]of ['Enter','Space','Enter'].entries()){
   await touchCanvas(page).press(key);
   expect((await state(page)).parts).toHaveLength(i+1);
   expect((await state(page)).progress).toBeCloseTo((i+1)/3);
   expect((await state(page)).completed).toBe(i===2);
  }
  await completed(page);
  const finished=await state(page);await touchCanvas(page).press('Space');
  expect((await state(page)).parts).toEqual(finished.parts);
 });
 test(`${variant.name}：按键实际擦净两辆车，换车需要单独确认 @smoke`,async({page})=>{
  test.setTimeout(60000);
  await open(page,'H03',variant);
  await touchCanvas(page).press('Enter');
  const firstStroke=await state(page);
  expect(firstStroke.progress).toBeGreaterThan(0);expect(firstStroke.progress).toBeLessThan(.5);
  expect(firstStroke.wash.clean).toBe(0);expect(firstStroke.completed).toBe(false);
  await washToNextCar(page,0);
  expect((await state(page)).wash.waiting).toBe(true);
  expect((await state(page)).progress).toBe(.5);expect((await state(page)).completed).toBe(false);
  await touchCanvas(page).press('Space');
  expect((await state(page)).wash).toEqual({clean:1,waiting:false});
  expect((await state(page)).progress).toBe(.5);
  await washToNextCar(page,1);await completed(page);
  await touchCanvas(page).press('Enter');
  expect((await state(page)).wash.clean).toBe(2);expect((await state(page)).progress).toBe(1);
 });
}

test('平面部件可以交替点击和按键，已发现的车门不重复计算 @smoke',async({page})=>{
 await open(page,'E02');
 const door=cars.find(c=>c.id==='CAR03')!.hotspots.find(p=>p.id==='door')!;
 const height=await touchCanvas(page).evaluate(c=>(c as HTMLCanvasElement).height);
 const p=await touchPosition(page,{x:50+door.x*900,y:height*.49-202.5+door.y*405});
 await page.mouse.click(p.x,p.y);expect((await state(page)).parts).toEqual(['door']);
 await touchCanvas(page).press('Enter');expect((await state(page)).parts).toHaveLength(2);
 await touchCanvas(page).press('Space');await completed(page);
 expect((await state(page)).parts.sort()).toEqual(['door','light','wheel']);
});

test('平面洗车可以交替擦洗、按键和点击换车，保留实际清洁进度 @smoke',async({page})=>{
 test.setTimeout(60000);
 await open(page,'H03');
 const height=await touchCanvas(page).evaluate(c=>(c as HTMLCanvasElement).height);
 await dragTouch(page,{x:65,y:height*.4},{x:935,y:height*.4},4);
 const pointerProgress=(await state(page)).progress;expect(pointerProgress).toBeGreaterThan(0);
 await touchCanvas(page).press('Enter');expect((await state(page)).progress).toBeGreaterThan(pointerProgress);
 await washToNextCar(page,0);
 const next=(await state(page)).items.find((i:{id:string})=>i.id==='next-car');
 const p=await touchPosition(page,next);await page.mouse.click(p.x,p.y);
 expect((await state(page)).wash).toEqual({clean:1,waiting:false});
 await washToNextCar(page,1);await completed(page);
});

for(const id of ['E02','H03'])test(`${id} 演示和暂停期间不消耗按键进度，返回后仍可操作 @smoke`,async({page})=>{
 await open(page,id);const before=await state(page);
 await page.getByRole('button',{name:'看看怎么玩',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'图示玩法'})).toBeVisible();
 await page.getByRole('button',{name:'下一步演示',exact:true}).focus();
 await page.keyboard.press('Enter');await page.keyboard.press('Space');
 expect((await state(page)).progress).toBe(before.progress);expect((await state(page)).parts).toEqual(before.parts);
 await page.getByRole('button',{name:'收起图示玩法',exact:true}).click();
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 await expect(page.getByRole('button',{name:'继续探索',exact:true})).toBeVisible();
 await touchCanvas(page).press('Enter');
 expect((await state(page)).progress).toBe(before.progress);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
 await page.getByRole('button',{name:'继续探索',exact:true}).click();
 await touchCanvas(page).press('Enter');expect((await state(page)).progress).toBeGreaterThan(before.progress);
});

for(const id of ['E02','H03'])test(`${id} 图片尚未准备好时按键不会提前记录探索 @smoke`,async({page})=>{
 let release!:()=>void,held=false;const ready=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/play-cars/toy-car03-side.webp*',async route=>{held=true;await ready;await route.continue();});
 try{
  await page.goto(`/#/play/${id}?car=CAR03&view=2d`);await expect(touchCanvas(page)).toBeVisible();
  await expect.poll(()=>held).toBe(true);expect((await state(page)).ready).toBe(false);
  await touchCanvas(page).press('Enter');await touchCanvas(page).press('Space');
  expect((await state(page)).progress).toBe(0);expect((await state(page)).parts).toEqual([]);
  release();await expect.poll(async()=>(await state(page)).ready).toBe(true);
  await touchCanvas(page).press('Enter');expect((await state(page)).progress).toBeGreaterThan(0);
 }finally{release();}
});
