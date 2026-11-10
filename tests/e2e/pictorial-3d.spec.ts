import fs from 'node:fs';
const turnarounds=JSON.parse(fs.readFileSync('content/car-turnarounds-production.json','utf8')) as {id:string}[];
import {test,expect} from '@playwright/test';
test('发布包模型分块损坏会回到同车图片，重试后恢复原模型 @smoke',async({page})=>{
 test.skip(!process.env.PLAYWRIGHT_BASE_URL,'分块交付用于构建后的发布包');test.setTimeout(90000);
 const pattern='**/models/car01.glb.part-001.bin';let intercepted=false;
 await page.route(pattern,async route=>{intercepted=true;const response=await route.fetch(),bytes=await response.body();bytes[0]^=1;await route.fulfill({response,body:bytes});});
 await page.goto('/#/cars/CAR01');await expect(page.locator('.vehicle-views')).toHaveAttribute('data-mode','pictures');
 await expect.poll(()=>intercepted).toBe(true);await expect(page.locator('.vehicle-angle')).toBeVisible();
 await page.unroute(pattern);await page.getByRole('button',{name:'打开车型立体模型',exact:true}).click();
 await expect(page.locator('.vehicle-webgl[data-ready=true]')).toHaveAttribute('data-car','CAR01',{timeout:45000});
});
test('儿童页面保留图像入口与直接操作，短标签不替代物体 @smoke',async({page})=>{
 test.setTimeout(90000);await page.setViewportSize({width:390,height:844});
 for(const route of ['/explore','/cars','/cars/CAR01','/garage','/stories/ST01','/play/H03']){
  await page.goto('/#'+route);
  await expect(page.locator('.picture-world,.picture-showroom,.picture-detail,.picture-garage,.picture-story,.touch-play').first()).toBeVisible();
  await expect(page.locator('h1')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.goto('/#/explore');await page.getByRole('link',{name:'泡泡洗车屋',exact:true}).click();
 await expect(page.locator('[data-town-place=wash]')).toBeVisible();
 await page.getByRole('link',{name:'泡泡洗车屋',exact:true}).click();
 await expect(page.locator('canvas.touch-canvas')).toHaveAttribute('data-state',/"ready":true/);
 await page.getByRole('link',{name:'回到乐园',exact:true}).click();await expect(page.locator('.picture-activities')).toBeVisible();
});
test('直接拖动立体车可看到前后左右，键盘和重新选车也能继续 @smoke',async({page})=>{
 test.setTimeout(120000);
 await page.goto('/#/cars/CAR01');const canvas=page.locator('.vehicle-webgl:visible');await expect(canvas).toHaveAttribute('data-ready','true',{timeout:30000});
 if(await page.locator('.vehicle-webgl').count()){await canvas.click();await expect(canvas).toHaveAttribute('data-lights','on');await canvas.click();await expect(canvas).toHaveAttribute('data-lights','off');}
 // Prove keyboard rotation from a static view, independently of drag inertia.
 // Native locator assertions avoid traced Node/CDP getter polling overhead.
 await canvas.focus();const beforeLeft=(await canvas.getAttribute('data-yaw'))!;await canvas.press('ArrowLeft');await expect(canvas).not.toHaveAttribute('data-yaw',beforeLeft);
 const beforeRight=(await canvas.getAttribute('data-yaw'))!;await canvas.press('ArrowRight');await expect(canvas).not.toHaveAttribute('data-yaw',beforeRight);
 let previous=Number(await canvas.getAttribute('data-yaw')),travelled=0;const box=(await canvas.boundingBox())!;
 await page.mouse.move(box.x+box.width*.4,box.y+box.height*.5);await page.mouse.down();
 // Responsive studio ratios can rotate through almost a full turn. Measure the
 // rendered path, so a final angle near its start does not look like no input.
 for(let n=1;n<=4;n++){
  await page.mouse.move(box.x+box.width*(.4+n*.1),box.y+box.height*.5);
  await expect(canvas).not.toHaveAttribute('data-yaw',String(previous));
  const current=Number(await canvas.getAttribute('data-yaw'));
  travelled+=Math.abs(Math.atan2(Math.sin(current-previous),Math.cos(current-previous)));previous=current;
 }
 await page.mouse.up();expect(travelled).toBeGreaterThan(1);
 const afterDrag=(await canvas.getAttribute('data-yaw'))!;await canvas.press('ArrowLeft');await expect(canvas).not.toHaveAttribute('data-yaw',afterDrag);
});
test('离开立体查看后能重新选车并打开对应模型 @smoke',async({page})=>{
 test.setTimeout(120000);await page.goto('/#/cars/CAR01');await expect(page.locator('.vehicle-webgl')).toHaveAttribute('data-ready','true',{timeout:30000});
 await page.getByRole('link',{name:'看车',exact:true}).click();await page.getByRole('button',{name:/选择.*911 GT3 RS/}).click();await expect(page.locator('.vehicle-webgl:visible')).toHaveAttribute('data-car','CAR03',{timeout:30000});
});
test('WebGL不可用时回到同车型六角度图，不再显示通用车身 @smoke',async({page})=>{
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;Reflect.set(window,'__webglAttempts',0);Reflect.set(HTMLCanvasElement.prototype,'getContext',function(this:HTMLCanvasElement,type:string,...args:unknown[]){if(type.startsWith('webgl')){Reflect.set(window,'__webglAttempts',Reflect.get(window,'__webglAttempts')+1);return null;}return Reflect.apply(original,this,[type,...args]);});});
 await page.goto('/#/cars/CAR01');await expect(page.locator('.vehicle-views')).toHaveAttribute('data-mode','pictures');await expect(page.locator('.vehicle-angle')).toHaveAttribute('data-ready','true',{timeout:30000});
 await page.getByRole('button',{name:'看后一个角度'}).click();await expect(page.locator('.vehicle-views')).toHaveAttribute('data-view','front');await expect(page.locator('.svg-vehicle')).toHaveCount(0);
 const attempts=await page.evaluate(()=>Reflect.get(window,'__webglAttempts') as number);
 await page.getByRole('button',{name:'打开车型立体模型',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__webglAttempts') as number)).toBeGreaterThan(attempts);
 await expect(page.locator('.vehicle-views')).toHaveAttribute('data-mode','pictures');
 await page.getByRole('link',{name:'看车',exact:true}).click();
 await page.getByRole('button',{name:/选择.*911 GT3 RS/}).click();
 await expect(page.locator('.vehicle-views')).toHaveAttribute('data-car','CAR03');
 await expect(page.locator('.vehicle-views')).toHaveAttribute('data-mode','pictures');
 await expect(page.locator('.vehicle-angle')).toHaveAttribute('data-ready','true');
});
test('已移除车型的旧链接回到入口，保留车型可继续立体观察 @smoke',async({page})=>{
 test.setTimeout(120000);
 await page.goto('/#/cars');await expect(page.locator('.vehicle-webgl')).toHaveAttribute('data-ready','true',{timeout:30000});
 await page.goto('/#/cars/CAR02');await expect(page.getByRole('link',{name:'回到乐园',exact:true})).toBeVisible();await expect(page.locator('.vehicle-views')).toHaveCount(0);
 await page.goto('/#/cars/CAR03');await expect(page.locator('.vehicle-webgl')).toHaveAttribute('data-car','CAR03',{timeout:30000});
});
test('模型网络失败后仍能看车，重试能恢复对应模型 @smoke',async({page})=>{
 test.setTimeout(120000);
 await page.route('**/models/car01.glb*',route=>route.abort());await page.goto('/#/cars/CAR01');await expect(page.locator('.vehicle-views')).toHaveAttribute('data-mode','pictures');
 await page.unroute('**/models/car01.glb*');await page.getByRole('button',{name:'打开车型立体模型'}).click();await expect(page.locator('.vehicle-webgl')).toHaveAttribute('data-source','reviewed-gltf',{timeout:30000});
});
test('保留的生成角度图可读取，图片查看可键盘拨动 @photos',async({page,request})=>{
 test.setTimeout(120000);
 await page.goto('/#/cars/CAR03');await page.getByRole('button',{name:'回到多角度外观图',exact:true}).click();await expect(page.locator('.vehicle-angle')).toHaveAttribute('data-ready','true');const image=await page.locator('.vehicle-angle').getAttribute('src'),base=image!.slice(0,image!.lastIndexOf('/')+1);
 for(const car of turnarounds)for(const angle of ['front-left','front','front-right','left','rear','right']){const id=car.id.toLowerCase(),r=await request.get(`${base}${id}-${angle}.webp`);expect(r.ok()).toBe(true);expect(r.headers()['content-type']).toContain('image');}
 await page.goto('/#/cars/CAR03');const viewer=page.locator('.vehicle-views');await expect(viewer).toBeVisible();if(await viewer.getAttribute('data-mode')==='model')await page.getByRole('button',{name:'回到多角度外观图',exact:true}).click();const control=page.getByRole('application',{name:'跑车多角度外观，左右拨动看前后和两侧'});for(const angle of ['front-left','front','front-right','right','rear','left']){await expect(viewer).toHaveAttribute('data-view',angle);await control.press('ArrowRight');}
});
