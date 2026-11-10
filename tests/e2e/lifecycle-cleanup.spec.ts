import {test,expect,type Page} from '@playwright/test';

async function listenerCounter(page:Page){
 const cdp=await page.context().newCDPSession(page);
 const documentId=(await cdp.send('Runtime.evaluate',{expression:'document',objectGroup:'lifecycle-regression'})).result.objectId!;
 const windowId=(await cdp.send('Runtime.evaluate',{expression:'window',objectGroup:'lifecycle-regression'})).result.objectId!;
 return {
  counts:async()=>({document:(await cdp.send('DOMDebugger.getEventListeners',{objectId:documentId})).listeners.length,window:(await cdp.send('DOMDebugger.getEventListeners',{objectId:windowId})).listeners.length}),
  dispose:()=>cdp.send('Runtime.releaseObjectGroup',{objectGroup:'lifecycle-regression'}),
 };
}

// CDP is Chromium-only. The standard Firefox/WebKit smoke filters intentionally
// do not collect this diagnostic; their interaction regressions run separately.
for(const [kind,rounds] of [['play',20],['viewer',10]] as const)test(`${kind} 反复进入退出不残留文档或窗口监听器 @lifecycle-chromium`,async({page})=>{
 test.setTimeout(180000);
 await page.goto('/#/explore');await expect(page.locator('div.picture-world')).toBeVisible();
 const counter=await listenerCounter(page);let baseline:Awaited<ReturnType<typeof counter.counts>>|undefined;
 try{
  for(let round=1;round<=rounds;round++){
   await page.evaluate(route=>{location.hash=route;},kind==='play'?'/play/M01?car=CAR01':'/cars/CAR01');
   const canvas=page.locator(kind==='play'?'canvas.touch-world-canvas':'canvas.vehicle-webgl');
   await expect(canvas).toHaveAttribute('data-ready','true',{timeout:45000});
   await page.getByRole('link',{name:'汽车小镇首页',exact:true}).click();
   await expect(page.locator('div.picture-world')).toBeVisible();await expect(page.locator('canvas')).toHaveCount(0);
   // Warm once: app-global handlers may be installed on the first real gesture.
   if(!baseline)baseline=await counter.counts();
   else await expect.poll(()=>counter.counts(),{message:`${kind} round ${round} must release its own handlers`}).toEqual(baseline);
  }
  console.log(`${kind} listener cleanup`,JSON.stringify({rounds,baseline,final:await counter.counts()}));
 }finally{await counter.dispose();}
});
