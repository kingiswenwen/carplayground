import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {readFileSync} from 'node:fs';
import type {Car} from '../../src/domain/content';
const content=JSON.parse(readFileSync('content/r3.json','utf8')) as {cars:Car[]};
test.use({reducedMotion:'reduce'});

test('自定义品牌和发源地面板可以搜索、键盘选择和退出 @smoke',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/#/cars');
 await expect(page.locator('.garage-filters select')).toHaveCount(0);
 const brand=page.getByRole('combobox',{name:'按汽车品牌筛选'});await brand.click();
 await page.getByRole('searchbox',{name:'搜索品牌',exact:true}).fill('Ferrari');
 await page.getByRole('searchbox',{name:'搜索品牌',exact:true}).press('ArrowDown');
 await page.getByRole('option',{name:'法拉利',exact:true}).press('Enter');
 await expect(brand).toContainText('法拉利');await expect(brand).toBeFocused();
 await page.getByRole('combobox',{name:'按品牌发源地筛选'}).click();
 await page.getByRole('searchbox',{name:'搜索品牌发源地'}).fill('意大利');
 await page.getByRole('option',{name:'意大利',exact:true}).click();
 await expect(page.locator('.car-gallery-card')).not.toHaveCount(0);
 await brand.click();await page.getByRole('searchbox',{name:'搜索品牌',exact:true}).press('Escape');await expect(brand).toHaveAttribute('aria-expanded','false');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('慢速换车先清除旧帧，快速切换后只显示最后选中的车型 @smoke',async({page})=>{
 test.setTimeout(90000);
 let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});
 const pattern=/\/(?:models\/car0[35]\.glb[^/?]*|rendered-cars\/car05-front-left\.webp)(?:\?|$)/;
 await page.route(pattern,async route=>{await pending;await route.continue().catch(()=>{});});
 try{
  await page.goto('/#/cars');
  await expect(page.locator('.vehicle-webgl[data-ready=true]')).toHaveAttribute('data-car','CAR01',{timeout:45000});
  await page.getByRole('button',{name:/选择.*911 GT3 RS/}).click();
  await expect(page.locator('.vehicle-views')).toHaveAttribute('data-car','CAR03');
  const poster=page.locator('.vehicle-poster');
  await expect(poster).toHaveAttribute('src',/car03-front-left\.webp/);
  await expect.poll(()=>poster.evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('.vehicle-webgl')).toBeHidden();
  await expect(page.locator('.model-paints')).toHaveCount(0);
  await page.getByRole('button',{name:/选择.*Chiron Profil/}).click();
  await expect(poster).toHaveAttribute('src',/car05-front-left\.webp/);
  // The new image must not retain the previous decoded bitmap while loading.
  expect(await poster.evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBe(0);
  await expect(page.locator('.vehicle-webgl')).toBeHidden();
  release();await page.unroute(pattern);
  await expect(page.locator('.vehicle-webgl[data-ready=true]')).toHaveAttribute('data-car','CAR05',{timeout:45000});
  await expect(poster).toHaveCount(0);
 }finally{release();}
});

test('全部车型在真实画面中可换红蓝两色并使用对应模型封面',async({page},info)=>{
 test.skip(info.project.name!=='chromium','Complete pixel matrix runs once in Chromium.');test.setTimeout(600000);await page.setViewportSize({width:960,height:820});
 await page.goto('/#/cars');const search=page.getByRole('searchbox',{name:'查找车型或品牌'}),canvas=page.locator('.vehicle-webgl');
 const results:{id:string;red:number;blue:number;changed:number;visible:number}[]=[];
 const failures:string[]=[];
 const ids=process.env.VIEWER_PAINT_IDS?.split(',');const cars=ids?content.cars.filter(car=>ids.includes(car.id)):content.cars;expect(cars).toHaveLength(ids?.length||content.cars.length);
 for(const car of cars){
  await search.fill(car.model);
  const tile=page.getByRole('button',{name:`选择 ${car.name}，有独立立体模型`,exact:true});
  await expect(tile.locator('img')).toHaveAttribute('src',new RegExp(car.id.toLowerCase()+'-front-left\\.webp'));
  await tile.click();await expect(canvas).toHaveAttribute('data-car',car.id,{timeout:45000});await expect(canvas).toHaveAttribute('data-ready','true',{timeout:45000});
  await expect(page.locator('.model-paints button')).toHaveCount(8);
  await page.getByRole('button',{name:'立体车试红色',exact:true}).click();const red=await canvas.screenshot();
  await page.getByRole('button',{name:'立体车试蓝色',exact:true}).click();const blue=await canvas.screenshot();
  const original=await sharp(red).removeAlpha().raw().toBuffer({resolveWithObject:true}),r=original.data,b=await sharp(blue).removeAlpha().raw().toBuffer();
  const origin=Math.floor(original.info.width/2)*3,bg=[r[origin],r[origin+1],r[origin+2]];let visible=0;
  let redPixels=0,bluePixels=0,changed=0;
  for(let i=0;i<r.length;i+=3){if(Math.abs(r[i]-bg[0])+Math.abs(r[i+1]-bg[1])+Math.abs(r[i+2]-bg[2])>45)visible++;if(r[i]>r[i+1]*1.35&&r[i]>r[i+2]*1.15&&r[i]>60)redPixels++;if(b[i+2]>b[i]*1.25&&b[i+2]>b[i+1]*1.05&&b[i+2]>50)bluePixels++;if(Math.abs(r[i]-b[i])+Math.abs(r[i+1]-b[i+1])+Math.abs(r[i+2]-b[i+2])>70)changed++;}
  results.push({id:car.id,red:redPixels,blue:bluePixels,changed,visible});
  if(redPixels<Math.max(500,visible*.03)||bluePixels<Math.max(500,visible*.03)||changed<Math.max(1500,visible*.05)){failures.push(car.id);await fs.writeFile(info.outputPath(car.id+'-red.png'),red);await fs.writeFile(info.outputPath(car.id+'-blue.png'),blue);}
 }
 await info.attach('all-car-paint-pixels',{body:Buffer.from(JSON.stringify(results,null,2)),contentType:'application/json'});
 expect(failures,'Cars must change actual body pixels, not just button state').toEqual([]);
});

test('分离车漆、贴图车身和无光照模型都能还原原色',async({page})=>{
 test.setTimeout(90000);await page.setViewportSize({width:960,height:820});
 for(const id of ['CAR01','CAR160','CAR162']){
  await page.goto(`/#/cars/${id}`);const canvas=page.locator('.vehicle-webgl[data-ready=true]');
  await expect(canvas).toHaveAttribute('data-car',id,{timeout:45000});
  const reset=page.getByRole('button',{name:'还原原车颜色'});await reset.click();const original=await canvas.screenshot();
  await page.getByRole('button',{name:'立体车试绿色',exact:true}).click();
  await expect(reset).toHaveAttribute('aria-pressed','false');await canvas.screenshot();
  await reset.click();await expect(reset).toHaveAttribute('aria-pressed','true');const restored=await canvas.screenshot();
  const a=await sharp(original).removeAlpha().raw().toBuffer(),b=await sharp(restored).removeAlpha().raw().toBuffer();
  expect(a.length).toBe(b.length);let changed=0;for(let i=0;i<a.length;i+=3)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>10)changed++;
  expect(changed/(a.length/3),id+' must retain its original appearance').toBeLessThan(.005);
 }
});
