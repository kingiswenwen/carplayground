import {test,expect,type Page} from '@playwright/test';
import * as T from 'three';
import fs from 'node:fs';
import type {Car} from '../../src/domain/content';
const content=JSON.parse(fs.readFileSync('content/r3.json','utf8')) as {cars:Car[]};
import {partRegions} from '../../src/domain/play-guidance';
import {touchCanvas,touchPosition,dragTouch,localRows,dropTouch} from './touch-helpers';

test.use({viewport:{width:1000,height:760}});
type Mode='gentle'|'explore';
const world=(page:Page)=>page.locator('canvas.touch-world-canvas');
const flatState=async(page:Page)=>JSON.parse((await touchCanvas(page).getAttribute('data-state'))!);
const worldState=async(page:Page)=>JSON.parse((await world(page).getAttribute('data-state'))!);
async function choose(page:Page,mode:Mode){
  await page.goto('/#/parent');
  await page.getByRole('combobox',{name:'操作难度'}).selectOption(mode);
  await expect.poll(async()=>(await localRows(page,'settings'))[0]?.difficulty).toBe(mode);
}
async function open(page:Page,id:string,three=false){
  await page.goto(`/#/play/${id}?car=CAR01${three?'':'&view=2d'}`);
  await expect.poll(async()=>(await flatState(page)).ready).toBe(true);
  if(three)await expect(world(page)).toHaveAttribute('data-ready','true',{timeout:45000});
}
async function clickFlat(page:Page,p:{x:number;y:number}){const at=await touchPosition(page,p);await page.mouse.click(at.x,at.y);}
async function clickWorld(page:Page,p:{x:number;y:number}){const b=(await world(page).boundingBox())!;await page.mouse.click(b.x+p.x*b.width,b.y+p.y*b.height);}
async function ground(page:Page,p:{x:number;y:number}){
  const s=await worldState(page),v=new T.Vector3((p.x-500)*.02,0,(p.y-s.boardHeight/2)*.02).applyMatrix4(new T.Matrix4().fromArray(s.floorProjection));
  return{x:(v.x+1)/2,y:(1-v.y)/2};
}

for(const three of [false,true])test(`${three?'3D':'2D'} 相同边缘落点两档不同，精确中心仍可完成且记录一致 @smoke`,async({page})=>{
  test.setTimeout(120000);
  for(const mode of ['gentle','explore'] as const){
    await choose(page,mode);await page.reload();
    await expect(page.getByRole('combobox',{name:'操作难度'})).toHaveValue(mode);
    await open(page,'M01',three);
    const s=await flatState(page),target=s.targets[0],edge={x:target.x,y:target.y+target.h/2+20};
    if(three){
      const w=await worldState(page);await clickWorld(page,w.actors.find((a:{id:string})=>a.id==='car-0').screen);
      await expect.poll(async()=>(await flatState(page)).selected).toBe('car-0');
      await clickWorld(page,await ground(page,edge));
    }else await dragTouch(page,s.items.find((i:{id:string})=>i.id==='car-0'),edge);
    await expect.poll(async()=>(await flatState(page)).items.find((i:{id:string})=>i.id==='car-0').placed).toBe(mode==='gentle');
    if(mode==='explore'){
      await expect.poll(async()=>(await flatState(page)).recovering).toBe(false);
      await dropTouch(page,'car-0','bay-0');
    }
    await dropTouch(page,'car-1','bay-1');
    await expect(page.locator('.touch-play')).toHaveAttribute('data-completed','true');
    await expect.poll(async()=>(await localRows(page,'sessions')).filter(r=>r.activityId==='M01'&&r.state==='completed'&&r.difficulty===mode).length).toBe(1);
  }
});

for(const three of [false,true])test(`${three?'3D':'2D'} 两档都不把错误颜色当作正确答案 @smoke`,async({page})=>{
  test.setTimeout(120000);
  for(const mode of ['gentle','explore'] as const){
    await choose(page,mode);await open(page,'E01',three);
    if(three){const s=await worldState(page);await clickWorld(page,s.actors.find((a:{id:string})=>a.id==='blue').screen);await clickWorld(page,s.targetScreens[0].screen);}
    else{const s=await flatState(page);await dragTouch(page,s.items.find((i:{id:string})=>i.id==='blue'),s.targets[0]);}
    expect((await flatState(page)).completed).toBe(false);
    expect((await flatState(page)).targets[0].occupied).not.toBe(true);
    await expect.poll(async()=>(await flatState(page)).recovering).toBe(false);
    for(const color of ['red','blue','white'])await dropTouch(page,color,'color-home');
    await expect(page.locator('.touch-play')).toHaveAttribute('data-completed','true');
  }
});

test('探索档切屏、2D/3D切换、模型失败回退和重玩保留真实容错及记录 @smoke',async({page})=>{
  test.setTimeout(120000);await choose(page,'explore');await open(page,'M01',true);
  await page.getByRole('button',{name:'使用平面简化玩法',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  let s=await flatState(page);await dragTouch(page,s.items[0],{x:s.targets[0].x,y:s.targets[0].y+s.targets[0].h/2+20});
  expect((await flatState(page)).items[0].placed).toBe(false);
  await expect.poll(async()=>(await flatState(page)).recovering).toBe(false);
  await dropTouch(page,'car-0','bay-0');
  await page.setViewportSize({width:1000,height:760});
  await page.getByRole('button',{name:'打开立体玩法',exact:true}).click();
  await expect(world(page)).toHaveAttribute('data-ready','true',{timeout:45000});
  expect((await flatState(page)).items[0].placed).toBe(true);
  await dropTouch(page,'car-1','bay-1');
  await expect.poll(async()=>(await localRows(page,'sessions')).filter(r=>r.state==='completed'&&r.difficulty==='explore').length).toBe(1);
  await page.route(/\/models\/(?:play\/)?car01\.glb/,r=>r.abort());
  await page.getByRole('button',{name:'重新玩',exact:true}).click();
  await expect(touchCanvas(page)).toHaveAttribute('data-presentation','flat',{timeout:45000});
  await expect.poll(async()=>(await flatState(page)).ready).toBe(true);
  s=await flatState(page);await dragTouch(page,s.items[0],{x:s.targets[0].x,y:s.targets[0].y+s.targets[0].h/2+20});
  expect((await flatState(page)).items[0].placed).toBe(false);
  await expect.poll(async()=>(await flatState(page)).recovering).toBe(false);
  await dropTouch(page,'car-0','bay-0');await dropTouch(page,'car-1','bay-1');
  await expect.poll(async()=>(await localRows(page,'sessions')).filter(r=>r.state==='completed'&&r.difficulty==='explore').length).toBe(2);
});

test('平面部件两档保留相同大热点，边缘和中心均可准确探索 @smoke',async({page})=>{
  for(const mode of ['gentle','explore'] as const){
    await choose(page,mode);await open(page,'E02');
    const height=await touchCanvas(page).evaluate(c=>(c as HTMLCanvasElement).height);
    const rect={x:500,y:height*.49,w:900,h:405},regions=partRegions(content.cars.find(c=>c.id==='CAR01')!,rect),door=regions.find(p=>p.id==='door')!;
    await clickFlat(page,{x:door.x+door.rx*.95,y:door.y});
    expect((await flatState(page)).parts.includes('door')).toBe(true);
    for(const p of regions)await clickFlat(page,p);
    await expect(page.locator('.touch-play')).toHaveAttribute('data-completed','true');
  }
});

test('立体部件两档都准确响应真实部件网格 @smoke',async({page})=>{
  test.setTimeout(120000);
  for(const mode of ['gentle','explore'] as const){
    await choose(page,mode);await open(page,'E02',true);
    for(const part of ['wheel','door','light']){
      const s=await worldState(page);await clickWorld(page,s.partScreens[part]);
      await expect.poll(async()=>(await flatState(page)).parts.includes(part)).toBe(true);
    }
    await expect(page.locator('.touch-play')).toHaveAttribute('data-completed','true');
  }
});

for(const three of [false,true])test(`${three?'3D':'2D'} 同一擦洗动作探索档范围稍小，两档均能洗净两辆车 @smoke`,async({page})=>{
  test.setTimeout(180000);const washed:number[][]=[];
  let firstSurface:{x:number;y:number}|undefined,initialDirt=0;
  for(const mode of ['gentle','explore'] as const){
    await choose(page,mode);await open(page,'H03',three);
    const coverage:number[]=[];
    if(three){
      const s=await worldState(page),surface=s.dirt[Math.floor(s.dirt.length/2)];
      if(!firstSurface){firstSurface=surface;initialDirt=s.dirt.length;}
      else{expect(s.dirt.length).toBe(initialDirt);expect(surface.x).toBeCloseTo(firstSurface.x,5);expect(surface.y).toBeCloseTo(firstSurface.y,5);}
      const p=firstSurface!;
      // Approach the same patch over the actual body surface. Clicking exactly
      // on a patch can erase just that isolated patch with either radius.
      for(const dx of [.06,.05,.04,.03,.02,.01,0]){
        await clickWorld(page,{x:p.x+dx,y:p.y});coverage.push((await flatState(page)).progress);
      }
    }else{await dragTouch(page,{x:65,y:680*.4},{x:935,y:680*.4},4);coverage.push((await flatState(page)).progress);}
    const initial=await flatState(page);washed.push(coverage);
    expect(initial.progress).toBeGreaterThan(0);expect(initial.wash.clean).toBe(0);
    const canvas=three?world(page):touchCanvas(page);
    for(let car=0;car<2;car++){
      for(let press=0;press<100&&(await flatState(page)).wash.clean===car;press++)await canvas.press('Enter');
      expect((await flatState(page)).wash.clean).toBe(car+1);
      if(car===0){expect((await flatState(page)).wash.waiting).toBe(true);await canvas.press('Enter');}
    }
    await expect(page.locator('.touch-play')).toHaveAttribute('data-completed','true');
  }
  console.log('actual wash coverage',three?'3D':'2D',washed);
  expect(washed[1].some((coverage,i)=>coverage<washed[0][i])).toBe(true);
});
