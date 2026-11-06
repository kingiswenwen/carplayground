import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import type {Car} from '../../src/domain/content';
import {partRegions} from '../../src/domain/play-guidance';
import {touchCanvas,touchPosition,dropTouch,dragTouch,localRows} from './touch-helpers';
const cars=JSON.parse(fs.readFileSync('content/r3.json','utf8')).cars as Car[];
test.use({viewport:{width:1000,height:760}});
type Level='starter'|'discover';
const state=async(page:Page)=>JSON.parse((await touchCanvas(page).getAttribute('data-state'))!);
const world=(page:Page)=>page.locator('canvas.touch-world-canvas');
const worldState=async(page:Page)=>JSON.parse((await world(page).getAttribute('data-state'))!);
async function choose(page:Page,level:Level){
  await page.goto('/#/parent');await page.getByRole('combobox',{name:'内容阶段'}).selectOption(level);
  await expect.poll(async()=>(await localRows(page,'settings'))[0]?.contentLevel).toBe(level);
  await page.reload();await expect(page.getByRole('combobox',{name:'内容阶段'})).toHaveValue(level);
}
async function open(page:Page,id:string,three:boolean){
  await page.goto(`/#/play/${id}?car=CAR01${three?'':'&view=2d'}`);
  await expect.poll(async()=>(await state(page)).ready).toBe(true);
  if(three)await expect(world(page)).toHaveAttribute('data-ready','true',{timeout:45000});
}
async function clickWorld(page:Page,p:{x:number;y:number}){const b=(await world(page).boundingBox())!;await page.mouse.click(b.x+p.x*b.width,b.y+p.y*b.height);}
async function part(page:Page,name:'wheel'|'door'|'light',three:boolean){
  if(three){await clickWorld(page,(await worldState(page)).partScreens[name]);return;}
  const height=await touchCanvas(page).evaluate(c=>(c as HTMLCanvasElement).height);
  const p=partRegions(cars.find(c=>c.id==='CAR01')!,{x:500,y:height*.49,w:900,h:405}).find(p=>p.id===name)!;
  const at=await touchPosition(page,p);await page.mouse.click(at.x,at.y);
}
async function saved(page:Page,id:string,level:Level){
  await expect(page.locator('.touch-play')).toHaveAttribute('data-completed','true');
  await expect.poll(async()=>(await localRows(page,'sessions')).filter(r=>r.activityId===id&&r.state==='completed'&&r.contentLevel===level).length).toBeGreaterThan(0);
}
for(const three of [false,true]){
  test(`${three?'3D':'2D'} 内容两色/三色真实配对，错误颜色不推进，完成说明不夸大 @smoke`,async({page})=>{
    test.setTimeout(150000);
    for(const level of ['starter','discover'] as const){
      await choose(page,level);await open(page,'E01',three);
      await expect(page.locator('.touch-play')).toHaveAttribute('data-content-level',level);
      expect((await state(page)).items.map((i:{id:string})=>i.id)).toEqual(level==='starter'?['red','blue']:['red','blue','white']);
      if(three){const s=await worldState(page);await clickWorld(page,s.actors.find((a:{id:string})=>a.id==='blue').screen);await clickWorld(page,s.targetScreens[0].screen);}
      else{const s=await state(page);await dragTouch(page,s.items.find((i:{id:string})=>i.id==='blue'),s.targets[0]);}
      expect((await state(page)).progress).toBe(0);expect((await state(page)).completed).toBe(false);
      await expect.poll(async()=>(await state(page)).recovering).toBe(false);
      await dropTouch(page,'red','color-home');expect((await state(page)).completed).toBe(false);
      await dropTouch(page,'blue','color-home');
      if(level==='discover'){expect((await state(page)).completed).toBe(false);await dropTouch(page,'white','color-home');}
      await saved(page,'E01',level);
      const record=(await localRows(page,'sessions')).find(r=>r.activityId==='E01'&&r.contentLevel===level&&r.state==='completed')!;
      expect(record.summary).toContain(level==='starter'?'红、蓝两色':'红、蓝、白');
      if(level==='starter')await expect(page.getByRole('button',{name:'重听这次发现'}).locator('.sr-only')).toHaveText('红、蓝两种颜色都找到朋友了。');
    }
  });
  test(`${three?'3D':'2D'} 单车轮/三部件真实完成，非目标部件不算车轮，T01共用目标 @smoke`,async({page})=>{
    test.setTimeout(150000);
    for(const level of ['starter','discover'] as const){
      await choose(page,level);await open(page,'E02',three);
      await part(page,'door',three);
      if(level==='starter'){expect((await state(page)).parts).toEqual([]);expect((await state(page)).progress).toBe(0);}
      else expect((await state(page)).parts).toContain('door');
      expect((await state(page)).completed).toBe(false);
      await part(page,'wheel',three);
      if(level==='discover'){expect((await state(page)).completed).toBe(false);await part(page,'light',three);}
      await saved(page,'E02',level);
    }
    await choose(page,'starter');await open(page,'T01',three);await part(page,'wheel',three);await saved(page,'T01','starter');
  });
  test(`${three?'3D':'2D'} 停车一车/两车目标与记录一致，大目标不缩小 @smoke`,async({page},testInfo)=>{
    test.setTimeout(150000);
    for(const level of ['starter','discover'] as const){
      await choose(page,level);await open(page,'M01',three);
      const s=await state(page);expect(s.items).toHaveLength(level==='starter'?1:2);expect(s.targets).toHaveLength(s.items.length);expect(s.targets[0].w).toBe(310);
      await page.screenshot({path:testInfo.outputPath(`parking-${level}.png`)});
      await dropTouch(page,'car-0','bay-0');
      if(level==='discover'){expect((await state(page)).completed).toBe(false);await dropTouch(page,'car-1','bay-1');}
      await saved(page,'M01',level);
    }
  });
}
test('starter局部颜色跨切屏与引擎保持，重玩保留阶段，改设置从下次进入生效 @smoke',async({page})=>{
  test.setTimeout(150000);await choose(page,'starter');await open(page,'E01',true);
  await dropTouch(page,'red','color-home');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'使用平面简化玩法',exact:true}).click();
  await expect(touchCanvas(page)).toHaveAttribute('data-presentation','flat');
  expect((await state(page)).items).toHaveLength(2);expect((await state(page)).progress).toBe(.5);
  await dropTouch(page,'blue','color-home');await saved(page,'E01','starter');
  await page.getByRole('button',{name:'重新玩',exact:true}).click();
  await expect.poll(async()=>(await state(page)).ready&&(await state(page)).progress===0).toBe(true);
  await expect(page.locator('.touch-play')).toHaveAttribute('data-content-level','starter');expect((await state(page)).items).toHaveLength(2);
  await choose(page,'discover');await open(page,'E01',false);expect((await state(page)).items).toHaveLength(3);
  expect((await localRows(page,'sessions')).filter(r=>r.state==='completed'&&r.contentLevel==='starter')).toHaveLength(1);
});
