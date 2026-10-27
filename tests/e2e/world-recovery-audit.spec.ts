import {test,expect,type Page} from '@playwright/test';
const world=(p:Page)=>p.locator('canvas.touch-world-canvas');
const state=async(p:Page)=>JSON.parse((await world(p).getAttribute('data-state'))!);
async function open(p:Page,id:string,car='CAR01'){await p.goto(`/#/play/${id}?car=${car}`);await expect(world(p)).toHaveAttribute('data-ready','true',{timeout:45000});}
test('立体部件键盘可完成，演示不消耗发现进度 @smoke',async({page})=>{
 test.setTimeout(90000);await open(page,'E02');const before=await state(page);
 await page.getByRole('button',{name:'看看怎么玩',exact:true}).click();await expect(page.getByRole('dialog',{name:'图示玩法'})).toBeVisible();
 await page.getByRole('button',{name:'下一步演示',exact:true}).click();await page.getByRole('button',{name:'我来试试，收起演示'}).click();
 expect((await state(page)).parts).toEqual(before.parts);expect((await state(page)).progress).toBe(0);
 for(let i=0;i<3;i++)await world(page).press('Enter');await expect(page.locator('.touch-play')).toHaveAttribute('data-completed','true');expect((await state(page)).parts.sort()).toEqual(['door','light','wheel']);
});
test('窄屏触屏拖车和中断取消可恢复，重新开始清零 @smoke',async({page})=>{
 test.setTimeout(90000);await page.setViewportSize({width:390,height:844});await open(page,'M01','CAR31');
 const initial=await state(page),b=(await world(page).boundingBox())!,actor=initial.actors.find((a:any)=>a.id==='car-0'),a={x:b.x+actor.screen.x*b.width,y:b.y+actor.screen.y*b.height};
 const input=await page.context().newCDPSession(page);await input.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});await input.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+25,y:a.y+20,id:1}]});await input.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 await expect.poll(async()=>(await state(page)).items).toEqual(initial.items);
 for(const id of ['car-0','car-1']){const s=await state(page),actor=s.actors.find((a:any)=>a.id===id),target=s.targetScreens.find((t:any)=>t.id===id.replace('car-','bay-')),rect=(await world(page).boundingBox())!,from={x:rect.x+actor.screen.x*rect.width,y:rect.y+actor.screen.y*rect.height},to={x:rect.x+target.screen.x*rect.width,y:rect.y+target.screen.y*rect.height};await input.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]});for(let n=1;n<=5;n++)await input.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*n/5,y:from.y+(to.y-from.y)*n/5,id:1}]});await input.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect.poll(async()=>(await state(page)).items.find((i:any)=>i.id===id).placed).toBe(true);}
 await input.detach();await expect(page.locator('.touch-play')).toHaveAttribute('data-completed','true');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'.private/r15-catalog-play-audit/mobile-parking.png'});
 await page.getByRole('button',{name:'重新玩',exact:true}).click();await expect(world(page)).toHaveAttribute('data-ready','true',{timeout:45000});await expect.poll(async()=>(await state(page)).progress).toBe(0);expect((await state(page)).items.every((i:any)=>!i.placed)).toBe(true);
});
test('历史重复收藏归并为一个车型，取消收藏不残留旧别名 @smoke',async({page})=>{
 test.setTimeout(90000);
 await page.goto('/#/parent');await expect(page.getByRole('heading',{name:'体验设置'})).toBeVisible();
 await page.evaluate(()=>new Promise<void>((resolve,reject)=>{const request=indexedDB.open('carplayground-local-v1');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('favorites','readwrite');for(const carId of ['CAR32','CAR33','CAR35'])tx.objectStore('favorites').put({carId,at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};}));
 await page.goto('/#/garage');await page.reload();const cars=page.locator('.favorite-grid > a');await expect(cars).toHaveCount(1);await expect(cars).toHaveAttribute('href','#/cars/CAR32');
 await cars.click();await page.getByRole('button',{name:'已放进车库',exact:true}).click();await expect(page.getByRole('button',{name:'我喜欢这辆车',exact:true})).toBeVisible();
 await page.reload();await expect(page.getByRole('button',{name:'我喜欢这辆车',exact:true})).toBeVisible({timeout:25000});
});

test('空白地面不能代替车身擦洗或部件触碰 @smoke',async({page})=>{
 test.setTimeout(90000);for(const id of ['E02','H03']){await open(page,id);const before=await state(page),b=(await world(page).boundingBox())!;for(const p of [{x:.04,y:.15},{x:.04,y:.85},{x:.96,y:.85}])await page.mouse.click(b.x+p.x*b.width,b.y+p.y*b.height);const after=await state(page);expect(after.progress).toBe(before.progress);expect(after.parts).toEqual(before.parts);expect(after.dirt.length).toBe(before.dirt.length);}
});
