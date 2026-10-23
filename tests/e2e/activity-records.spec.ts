import {expect,test,type Page} from '@playwright/test';
import {openTouch,dropTouch,dragTouch,touchState,touchPosition,completedTouch,localRows} from './touch-helpers';
async function gestures(page:Page,id:string){
 if(id==='E01')for(const color of ['red','blue','white'])await dropTouch(page,color,'color-home');
 else if(id==='M01'){await dropTouch(page,'car-0','bay-0');await dropTouch(page,'car-1','bay-1');}
 else if(id==='E02'){for(const p of [{x:764,y:391},{x:509,y:338},{x:860,y:321}]){const at=await touchPosition(page,p);await page.mouse.click(at.x,at.y);}}
 else{await dragTouch(page,(await touchState(page)).items.find(i=>i.id==='stamp-0')!,{x:200,y:220});await dragTouch(page,(await touchState(page)).items.find(i=>i.id==='stamp-1')!,{x:750,y:200});}
 await completedTouch(page);
}
test('直接操作的三项核心玩法初次建档失败可恢复，结果只保存一次 @smoke',async({page})=>{
 await page.addInitScript(()=>{Reflect.set(window,'__failSessions',true);const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args:Parameters<typeof put>){if(this.name==='sessions'&&Reflect.get(window,'__failSessions'))throw new DOMException('Simulated quota','QuotaExceededError');return put.apply(this,args);};});
 for(const id of ['E01','E02','M01']){
  await page.evaluate(()=>Reflect.set(window,'__failSessions',true));await openTouch(page,id);await gestures(page,id);await expect(page.getByRole('button',{name:'重试保存',exact:true})).toBeVisible();
  await page.evaluate(()=>Reflect.set(window,'__failSessions',false));await page.getByRole('button',{name:'重试保存',exact:true}).click();
  await expect.poll(async()=>(await localRows(page,'sessions')).filter(r=>r.activityId===id&&r.state==='completed').length).toBe(1);
 }
 await page.reload();expect((await localRows(page,'sessions')).filter(r=>r.state==='completed')).toHaveLength(3);
});
test('家长观察独立保存，失败不丢文字也不替孩子完成游戏 @smoke',async({page})=>{
 await page.addInitScript(()=>{Reflect.set(window,'__failObservation',true);const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args:Parameters<typeof put>){if(this.name==='observations'&&Reflect.get(window,'__failObservation'))throw new DOMException('Simulated quota','QuotaExceededError');return put.apply(this,args);};});
 await openTouch(page,'C01');await page.getByRole('button',{name:'给一起玩的家长',exact:true}).click();
 const note=page.getByRole('textbox',{name:'家长观察（可选）'});await note.fill('把车灯说成一片叶子');await page.getByRole('button',{name:'保存观察',exact:true}).click();
 await expect(page.getByText('观察暂时没保存，文字仍在，可以重试')).toBeVisible();await expect(note).toHaveValue('把车灯说成一片叶子');expect((await touchState(page)).completed).toBe(false);
 await page.evaluate(()=>Reflect.set(window,'__failObservation',false));await page.getByRole('button',{name:'保存观察',exact:true}).click();
 await expect.poll(async()=>(await localRows(page,'observations'))[0]?.text).toBe('把车灯说成一片叶子');
});
test('完成写入排队时离开，结果不会被退出或下一关覆盖 @smoke',async({page})=>{
 await openTouch(page,'C01');await expect.poll(async()=>(await localRows(page,'sessions')).length).toBe(1);
 await page.evaluate(()=>new Promise<void>((resolve,reject)=>{const request=indexedDB.open('carplayground-local-v1');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,transaction=db.transaction('sessions','readwrite'),store=transaction.objectStore('sessions');Reflect.set(window,'__holdSessionWrite',true);let started=false;const hold=()=>{const read=store.get('__hold__');read.onsuccess=()=>{if(!started){started=true;resolve();}if(Reflect.get(window,'__holdSessionWrite'))hold();};};transaction.oncomplete=()=>db.close();hold();};}));
 await gestures(page,'C01');await page.getByRole('link',{name:'回到乐园',exact:true}).click();await page.evaluate(()=>{location.hash='/play/C03?car=CAR03';});
 await expect.poll(async()=>(await touchState(page)).ready).toBe(true);await page.evaluate(()=>Reflect.set(window,'__holdSessionWrite',false));
 expect((await touchState(page)).completed).toBe(false);await gestures(page,'C03');
 await expect.poll(async()=>(await localRows(page,'sessions')).filter(r=>r.state==='participated').length).toBe(2);
 expect(new Set((await localRows(page,'sessions')).map(r=>r.id)).size).toBe(2);
});
