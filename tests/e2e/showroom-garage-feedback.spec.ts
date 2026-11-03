import {test,expect,type Page} from '@playwright/test';

async function rows(page:Page,table:string){
 return page.evaluate(table=>new Promise<Record<string,unknown>[]>((resolve,reject)=>{
  const open=indexedDB.open('carplayground-local-v1');
  open.onerror=()=>reject(open.error);
  open.onsuccess=()=>{const database=open.result,query=database.transaction(table).objectStore(table).getAll();query.onerror=()=>{database.close();reject(query.error);};query.onsuccess=()=>{database.close();resolve(query.result);};};
 }),table);
}

for(const reducedMotion of ['reduce','no-preference'] as const)test.describe(`phone ${reducedMotion}`,()=>{
 test.use({viewport:{width:390,height:844},reducedMotion});
 test('选车后看见新模型，保留键盘焦点并尊重减少动画设置 @smoke',async({page})=>{
  await page.addInitScript(()=>{
   const scroll=Element.prototype.scrollIntoView;
   Reflect.set(window,'__previewScrolls',[]);
   Reflect.set(window,'__lateLayoutApplied',false);
   Element.prototype.scrollIntoView=function(options){
    if(this.classList.contains('car-roundabout')){
     Reflect.get(window,'__previewScrolls').push(options);
     // Reproduce a small late layout change after selection, as can happen
     // when toolbar/font metrics settle after the initial scroll position.
     requestAnimationFrame(()=>{
      document.documentElement.style.overflowAnchor='none';
      const header=document.querySelector<HTMLElement>('.site-header')!;
      header.style.height=`${header.getBoundingClientRect().height-4}px`;
      Reflect.set(window,'__lateLayoutApplied',true);
     });
    }
    scroll.call(this,options);
   };
  });
  await page.goto('/#/cars');
  const tile=page.getByRole('button',{name:/选择 .*Jesko Attack/});
  await tile.scrollIntoViewIfNeeded();await tile.focus();
  expect((await page.locator('.car-roundabout').boundingBox())!.y+360).toBeLessThan(0);
  await tile.press('Enter');
  await expect(page.locator('.vehicle-views')).toHaveAttribute('data-car','CAR07');
  await expect(tile).toBeFocused();
  await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__lateLayoutApplied'))).toBe(true);
  // Report the actual overflow in CI while keeping the same 1px tolerance.
  await expect.poll(async()=>{const box=(await page.locator('.car-roundabout').boundingBox())!;return Math.max(-box.y,box.y+box.height-844);}).toBeLessThanOrEqual(1);
  const scrolls=await page.evaluate(()=>Reflect.get(window,'__previewScrolls') as ScrollIntoViewOptions[]);
  expect(scrolls).toHaveLength(1);
  expect(scrolls[0].block).toBe('center');
  expect(scrolls[0].behavior).toBe(reducedMotion==='reduce'?'instant':'smooth');
  await tile.scrollIntoViewIfNeeded();
  const scrollY=await page.evaluate(()=>window.scrollY);
  await tile.press('Enter');
  expect(await page.evaluate(()=>window.scrollY)).toBe(scrollY);
  expect(await page.evaluate(()=>Reflect.get(window,'__previewScrolls').length)).toBe(1);
 });
});

test('预览已在屏幕内时换车不会跳动页面 @smoke',async({page})=>{
 await page.setViewportSize({width:1280,height:1600});
 await page.goto('/#/cars');
 const tile=page.getByRole('button',{name:/选择 .*911 GT3 RS/});
 await tile.focus();
 const before=await page.evaluate(()=>window.scrollY),box=(await page.locator('.car-roundabout').boundingBox())!;
 expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThan(1600);
 await tile.press('Enter');
 await expect(page.locator('.vehicle-views')).toHaveAttribute('data-car','CAR03');
 await expect(tile).toBeFocused();expect(await page.evaluate(()=>window.scrollY)).toBe(before);
});

test('作品导出失败可见，重试完成清除旧错误，等待时不重复导出或丢作品 @smoke',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/#/cars');
 await expect(page.getByRole('button',{name:'开启声音',exact:true})).toBeEnabled();
 await page.evaluate(()=>new Promise<void>((resolve,reject)=>{
  const open=indexedDB.open('carplayground-local-v1');open.onerror=()=>reject(open.error);
  open.onsuccess=()=>{
   const database=open.result,transaction=database.transaction('creations','readwrite');
   for(const id of ['export-one','export-two'])transaction.objectStore('creations').put({id,kind:'tracks',carId:'CAR01',background:'#eef1d6',caption:'',marks:[{x:.5,y:.5,color:'#367cc1',shape:'circle'}],createdAt:new Date().toISOString(),version:1});
   transaction.onerror=()=>{database.close();reject(transaction.error);};transaction.oncomplete=()=>{database.close();resolve();};
  };
 }));
 await page.goto('/#/garage');
 const cards=page.locator('.creation-card');await expect(cards).toHaveCount(2);
 const original=await rows(page,'creations');
 await page.evaluate(()=>{
  const toBlob=HTMLCanvasElement.prototype.toBlob;
  Reflect.set(window,'__exportMode','fail');Reflect.set(window,'__exportCalls',0);
  HTMLCanvasElement.prototype.toBlob=function(callback,type,quality){
   Reflect.set(window,'__exportCalls',Reflect.get(window,'__exportCalls')+1);
   if(Reflect.get(window,'__exportMode')==='fail'){callback(null);return;}
   if(Reflect.get(window,'__exportMode')==='hold'){Reflect.set(window,'__finishExport',()=>toBlob.call(this,callback,type,quality));return;}
   toBlob.call(this,callback,type,quality);
  };
 });
 const card=cards.first();
 await card.getByRole('button',{name:'下载图片',exact:true}).click();
 await expect(card.getByRole('status')).toContainText('图片暂时无法导出');
 const errorBox=(await card.getByRole('status').boundingBox())!;
 expect(errorBox.width).toBeGreaterThan(30);expect(errorBox.height).toBeGreaterThan(10);
 await expect(card.getByRole('button',{name:'重试下载图片',exact:true})).toBeVisible();
 await expect(cards.nth(1).getByRole('status')).toHaveCount(0);
 await page.evaluate(()=>Reflect.set(window,'__exportMode','hold'));
 await card.getByRole('button',{name:'重试下载图片',exact:true}).evaluate(button=>{(button as HTMLButtonElement).click();(button as HTMLButtonElement).click();});
 await expect(card.getByRole('button',{name:'正在准备图片',exact:true})).toBeDisabled();
 await expect(card.getByRole('status')).toHaveText('正在准备图片…');
 expect(await page.evaluate(()=>Reflect.get(window,'__exportCalls'))).toBe(2);
 await expect(cards.nth(1).getByRole('button',{name:'下载图片',exact:true})).toBeEnabled();
 const downloaded=page.waitForEvent('download');
 await page.evaluate(()=>Reflect.get(window,'__finishExport')());
 const file=await downloaded;expect(file.suggestedFilename()).toMatch(/^carplayground-tracks-.*\.png$/);
 await expect(card.getByRole('status')).toContainText('图片已准备好下载');
 await expect(card.getByRole('status')).not.toContainText('暂时无法');
 await expect(card.getByRole('button',{name:'下载图片',exact:true})).toBeEnabled();
 expect(await rows(page,'creations')).toEqual(original);
 await page.reload();await expect(page.locator('.creation-card')).toHaveCount(2);
 expect(await rows(page,'creations')).toEqual(original);
});

test('静音时主动听车名可播放，但保留静音偏好和后续自动引导静音 @smoke',async({page})=>{
 const requests:string[]=[];page.on('request',request=>{if(/\.mp3(?:\?|$)/.test(request.url()))requests.push(request.url());});
 await page.goto('/#/cars');
 await expect(page.getByRole('button',{name:'开启声音',exact:true})).toBeEnabled();
 await page.evaluate(()=>{
  Reflect.set(window,'__requestedNamePlays',0);
  const prototype=(Reflect.get(window,'Howl') as unknown as {prototype:{play:(...args:unknown[])=>unknown}}).prototype;
  const play=prototype.play;
  prototype.play=function(...args:unknown[]){
   const clip=this as unknown as {once:(event:string,callback:()=>void)=>void};
   clip.once('play',()=>Reflect.set(window,'__requestedNamePlays',Reflect.get(window,'__requestedNamePlays')+1));
   return Reflect.apply(play,this,args);
  };
 });
 await page.getByRole('button',{name:'听车名',exact:true}).click();
 await expect.poll(()=>requests.length).toBeGreaterThan(0);
 // Observe actual playback starting: a short name can finish between polls
 // while the browser is busy drawing a software-rendered 3D car.
 await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__requestedNamePlays'))).toBeGreaterThan(0);
 await expect(page.getByRole('button',{name:'开启声音',exact:true})).toBeVisible();
 expect((await rows(page,'settings')).find(row=>row.id==='default')?.sound??false).toBe(false);
 const count=requests.length;
 await page.goto('/#/play/E02?car=CAR01');
 await expect(page.locator('.touch-play')).toHaveAttribute('data-activity','E02');
 await expect(page.locator('.touch-canvas')).toHaveAttribute('data-presentation','three');
 await expect(page.getByRole('button',{name:'看看怎么玩',exact:true})).toBeEnabled({timeout:45000});
 expect(requests).toHaveLength(count);
 expect((await rows(page,'settings')).find(row=>row.id==='default')?.sound??false).toBe(false);
});
