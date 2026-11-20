import {expect,test} from '@playwright/test';
import {openTouch,dragTouch,touchState,localRows,touchPosition} from './touch-helpers';
test('轮印边画边存，保存排队期间的新笔画最终保留 @smoke',async({page})=>{
 await openTouch(page,'A02');
 await page.evaluate(()=>new Promise<void>((resolve,reject)=>{const request=indexedDB.open('carplayground-local-v1');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,transaction=db.transaction('creations','readwrite'),store=transaction.objectStore('creations');Reflect.set(window,'__holdCreationWrite',true);let started=false;const hold=()=>{const read=store.get('__hold__');read.onsuccess=()=>{if(!started){started=true;resolve();}if(Reflect.get(window,'__holdCreationWrite'))hold();};};transaction.oncomplete=()=>db.close();hold();};}));
 await dragTouch(page,(await touchState(page)).items[0],{x:680,y:250});await page.waitForTimeout(350);
 await dragTouch(page,(await touchState(page)).items[0],{x:350,y:430});await page.waitForTimeout(350);
 await page.evaluate(()=>Reflect.set(window,'__holdCreationWrite',false));
 await expect.poll(async()=>((await localRows(page,'creations'))[0]?.marks as unknown[]|undefined)?.length||0).toBeGreaterThan(15);
 await page.goto('/#/garage');await page.reload();await expect(page.locator('.creation-card')).toHaveCount(1);await expect(page.locator('.creation-card .art-mark')).not.toHaveCount(0);
});
test('作品写入失败保留本次笔画，重试保存后仍可在车库找到 @smoke',async({page})=>{
 await page.addInitScript(()=>{Reflect.set(window,'__failCreation',true);const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args:Parameters<typeof put>){if(this.name==='creations'&&Reflect.get(window,'__failCreation'))throw new DOMException('Simulated quota','QuotaExceededError');return put.apply(this,args);};});
 await openTouch(page,'A02');await dragTouch(page,(await touchState(page)).items[0],{x:680,y:250});await expect(page.getByRole('button',{name:'重试保存',exact:true})).toBeVisible();
 await page.evaluate(()=>Reflect.set(window,'__failCreation',false));await page.getByRole('button',{name:'重试保存',exact:true}).click();await expect.poll(async()=>(await localRows(page,'creations')).length).toBe(1);
});

test('海报贴纸可以点放、重复拖贴和撤回，孩子主动保存才生成作品',async({page})=>{
 await openTouch(page,'A01');
 const stamp=await touchPosition(page,(await touchState(page)).items.find(i=>i.id==='stamp-0')!);
 const paper=await touchPosition(page,{x:240,y:240});
 await page.mouse.click(stamp.x,stamp.y);await page.mouse.click(paper.x,paper.y);
 let s=await touchState(page);
 await dragTouch(page,s.items.find(i=>i.id==='stamp-0')!,{x:760,y:300});
 const undo=page.getByRole('button',{name:'撤回',exact:true});
 await expect(undo).toBeEnabled();
 expect(await localRows(page,'creations')).toHaveLength(0);
 await undo.click();
 await page.getByRole('button',{name:'保存海报',exact:true}).click();
 await expect(page.getByRole('button',{name:'已保存',exact:true})).toBeVisible();
 await expect.poll(async()=>((await localRows(page,'creations'))[0]?.marks as {x:number}[]|undefined)?.length).toBe(1);
 expect(((await localRows(page,'creations'))[0].marks as {art?:string}[])[0].art).toBe('paper-sticker');
 const download=page.waitForEvent('download');
 await page.getByRole('button',{name:'下载图片',exact:true}).click();
 expect((await download).suggestedFilename()).toMatch(/^carplayground-poster-.*\.png$/);
 await page.goto('/#/garage');await expect(page.locator('.creation-card .art-mark')).toHaveCount(1);
});
