import {test,expect} from '@playwright/test';
import {openTouch,touchCanvas,touchState,touchPosition} from './touch-helpers';

test('无关车型图片失败不阻塞停车 @smoke',async({page})=>{
 await page.route('**/play-cars/toy-car15-*',route=>route.abort());
 await openTouch(page,'M01');
 await expect(page.getByRole('button',{name:'重新加载游戏跑车'})).toHaveCount(0);
});

test('键盘可以切换物件、停好第二辆车并取消移动 @smoke',async({page})=>{
 await openTouch(page,'M01');const canvas=touchCanvas(page);
 await canvas.press(']');await expect.poll(async()=>JSON.parse((await touchCanvas(page).getAttribute('data-state'))!).selected).toBe('car-0');
 await canvas.press(']');await expect.poll(async()=>JSON.parse((await touchCanvas(page).getAttribute('data-state'))!).selected).toBe('car-1');
 for(let i=0;i<8;i++)await canvas.press('ArrowDown');await canvas.press('Enter');
 await expect.poll(async()=>(await touchState(page)).items.find(i=>i.id==='car-1')!.placed).toBe(true);
 await canvas.press('[');const before=(await touchState(page)).items.find(i=>i.id==='car-0')!;
 await canvas.press('ArrowDown');await canvas.press('Escape');
 expect((await touchState(page)).items.find(i=>i.id==='car-0')).toEqual(before);
});

test('比较玩法取消拖动后两路都回到原位 @smoke',async({page})=>{
 await openTouch(page,'P01');const before=(await touchState(page)).items;
 await touchCanvas(page).evaluate(el=>el.addEventListener('pointerdown',event=>el.setAttribute('data-test-pointer',String((event as PointerEvent).pointerId)),{once:true}));
 const start=await touchPosition(page,before[0]);await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+100,start.y);
 await touchCanvas(page).dispatchEvent('pointercancel',{pointerId:Number(await touchCanvas(page).getAttribute('data-test-pointer'))});await page.mouse.up();
 expect((await touchState(page)).items).toEqual(before);
});

test('玩法图片超时提供重试，恢复后可以继续 @smoke',async({page})=>{
 test.setTimeout(45000);let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});let blocked=true;
 await page.route('**/play-cars/toy-car02-side.webp*',async route=>{if(blocked)await held;await route.continue();});
 try{
  await page.goto('/#/play/M01?car=CAR02',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('button',{name:'重新加载游戏跑车'})).toBeVisible({timeout:16000});
  blocked=false;release();await page.getByRole('button',{name:'重新加载游戏跑车'}).click();
  await expect.poll(async()=>(await touchState(page)).ready).toBe(true);
 }finally{release();}
});

test('玩法页面模块失败有恢复入口，重新打开保留原玩法 @smoke',async({page})=>{
 await page.goto('/#/explore');await expect(page.getByRole('link',{name:'小车回家',exact:true})).toBeVisible();
 let blocked=true;
 await page.route('**/*',route=>blocked&&route.request().resourceType()==='script'&&/TouchPlay[.-]/.test(route.request().url())?route.abort():route.continue());
 await page.getByRole('link',{name:'小车回家',exact:true}).click();
 await expect(page.getByRole('button',{name:'重新打开当前页面'})).toBeVisible();
 await page.screenshot({path:'.private/e2e-evidence/module-recovery.png'});
 blocked=false;await page.getByRole('button',{name:'重新打开当前页面'}).click();
 await expect.poll(async()=>(await touchState(page)).ready).toBe(true);
 await expect(page.locator('.touch-play')).toHaveAttribute('data-activity','M01');
});

// The direct-touch engine has fixed scene contents and always supports tap/drop.
test('家长设置不提供未接入玩法的难度与点选开关 @smoke',async({page})=>{
 await page.goto('/#/parent');
 await expect(page.getByRole('heading',{name:'体验设置'})).toBeVisible();
 await expect(page.getByRole('combobox')).toHaveCount(0);
 await expect(page.getByText('停车与装配可直接拖动',{exact:false})).toBeVisible();
 await expect(page.getByRole('checkbox',{name:/声音引导/})).toBeVisible();
});
