import {test,expect,type Page} from '@playwright/test';
async function words(page:Page){return page.evaluate(()=>{const words:string[]=[];const walker=document.createTreeWalker(document.getElementById('root')!,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const n=walker.currentNode,e=n.parentElement;if(!e||e.closest('.sr-only,[aria-hidden=true],details:not([open])')||!/[a-zA-Z\u3400-\u9fff]/.test(n.textContent||''))continue;const s=getComputedStyle(e),r=e.getBoundingClientRect();if(s.display!=='none'&&s.visibility!=='hidden'&&r.width>3&&r.height>3)words.push(n.textContent!);}return words;});}
test('儿童首页、选车、详情、车库、故事和玩法无需读文字 @smoke',async({page})=>{
 test.setTimeout(90000);await page.setViewportSize({width:390,height:844});
 for(const route of ['/explore','/cars','/cars/CAR01','/garage','/stories/ST01','/play/H03']){await page.goto('/#'+route);await expect(page.locator('.picture-world,.picture-showroom,.picture-detail,.picture-garage,.picture-story,.touch-play').first()).toBeVisible();await expect.poll(()=>words(page)).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.goto('/#/explore');await page.getByRole('link',{name:'泡泡洗车屋',exact:true}).click();await expect(page.locator('canvas.touch-canvas')).toHaveAttribute('data-state',/"ready":true/);await page.getByRole('link',{name:'回到乐园',exact:true}).click();await expect(page.locator('.picture-activities')).toBeVisible();
});
test('直接拖动立体车可看到前后左右，键盘和重新选车也能继续 @smoke',async({page})=>{
 test.setTimeout(120000);
 await page.goto('/#/cars/CAR01');await page.getByRole('button',{name:'打开车型立体模型'}).click();const canvas=page.locator('.vehicle-webgl:visible');await expect(canvas).toHaveAttribute('data-ready','true',{timeout:30000});
 if(await page.locator('.vehicle-webgl').count()){await canvas.click();await expect(canvas).toHaveAttribute('data-lights','on');await canvas.click();await expect(canvas).toHaveAttribute('data-lights','off');}
 const start=Number(await canvas.getAttribute('data-yaw'));const box=(await canvas.boundingBox())!;await page.mouse.move(box.x+box.width*.4,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.8,box.y+box.height*.5,{steps:4});await page.mouse.up();await expect.poll(async()=>Math.abs(Number(await canvas.getAttribute('data-yaw'))-start)).toBeGreaterThan(1);
 await canvas.focus();const before=Number(await canvas.getAttribute('data-yaw'));await canvas.press('ArrowLeft');await expect.poll(async()=>Number(await canvas.getAttribute('data-yaw'))).not.toBe(before);
});
test('离开立体查看后能重新选车并打开对应模型 @smoke',async({page})=>{
 test.setTimeout(120000);await page.goto('/#/cars/CAR01');await page.getByRole('button',{name:'打开车型立体模型'}).click();await expect(page.locator('.vehicle-webgl')).toHaveAttribute('data-ready','true',{timeout:30000});
 await page.getByRole('link',{name:'看车',exact:true}).click();await page.getByRole('button',{name:/选择.*911 GT3 RS/}).click();await page.getByRole('button',{name:'打开车型立体模型'}).click();await expect(page.locator('.vehicle-webgl:visible')).toHaveAttribute('data-car','CAR03',{timeout:30000});
});
test('WebGL不可用时回到同车型六角度图，不再显示通用车身 @smoke',async({page})=>{
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;Reflect.set(HTMLCanvasElement.prototype,'getContext',function(this:HTMLCanvasElement,type:string,...args:unknown[]){if(type.startsWith('webgl'))return null;return Reflect.apply(original,this,[type,...args]);});});
 await page.goto('/#/cars/CAR01');await page.getByRole('button',{name:'打开车型立体模型'}).click();await expect(page.locator('.vehicle-views')).toHaveAttribute('data-mode','pictures');await expect(page.locator('.vehicle-angle')).toHaveAttribute('data-ready','true',{timeout:30000});
 await page.getByRole('button',{name:'看后一个角度'}).click();await expect(page.locator('.vehicle-views')).toHaveAttribute('data-view','front');await expect(page.locator('.svg-vehicle')).toHaveCount(0);
});
test('没有对应模型的车保留外观图，切回已核对车型可继续立体观察 @smoke',async({page})=>{
 test.setTimeout(120000);
 await page.goto('/#/cars');await page.getByRole('button',{name:'打开车型立体模型'}).click();await expect(page.locator('.vehicle-webgl')).toHaveAttribute('data-ready','true',{timeout:30000});
 await page.getByRole('button',{name:/选择.*296 GTB/}).click();await expect(page.locator('.vehicle-views')).toHaveAttribute('data-mode','pictures');await expect(page.getByRole('button',{name:'打开车型立体模型'})).toHaveCount(0);
 await page.getByRole('button',{name:/选择.*911 GT3 RS/}).click();await expect(page.locator('.vehicle-webgl')).toHaveAttribute('data-car','CAR03',{timeout:30000});
});
test('模型网络失败后仍能看车，重试能恢复对应模型 @smoke',async({page})=>{
 test.setTimeout(120000);
 await page.route('**/media/models/car01.glb',route=>route.abort());await page.goto('/#/cars/CAR01');await page.getByRole('button',{name:'打开车型立体模型'}).click();await expect(page.locator('.vehicle-views')).toHaveAttribute('data-mode','pictures');
 await page.unroute('**/media/models/car01.glb');await page.getByRole('button',{name:'打开车型立体模型'}).click();await expect(page.locator('.vehicle-webgl')).toHaveAttribute('data-source','reviewed-gltf',{timeout:30000});
});
test('30辆车的前脸车尾两侧共180张新图都能实际打开 @photos',async({page})=>{
 test.setTimeout(180000);
 for(let i=1;i<=30;i++){const id='CAR'+String(i).padStart(2,'0');await page.goto('/#/cars/'+id);const viewer=page.locator('.vehicle-views'),picture=page.locator('.vehicle-angle'),control=page.getByRole('application',{name:'跑车多角度外观，左右拨动看前后和两侧'});for(const angle of ['front-left','front','front-right','right','rear','left']){await expect(viewer).toHaveAttribute('data-view',angle);await expect(picture).toHaveAttribute('src',new RegExp('car-turnarounds/'+id.toLowerCase()+'-'+angle+'.webp'));await expect.poll(()=>picture.evaluate(el=>(el as HTMLImageElement).complete&&(el as HTMLImageElement).naturalWidth===800)).toBe(true);await control.press('ArrowRight');}}
});
