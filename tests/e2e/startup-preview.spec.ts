import {expect,test} from '@playwright/test';
test('立体引擎仍在下载时已显示同车型预览，准备完成才允许立体观察 @smoke',async({page})=>{
 test.setTimeout(60000);
 let release!:()=>void;
 const waiting=new Promise<void>(resolve=>{release=resolve;});
 let intercepted=false;
 await page.route('**/assets/*model-bytes*.js',async route=>{intercepted=true;await waiting;await route.continue();});
 try{
  await page.goto('/#/cars/CAR03',{waitUntil:'domcontentloaded'});
  const poster=page.locator('.vehicle-poster');
  await expect(poster).toBeVisible();
  await expect(poster).toHaveAttribute('src',/car03-front-left\.webp/);
  await expect.poll(()=>poster.evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect.poll(()=>intercepted).toBe(true);
  await expect(page.locator('.vehicle-webgl[data-ready=true]')).toHaveCount(0);
  release();
  await expect(page.locator('.vehicle-webgl[data-ready=true]')).toHaveAttribute('data-car','CAR03',{timeout:45000});
  await expect(poster).toHaveCount(0);
 }finally{release();}
});
