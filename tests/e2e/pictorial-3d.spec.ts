import {test,expect} from '@playwright/test';
test('发布包模型分块损坏时可重试并恢复原模型 @smoke',async({page})=>{
 test.skip(!process.env.PLAYWRIGHT_BASE_URL,'分块交付用于构建后的发布包');test.setTimeout(90000);
 const pattern='**/models/car01.glb.part-001.bin';let intercepted=false;
 await page.route(pattern,async route=>{intercepted=true;const response=await route.fetch(),bytes=await response.body();bytes[0]^=1;await route.fulfill({response,body:bytes});});
 await page.goto('/#/cars/CAR01');
 const retry=page.getByRole('button',{name:'重试立体模型'});
 await expect(retry).toBeVisible();
 await expect.poll(()=>intercepted).toBe(true);
 await page.unroute(pattern);await retry.click();
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
 await canvas.press('+');await expect(canvas).toHaveAttribute('data-zoom','125');
 await canvas.press('Home');await expect(canvas).toHaveAttribute('data-zoom','100');
 const wheel=await canvas.evaluate(node=>{
  const pinch=new WheelEvent('wheel',{deltaY:-50,ctrlKey:true,bubbles:true,cancelable:true});
  const scroll=new WheelEvent('wheel',{deltaY:50,bubbles:true,cancelable:true});
  node.dispatchEvent(pinch);node.dispatchEvent(scroll);
  return {pinch:pinch.defaultPrevented,scroll:scroll.defaultPrevented};
 });
 expect(wheel).toEqual({pinch:true,scroll:false});
 await expect.poll(async()=>Number(await canvas.getAttribute('data-zoom'))).toBeGreaterThan(140);
 await page.getByRole('link',{name:'回到选车',exact:true}).click();
 await page.getByRole('button',{name:/选择.*911 GT3 RS/}).click();
 await expect(canvas).toHaveAttribute('data-car','CAR03',{timeout:45000});
 await expect(canvas).toHaveAttribute('data-zoom','100');
});
test('离开立体查看后能重新选车并打开对应模型 @smoke',async({page})=>{
 test.setTimeout(120000);await page.goto('/#/cars/CAR01');await expect(page.locator('.vehicle-webgl')).toHaveAttribute('data-ready','true',{timeout:30000});
 await page.getByRole('link',{name:'看车',exact:true}).click();await page.getByRole('button',{name:/选择.*911 GT3 RS/}).click();await expect(page.locator('.vehicle-webgl:visible')).toHaveAttribute('data-car','CAR03',{timeout:30000});
});
test('WebGL不可用时可以读车型资料，也可以重试立体模型 @smoke',async({page})=>{
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;Reflect.set(window,'__webglAttempts',0);Reflect.set(HTMLCanvasElement.prototype,'getContext',function(this:HTMLCanvasElement,type:string,...args:unknown[]){if(type.startsWith('webgl')){Reflect.set(window,'__webglAttempts',Reflect.get(window,'__webglAttempts')+1);return null;}return Reflect.apply(original,this,[type,...args]);});});
 await page.goto('/#/cars/CAR01');
 const retry=page.getByRole('button',{name:'重试立体模型'});
 await expect(retry).toBeVisible();
 await expect(page.getByRole('region',{name:'车型详情'})).toContainText('三台电动机');
 await expect(page.locator('.vehicle-poster,.vehicle-angle,.vehicle-webgl')).toHaveCount(0);
 const attempts=await page.evaluate(()=>Reflect.get(window,'__webglAttempts') as number);
 await retry.click();
 await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__webglAttempts') as number)).toBeGreaterThan(attempts);
 await expect(retry).toBeVisible();
 await page.getByRole('link',{name:'看车',exact:true}).click();
 await page.getByRole('button',{name:/选择.*911 GT3 RS/}).click();
 await expect(page.locator('.vehicle-views')).toHaveAttribute('data-car','CAR03');
 await expect(retry).toBeVisible();
 await page.getByRole('button',{name:'车型详情',exact:true}).click();
 await expect(page.getByRole('region',{name:'车型详情'})).toContainText('911 GT3 RS');
});
test('已移除车型的旧链接回到入口，保留车型可继续立体观察 @smoke',async({page})=>{
 test.setTimeout(120000);
 await page.goto('/#/cars');await expect(page.locator('.vehicle-webgl')).toHaveAttribute('data-ready','true',{timeout:30000});
 await page.goto('/#/cars/CAR02');await expect(page.getByRole('link',{name:'回到乐园',exact:true})).toBeVisible();await expect(page.locator('.vehicle-views')).toHaveCount(0);
 await page.goto('/#/cars/CAR03');await expect(page.locator('.vehicle-webgl')).toHaveAttribute('data-car','CAR03',{timeout:30000});
});
test('模型网络失败后仍可浏览资料，重试能恢复对应模型 @smoke',async({page})=>{
 test.setTimeout(120000);
 await page.route('**/models/car01.glb*',route=>route.abort());await page.goto('/#/cars/CAR01');
 const retry=page.getByRole('button',{name:'重试立体模型'});
 await expect(retry).toBeVisible();
 await page.unroute('**/models/car01.glb*');await retry.click();await expect(page.locator('.vehicle-webgl')).toHaveAttribute('data-source','reviewed-gltf',{timeout:30000});
});
