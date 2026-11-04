import {test,expect} from '@playwright/test';

const removed=['CAR02','CAR04','CAR16','CAR17','CAR20','CAR25'];
test('目录只保留有独立模型的106款车，取消车型不再出现',async({page})=>{
 await page.goto('/#/cars');
 await expect(page.locator('.garage-count')).toContainText('106 款立体车 · 106 款真实车型');
 await expect(page.locator('.garage-reference-switch')).toHaveCount(0);
 const search=page.getByRole('searchbox',{name:'查找车型或品牌'});
 for(const name of ['296 GTB','750S','MX-5 RF','F8 Tributo','Alpine A110','Nissan Z']){
  await search.fill(name);await expect(page.locator('.garage-paged .car-gallery-card')).toHaveCount(0);
 }
});

test('取消车型的旧详情链接不显示车辆，旧玩法链接回退到保留车型',async({page})=>{
 for(const id of removed){
  await page.goto('/#/cars/'+id);
  await expect(page.getByRole('link',{name:'回到乐园',exact:true})).toBeVisible();
  await expect(page.locator('.vehicle-views')).toHaveCount(0);
 }
 await page.goto('/#/play/E02?car=CAR02&view=2d');
 await expect(page.getByRole('link',{name:'旋转看看这辆车',exact:true})).toHaveAttribute('href','#/cars/CAR01');
 await expect(page.locator('.touch-canvas')).toHaveAttribute('data-presentation','flat');
});

test('旧收藏被过滤，旧海报保留文字图案并可导出，不重新显示下架车或替换为其他车',async({page})=>{
 await page.goto('/#/cars');
 await expect(page.getByRole('button',{name:'开启声音',exact:true})).toBeEnabled();
 await page.evaluate(()=>new Promise<void>((resolve,reject)=>{
  const open=indexedDB.open('carplayground-local-v1');open.onerror=()=>reject(open.error);
  open.onsuccess=()=>{const db=open.result,tx=db.transaction(['favorites','creations'],'readwrite');
   for(const carId of ['CAR02','CAR16','CAR83'])tx.objectStore('favorites').put({carId,at:new Date().toISOString()});
   tx.objectStore('creations').put({id:'removed-vehicle-art',kind:'poster',carId:'CAR02',background:'#eef1d6',caption:'我的小星星',marks:[{x:.5,y:.5,color:'#367cc1',shape:'star'}],createdAt:new Date().toISOString(),version:1});
   tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};};
 }));
 await page.goto('/#/garage');await page.reload();
 const card=page.locator('.creation-card');await expect(card).toHaveCount(1);
 await expect(card).toContainText('我的小星星');await expect(card).toContainText('这辆车已下架');
 await expect(card.locator('.car-picture,img')).toHaveCount(0);
 await expect(card.locator('.art-mark')).toHaveCount(1);
 await expect(page.locator('.garage-car')).toHaveCount(0);
 const download=page.waitForEvent('download');await card.getByRole('button',{name:'下载图片',exact:true}).click();
 expect((await download).suggestedFilename()).toMatch(/^carplayground-poster-.*\.png$/);
 await expect(card.getByRole('status')).toContainText('图片已准备好下载');
});
