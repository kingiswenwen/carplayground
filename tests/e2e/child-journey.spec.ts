import{test,expect}from'@playwright/test';
import fs from 'node:fs';
import{openTouch,dropTouch,completedTouch,touchState,touchCanvas,localRows,touchPosition,partTouchPoints}from'./touch-helpers';

test('完成后主动选下一站，保留爱车、记录与重玩选择 @smoke',async({page})=>{
 await page.setViewportSize({width:390,height:844});await openTouch(page,'M01','CAR30');
 await expect(page.getByRole('region',{name:'小车接下来想去哪里'})).toHaveCount(0);
 await dropTouch(page,'car-0','bay-0');await dropTouch(page,'car-1','bay-1');await completedTouch(page);
 const next=page.getByRole('link',{name:'接着玩：还缺几个车位',exact:true});await expect(next).toBeVisible();
 const b=(await next.boundingBox())!;expect(b.width).toBeGreaterThanOrEqual(100);expect(b.y+b.height).toBeLessThanOrEqual(844);
 // Free play is still available. Replaying does not silently advance the route.
 await page.getByRole('button',{name:'重新玩',exact:true}).click();
 await expect.poll(async()=>(await touchState(page)).ready).toBe(true);await expect.poll(async()=>(await touchState(page)).completed).toBe(false);
 await dropTouch(page,'car-0','bay-0');await dropTouch(page,'car-1','bay-1');await completedTouch(page);await next.click();
 await expect(page).toHaveURL(/play\/M02\?car=CAR30/);await expect(page.locator('.touch-play')).toHaveAttribute('data-activity','M02');await expect.poll(async()=>(await touchState(page)).ready).toBe(true);
 expect((await touchState(page)).completed).toBe(false);
 await expect.poll(async()=>(await localRows(page,'sessions')).filter(r=>r.activityId==='M01'&&r.state==='completed').length).toBe(2);
});

test('故事完成玩法回到下一幕，不被普通下一站替换，刷新仍保留进度 @smoke',async({page})=>{
 await page.goto('/#/stories/ST01?step=1');await page.getByRole('link',{name:'一起玩：小车回家',exact:true}).click();
 await expect(page.locator('canvas.touch-world-canvas')).toHaveAttribute('data-ready','true',{timeout:45000});
 await expect.poll(async()=>(await touchState(page)).ready).toBe(true);
 await dropTouch(page,'car-0','bay-0');await dropTouch(page,'car-1','bay-1');await completedTouch(page);
 await expect(page.getByRole('region',{name:'小车接下来想去哪里'})).toHaveCount(0);
 await page.locator('.touch-bottom').getByRole('link',{name:'继续故事',exact:true}).click();
 await expect(page.locator('.picture-story')).toHaveAttribute('data-frame','2');await page.reload();
 await expect(page.locator('.picture-story')).toHaveAttribute('data-frame','2');
 await page.getByRole('button',{name:'跳过玩法，继续故事',exact:true}).click();
 await expect(page.locator('.picture-story')).toHaveAttribute('data-frame','3');await page.reload();
 await expect(page.locator('.picture-story')).toHaveAttribute('data-frame','3');
 await page.getByRole('button',{name:'故事看完啦',exact:true}).click();
 await expect(page.getByRole('button',{name:'故事的小脚印已记下',exact:true})).toBeVisible();await page.reload();
 await expect(page.getByRole('button',{name:'故事的小脚印已记下',exact:true})).toBeVisible();
});

test('颜色触碰请求英文，完成队列先请求最后一个词 @smoke',async({page})=>{
 await openTouch(page,'E01');await page.getByRole('button',{name:'开启声音',exact:true}).click();
 const source=()=>page.evaluate(()=>{const howler=Reflect.get(window,'Howler') as unknown as {_howls:{_src:string}[]};return howler._howls.map(h=>h._src);});
 // Hold audio responses so the exact first clip in each queue can be inspected.
 await page.route('**/media/**/*.mp3',route=>route.abort());
 // Request observation proves the word is requested by a real object gesture.
 const requests:string[]=[];page.on('request',request=>{if(request.url().endsWith('.mp3'))requests.push(request.url());});
 const content=JSON.parse(fs.readFileSync('content/r3.json','utf8')) as {assets:{id:string;path:string}[]};
 const wordPath=(id:string)=>content.assets.find(a=>a.id===id)!.path.replace(/^media\//,'');
 const blue=(await touchState(page)).items.find(i=>i.id==='blue')!,at=await touchPosition(page,blue);await page.mouse.click(at.x,at.y);
 await expect.poll(()=>requests.some(url=>url.endsWith(wordPath('blue')))).toBe(true);
 // Restore actual media and complete the task; white must be the queued first word.
 await page.unroute('**/media/**/*.mp3');
 for(const color of ['red','blue','white'])await dropTouch(page,color,'color-home');
 await completedTouch(page);await expect.poll(source).toEqual(expect.arrayContaining([expect.stringContaining(wordPath('white'))]));
 expect((await touchState(page)).progress).toBe(1);
 await expect(page.getByRole('link',{name:'接着玩：小车回家',exact:true})).toBeVisible();
 await expect(touchCanvas(page)).toBeVisible();
});


test('记录失败仍可去下一站，并能恢复上一站原结果 @smoke',async({page})=>{
 await page.addInitScript(()=>{Reflect.set(window,'__failSessions',true);const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args:Parameters<typeof put>){if(this.name==='sessions'&&Reflect.get(window,'__failSessions'))throw new DOMException('Simulated quota','QuotaExceededError');return put.apply(this,args);};});
 await openTouch(page,'M01');await dropTouch(page,'car-0','bay-0');await dropTouch(page,'car-1','bay-1');await completedTouch(page);
 await expect(page.getByRole('button',{name:'重试保存',exact:true})).toBeVisible();
 await page.getByRole('link',{name:'接着玩：还缺几个车位',exact:true}).click();
 await expect.poll(async()=>(await touchState(page)).ready).toBe(true);
 await expect(page.getByRole('button',{name:'重试保存',exact:true})).toBeVisible();
 await page.evaluate(()=>Reflect.set(window,'__failSessions',false));await page.getByRole('button',{name:'重试保存',exact:true}).click();
 await expect.poll(async()=>(await localRows(page,'sessions')).filter(r=>r.activityId==='M01'&&r.state==='completed').length).toBe(1);
 expect((await touchState(page)).completed).toBe(false);await page.reload();
 await expect.poll(async()=>(await localRows(page,'sessions')).filter(r=>r.activityId==='M01'&&r.state==='completed').length).toBe(1);
});


test('30辆玩具车均可装车身和两轮，并触碰全部三个部件 @smoke',async({page})=>{
 test.setTimeout(240000);
 const content=JSON.parse(fs.readFileSync('content/r3.json','utf8')) as {cars:{id:string}[]};
 for(const car of content.cars){
  await openTouch(page,'T04',car.id);await dropTouch(page,'body','body');await dropTouch(page,'wheel-0','wheel-0');await dropTouch(page,'wheel-1','wheel-1');await completedTouch(page);
  await openTouch(page,'E02',car.id);for(const point of partTouchPoints(car.id)){const at=await touchPosition(page,point);await page.mouse.click(at.x,at.y);}await completedTouch(page);
 }
});
