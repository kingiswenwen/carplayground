import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const content=JSON.parse(fs.readFileSync(new URL('../../content/r3.json',import.meta.url),'utf8'));

test('@smoke 展厅八车切换使用完整车景，详情热点与新图对应',async({page})=>{
 for(const [index,car] of content.cars.entries()){
  if(index===0)await page.goto('/#/cars');
  else await page.getByRole('button',{name:'下一辆汽车',exact:true}).click();
  const hero=page.locator('.showroom-display-car');
  await expect(hero.locator('.car-showcase.ready')).toBeVisible();
  await expect(hero).toHaveAttribute('href',`#/cars/${car.id}`);
  await expect(hero.locator('img')).toHaveAttribute('src',new RegExp(`showcase/${car.id.toLowerCase()}-v5.webp$`));
 }
 await page.getByRole('button',{name:'下一辆汽车',exact:true}).click();
 await expect(page.locator('.showroom-display-car')).toHaveAttribute('href','#/cars/CAR01');
 for(const car of content.cars){
  await page.goto(`/#/cars/${car.id}`);
  const stage=page.locator('.integrated-detail');
  await expect(stage.locator('.car-showcase.ready')).toBeVisible();
  for(const part of car.showcaseHotspots){
   const button=stage.getByRole('button',{name:`${part.zh} ${part.id}`,exact:true});
   await button.click();
   await expect(stage.locator('.word-card strong')).toHaveText(part.id);
   expect(await button.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===el||el.contains(hit);})).toBe(true);
  }
 }
});

test('@smoke 车景加载失败可原地重试，手机与平板完整显示车辆且入口可用',async({page})=>{
 let fail=true;
 await page.route(url=>/\/showcase\/car01-v5\.webp$/.test(url.pathname),route=>fail?route.abort():route.continue());
 await page.goto('/#/cars');
 const hero=page.locator('.showroom-display-car');
 await expect(hero.getByRole('button',{name:'重新加载',exact:true})).toBeVisible();
 fail=false;
 await hero.getByRole('button',{name:'重新加载',exact:true}).click();
 await expect(page).toHaveURL(/#\/cars$/);
 await expect(hero.locator('.ready')).toBeVisible();
 for(const width of [320,390,768,1024,1440]){
  await page.setViewportSize({width,height:width<500?844:1000});
  await page.goto('/#/cars');
  await expect(hero.locator('.ready')).toBeVisible();
  if([390,768,1440].includes(width)){
   await page.locator('.showroom-world-invite').scrollIntoViewIfNeeded();
   await expect(page.locator('.showroom-world-invite .art-ready')).toBeVisible();
   await page.evaluate(()=>window.scrollTo(0,0));
   await page.screenshot({path:test.info().outputPath(`showroom-${width}.png`),fullPage:true});
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('link',{name:'看看这辆车',exact:true}).click();
  await expect(page).toHaveURL(/cars\/CAR01$/);
  await expect(page.locator('.integrated-detail .car-showcase.ready')).toBeVisible();
  const image=page.locator('.integrated-detail .car-image>img');
  const ratio=await image.evaluate((el:HTMLImageElement)=>({natural:el.naturalWidth/el.naturalHeight,display:el.getBoundingClientRect().width/el.getBoundingClientRect().height}));
  expect(ratio.display).toBeCloseTo(ratio.natural,2);
  await page.getByRole('button',{name:'车轮 wheel',exact:true}).click();
  await expect(page.locator('.word-card strong')).toHaveText('wheel');
 }
});

test('@smoke 三个故事的车景可加载，四幕切换和重听不失去返回入口',async({page})=>{
 for(const story of content.stories){
  await page.goto(`/#/stories/${story.id}`);
  for(let i=0;i<4;i++){
   await page.locator('.story-progress button').nth(i).click();
   await expect(page.getByRole('heading',{level:1})).toHaveText(story.frames[i].title);
   await expect(page.locator('.story-picture .scene-art.art-ready')).toBeVisible();
   await expect(page.locator('.story-picture>.car-image')).toHaveCount(0);
   await page.getByRole('button',{name:'听这一幕',exact:true}).click();
   await expect(page.getByRole('link',{name:'回到探索',exact:true})).toBeVisible();
  }
 }
});
