import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const content = JSON.parse(fs.readFileSync(new URL('../../content/r3.json',import.meta.url),'utf8'));

test('@photos 八车多角度实拍逐一切换，图像、说明和来源对应',async({page})=>{
 test.setTimeout(90000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 for(const car of content.cars){
  await page.goto(`/#/cars/${car.id}`);
  const gallery=page.locator('.car-photo-gallery');
  await expect(gallery).toBeVisible();
  await expect(gallery.locator('.photo-view-choices button')).toHaveCount(car.views.length);
  for(const view of car.views){
   await gallery.getByRole('button',{name:view.label,exact:true}).click();
   await gallery.locator('figure').scrollIntoViewIfNeeded();
   await expect.poll(()=>gallery.locator('.photo-view-frame>img').evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth>0)).toBe(true);
   await expect(gallery.locator('figcaption')).toHaveText(view.caption);
   await expect(gallery.locator('img')).toHaveAttribute('alt',`${car.name}，${view.caption}`);
   await expect(gallery.locator('.photo-word-hotspot')).toHaveCount(view.hotspots?.length||0);
   await gallery.locator('summary').click();
   await expect(gallery.locator('.photo-attribution a').first()).toHaveAttribute('href',view.credit.sourceUrl);
   await gallery.locator('summary').click();
  }
 }
 expect(errors).toEqual([]);
});

test('@photos 八车部件热点按各自图片配置，手机按钮不少于56像素且互不遮挡',async({page})=>{
 await page.setViewportSize({width:320,height:844});
 for(const car of content.cars){
  await page.goto(`/#/cars/${car.id}`);
  const stage=page.locator('.detail-stage');
  await expect(stage.locator('.car-image.ready')).toBeVisible();
  await expect(stage.locator('.hotspot')).toHaveCount(car.hotspots.length);
  for(const part of car.hotspots){
   const button=stage.getByRole('button',{name:`${part.zh} ${part.id}`,exact:true});
   await button.scrollIntoViewIfNeeded();
   const box=(await button.boundingBox())!;expect(box.width).toBeGreaterThanOrEqual(56);expect(box.height).toBeGreaterThanOrEqual(56);
   expect(await button.evaluate(element=>{const box=element.getBoundingClientRect(),hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);return element===hit||element.contains(hit);})).toBe(true);
   await button.click();await expect(stage.locator('.word-card strong')).toHaveText(part.id);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});

test('@photos 部件探索中能看到真实座椅，点选显示seat并保留原部件任务',async({page})=>{
 await page.goto('/#/play/T01');
 const gallery=page.locator('.interior-only');await gallery.scrollIntoViewIfNeeded();
 await expect(gallery.getByRole('button',{name:'座椅 seat',exact:true})).toBeVisible();
 await gallery.getByRole('button',{name:'座椅 seat',exact:true}).click();
 await expect(gallery.getByRole('status')).toHaveText('座椅 seat');
 expect(content.vocabulary).toHaveLength(32);
 for(const part of ['车轮 wheel','车灯 light','车门 door'])await page.getByRole('button',{name:part,exact:true}).click();
 await expect(page.getByRole('heading',{level:1})).toHaveText('又完成一次小探索！');
});

test('@photos 座舱照片失败不出现虚构热点，重试与换方向均可恢复',async({page})=>{
 let fail=true;
 await page.route(url=>url.pathname.endsWith('/car01-interior.webp'),route=>fail?route.abort():route.continue());
 await page.goto('/#/cars/CAR01');
 const gallery=page.locator('.car-photo-gallery');await gallery.getByRole('button',{name:'座舱',exact:true}).click();
 await gallery.scrollIntoViewIfNeeded();await expect(gallery.getByRole('alert')).toContainText('这张照片还没到');await expect(gallery.locator('.photo-word-hotspot')).toHaveCount(0);
 fail=false;await gallery.getByRole('button',{name:'重试照片',exact:true}).click();await expect(gallery.getByRole('button',{name:'座椅 seat',exact:true})).toBeVisible();
 await gallery.getByRole('button',{name:'车尾',exact:true}).click();await expect(gallery.locator('.photo-word-hotspot')).toHaveCount(0);await expect(gallery.locator('figcaption')).toContainText('后侧方');
});

test('@photos 不同屏宽的照片不裁切，方向按钮和座椅目标可触达',async({page})=>{
 for(const width of [320,390,768,1024,1440]){
  await page.setViewportSize({width,height:width<500?844:1000});await page.goto('/#/cars/CAR01');
  const gallery=page.locator('.car-photo-gallery');await gallery.getByRole('button',{name:'座舱',exact:true}).click();await gallery.scrollIntoViewIfNeeded();
  const target=gallery.getByRole('button',{name:'座椅 seat',exact:true});await expect(target).toBeVisible();
  const box=(await target.boundingBox())!;expect(box.width).toBeGreaterThanOrEqual(56);expect(box.height).toBeGreaterThanOrEqual(56);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const ratios=await gallery.locator('img').evaluate((image:HTMLImageElement)=>({natural:image.naturalWidth/image.naturalHeight,display:image.getBoundingClientRect().width/image.getBoundingClientRect().height}));expect(ratios.display).toBeCloseTo(ratios.natural,1);
  if(width===320||width===1024)await page.screenshot({path:test.info().outputPath(`photos-${width}.png`),fullPage:true});
 }
});
