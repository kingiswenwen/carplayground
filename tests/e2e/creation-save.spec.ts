import {expect,test} from '@playwright/test';
import {openTouch,dragTouch,touchState,localRows} from './touch-helpers';
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
 await openTouch(page,'A02');await dragTouch(page,(await touchState(page)).items[0],{x:680,y:250});await expect(page.getByText('这次记录暂时没保存。')).toBeVisible();
 await page.evaluate(()=>Reflect.set(window,'__failCreation',false));await page.getByRole('button',{name:'重试保存',exact:true}).click();await expect.poll(async()=>(await localRows(page,'creations')).length).toBe(1);
});
