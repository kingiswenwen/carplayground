import {test,expect,type Page} from '@playwright/test';
import {touchCanvas,touchPosition,dragTouch,localRows} from './touch-helpers';
const world=(p:Page)=>p.locator('canvas.touch-world-canvas');
const flat=async(p:Page)=>JSON.parse((await touchCanvas(p).getAttribute('data-state'))!);
const state=async(p:Page)=>JSON.parse((await world(p).getAttribute('data-state'))!);
async function ready(p:Page){await expect(world(p)).toHaveAttribute('data-ready','true',{timeout:45000});}
async function tap(p:Page,point:{x:number;y:number}){const b=(await world(p).boundingBox())!;await p.mouse.click(b.x+point.x*b.width,b.y+point.y*b.height);}
async function finishCar(p:Page,car:number){for(let n=0;n<110&&(await flat(p)).wash.clean===car;n++)await touchCanvas(p).press('Enter');expect((await flat(p)).wash.clean).toBe(car+1);}

test('局部洗车在横竖屏、反复2D/3D与WebGL失败回退保持同一污点集合 @smoke',async({page},info)=>{
  test.setTimeout(180000);await page.setViewportSize({width:1000,height:760});await page.goto('/#/play/H03?car=CAR01');await ready(page);
  const initial=await state(page);expect(initial.dirt.length).toBeGreaterThan(8);
  await tap(page,initial.dirt[Math.floor(initial.dirt.length/2)]);
  await expect.poll(async()=>(await flat(page)).progress).toBeGreaterThan(0);
  // Board state can commit before the next Three frame publishes its snapshot.
  // Wait for that real rendered population before retaining the resize baseline.
  await page.waitForFunction(count=>{const value=JSON.parse(document.querySelector('canvas.touch-world-canvas')?.getAttribute('data-state')||'{}');return Array.isArray(value.washPatchIds)&&value.washPatchIds.length<count;},initial.dirt.length,{timeout:5000});
  const partial=await state(page),progress=(await flat(page)).progress,ids=partial.washPatchIds.slice().sort((a:number,b:number)=>a-b);
  expect(progress).toBeLessThan(.5);expect(partial.wash.clean).toBe(0);expect(ids.length).toBeLessThan(initial.dirt.length);
  for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1000,height:760}]){
    await page.setViewportSize(viewport);
    // Match the new surface, not the old ready canvas before React unmounts it.
    await expect.poll(async()=>(await state(page))?.boardHeight,{timeout:45000}).toBe(viewport.width<=600?1200:680);
    await ready(page);
    await expect.poll(async()=>(await state(page))?.washPatchIds?.slice().sort((a:number,b:number)=>a-b)).toEqual(ids);
    expect((await flat(page)).progress).toBe(progress);
  }
  for(let n=0;n<3;n++){
    await page.getByRole('button',{name:'使用平面简化玩法',exact:true}).click();
    expect((await flat(page)).progress).toBe(progress);
    await page.getByRole('button',{name:'打开立体玩法',exact:true}).click();await ready(page);
    expect((await state(page)).washPatchIds.slice().sort((a:number,b:number)=>a-b)).toEqual(ids);
    expect((await flat(page)).progress).toBe(progress);
  }
  await page.getByRole('button',{name:'使用平面简化玩法',exact:true}).click();
  await dragTouch(page,{x:65,y:272},{x:935,y:272},10);
  const afterFlat=(await flat(page)).progress;expect(afterFlat).toBeGreaterThanOrEqual(progress);expect(afterFlat).toBeLessThan(.5);
  await page.getByRole('button',{name:'打开立体玩法',exact:true}).click();await ready(page);
  expect((await flat(page)).progress).toBe(afterFlat);
  expect((await state(page)).dirt.length).toBe(Math.round(initial.dirt.length*(1-afterFlat*2)));
  await world(page).dispatchEvent('webglcontextlost');
  await expect(touchCanvas(page)).toHaveAttribute('data-presentation','flat');expect((await flat(page)).progress).toBe(afterFlat);
  await finishCar(page,0);expect((await flat(page)).wash.waiting).toBe(true);
  const next=(await flat(page)).items.find((i:{id:string})=>i.id==='next-car'),at=await touchPosition(page,next);await page.mouse.click(at.x,at.y);
  expect((await flat(page)).progress).toBe(.5);expect((await flat(page)).wash).toEqual({clean:1,waiting:false});
  await touchCanvas(page).press('Enter');expect((await flat(page)).progress).toBeGreaterThan(.5);expect((await flat(page)).progress).toBeLessThan(1);
  await finishCar(page,1);await expect(page.locator('.touch-play')).toHaveAttribute('data-completed','true');
  await expect.poll(async()=>(await localRows(page,'sessions')).filter(r=>r.activityId==='H03'&&r.state==='completed').length).toBe(1);
  await page.screenshot({path:info.outputPath('shared-wash-complete.png')});
});

test('先平面局部擦洗再进入立体不能重置或免费获得进度 @smoke',async({page})=>{
  test.setTimeout(90000);await page.goto('/#/play/H03?car=CAR01&view=2d');await expect.poll(async()=>(await flat(page)).ready).toBe(true);
  await touchCanvas(page).press('Enter');const partial=(await flat(page)).progress;expect(partial).toBeGreaterThan(0);expect(partial).toBeLessThan(.5);
  await page.getByRole('button',{name:'打开立体玩法',exact:true}).click();await ready(page);expect((await flat(page)).progress).toBe(partial);
  const before=(await state(page)).dirt.length;await tap(page,{x:.02,y:.02});expect((await flat(page)).progress).toBe(partial);
  await tap(page,(await state(page)).dirt[0]);await expect.poll(async()=>(await state(page)).dirt.length).toBeLessThan(before);
  expect((await flat(page)).progress).toBeGreaterThan(partial);expect((await flat(page)).wash.clean).toBe(0);
});
