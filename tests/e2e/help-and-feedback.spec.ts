import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {openTouch,touchCanvas,touchState,touchPosition,dropTouch,dragTouch,completedTouch} from './touch-helpers';

test('按需三步演示不自动出现、不代操作，关掉后仍能自己停车 @smoke',async({page})=>{
 await openTouch(page,'M01','CAR01');await expect(page.getByRole('dialog',{name:'图示玩法'})).toHaveCount(0);
 const initial=await touchState(page);await page.getByRole('button',{name:'看看怎么玩',exact:true}).click();
 const guide=page.getByRole('dialog',{name:'图示玩法'});await expect(guide).toBeVisible();await expect(guide.locator('.guide-frame')).toHaveCount(3);
 await guide.getByRole('button',{name:'下一步演示',exact:true}).click();await guide.getByRole('button',{name:'下一步演示',exact:true}).click();
 await expect(guide.getByRole('button',{name:/第3步/})).toHaveAttribute('aria-pressed','true');
 expect((await touchState(page)).items).toEqual(initial.items);expect((await touchState(page)).progress).toBe(0);
 await guide.getByRole('button',{name:'我来试试，收起演示',exact:true}).click();await expect(guide).toHaveCount(0);
 await dropTouch(page,'car-0','bay-0');expect((await touchState(page)).completed).toBe(false);
 await page.getByRole('button',{name:'看看怎么玩',exact:true}).click();
 await expect(page.getByRole('button',{name:/第1步：找到奥迪/})).toBeVisible();
 await page.keyboard.press('Escape');await expect(guide).toHaveCount(0);await dropTouch(page,'car-1','bay-1');await completedTouch(page);
});

test('26个玩法的图示都可翻页，演示不改变真实场景或完成进度 @smoke',async({page})=>{
 test.setTimeout(90000);const ids=JSON.parse(fs.readFileSync('content/r3.json','utf8')).activities.map((a:{id:string})=>a.id);
 for(const id of ids){
  await openTouch(page,id);const before=await touchState(page);
  await page.getByRole('button',{name:'看看怎么玩',exact:true}).click();const guide=page.getByRole('dialog',{name:'图示玩法'});
  await expect(guide.locator('.guide-demonstration canvas')).toBeVisible();await guide.getByRole('button',{name:'下一步演示',exact:true}).click();await guide.getByRole('button',{name:'下一步演示',exact:true}).click();
  expect((await touchState(page)).items,`${id} real objects`).toEqual(before.items);expect((await touchState(page)).progress,`${id} real progress`).toBe(before.progress);
  await guide.getByRole('button',{name:'演示看完了，我来试试',exact:true}).click();await expect(guide).toHaveCount(0);
 }
});

test('手机图示的大图和下一步控件完整可见，减少动态效果时仍可操作 @smoke',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await openTouch(page,'T04');
 await page.getByRole('button',{name:'看看怎么玩',exact:true}).click();const guide=page.getByRole('dialog',{name:'图示玩法'});
 await expect(guide).toBeVisible();const box=(await guide.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(844);
 const next=guide.getByRole('button',{name:'下一步演示',exact:true});await expect(next).toBeInViewport();await next.click();await expect(guide.getByRole('button',{name:/第2步/})).toHaveAttribute('aria-pressed','true');
 await page.setViewportSize({width:844,height:390});await expect(next).toBeInViewport();await expect.poll(async()=>guide.locator('.guide-demonstration canvas').evaluate(c=>(c as HTMLCanvasElement).height)).toBe(680);
 await page.keyboard.press('Escape');await expect(guide).toHaveCount(0);expect((await touchState(page)).progress).toBe(0);
});

test('表达玩法重玩后反馈会改变，也不再请求统一的谢谢分享语音 @smoke',async({page})=>{
 const requests:string[]=[];page.on('request',r=>{if(r.url().endsWith('.mp3'))requests.push(r.url());});
 await openTouch(page,'C01');await page.getByRole('button',{name:'开启声音',exact:true}).click();
 const finish=async()=>{const H=await touchCanvas(page).evaluate(c=>(c as HTMLCanvasElement).height);for(let i=0;i<2;i++){const state=await touchState(page);await dragTouch(page,state.items.find(x=>x.id===`stamp-${i}`)!,{x:300+i*300,y:H*.35});}await completedTouch(page);};
 await finish();const first=await page.locator('.completion-replay .sr-only').textContent();await expect(page.getByRole('button',{name:'重听这次发现',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'重新玩',exact:true}).click();await expect.poll(async()=>(await touchState(page)).progress).toBe(0);await finish();
 const second=await page.locator('.completion-replay .sr-only').textContent();expect(second).not.toBe(first);expect(first).not.toContain('谢谢');expect(second).not.toContain('谢谢');
 expect(requests.some(url=>/expression-done|discovery-done/.test(url))).toBe(false);
});

test('看车时换车保留立体模式，显示当前选中的车型 @smoke',async({page})=>{
 test.setTimeout(120000);
 await page.goto('/#/cars');await expect(page.locator('.vehicle-webgl[data-ready=true]:visible')).toHaveAttribute('data-car','CAR01',{timeout:45000});
 for(const [name,id]of [['奥迪 R8 Coupé','CAR11'],['保时捷 911 GT3 RS','CAR03'],['兰博基尼 Revuelto','CAR01']]){
  await page.getByRole('button',{name:`选择 ${name}，有独立立体模型`,exact:true}).click();await expect(page.locator('.vehicle-views')).toHaveAttribute('data-mode','model');
  await expect(page.locator('.vehicle-webgl[data-ready=true]:visible')).toHaveAttribute('data-car',id,{timeout:30000});
 }
});

test('红绿灯求助跟随当前阶段，出发之后示范点灯停止 @smoke',async({page})=>{
 await openTouch(page,'E03');
 const tapSignal=async()=>{const signal=(await touchState(page)).items.find(i=>i.id==='signal')!,at=await touchPosition(page,signal);await page.mouse.click(at.x,at.y);};
 const help=page.getByRole('button',{name:'看看怎么玩',exact:true});
 await help.click();await expect(page.getByRole('button',{name:'第1步：找到信号灯',exact:true})).toBeVisible();await page.keyboard.press('Escape');
 await tapSignal();await help.click();await page.getByRole('button',{name:'下一步演示',exact:true}).click();
 await expect(page.locator('.guide-demonstration canvas')).toHaveAttribute('aria-label','向前推一推');await page.keyboard.press('Escape');
 await dragTouch(page,(await touchState(page)).items[0],{x:650,y:340});await help.click();
 await expect(page.getByRole('button',{name:'第1步：找到信号灯',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'下一步演示',exact:true}).click();await expect(page.locator('.guide-demonstration canvas')).toHaveAttribute('aria-label','轻轻点一下');
 await page.keyboard.press('Escape');await tapSignal();await completedTouch(page);
});
