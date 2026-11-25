import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {readFileSync} from 'node:fs';
import type {Car} from '../../src/domain/content';
import {vehiclePixels} from './vehicle-pixels';
const content=JSON.parse(readFileSync('content/r3.json','utf8')) as {cars:Car[]};
test.use({reducedMotion:'reduce'});

test('手机展厅仅显示立体车，能自定义换色和就地展开对应车型资料',async({page})=>{
 test.setTimeout(90000);
 await page.setViewportSize({width:390,height:844});
 await page.goto('/#/cars');
 const viewer=page.locator('.vehicle-views'),canvas=viewer.locator('.vehicle-webgl');
 await expect(canvas).toHaveAttribute('data-ready','true',{timeout:45000});
 const paints=viewer.getByRole('group',{name:'给立体车试颜色',exact:true});
 await expect(viewer.getByRole('button',{name:'外观图',exact:true})).toHaveCount(0);
 await expect(viewer.getByRole('button',{name:'听车名',exact:true})).toBeVisible();
 const details=viewer.getByRole('button',{name:'车型详情',exact:true});
 const profile=page.getByRole('region',{name:'车型详情',exact:true});
 await expect(details).toHaveAttribute('aria-expanded','false');
 await details.click();
 await expect(page).toHaveURL(/#\/cars$/);
 await expect(profile).toBeFocused();
 await expect(profile).toContainText('兰博基尼 Revuelto');
 await expect(profile).toContainText('三台电动机');
 await expect(profile.getByRole('link',{name:'查看车型资料'})).toHaveAttribute('href',/lamborghini\.com.*revuelto/);
 await expect(viewer.getByRole('link',{name:'带它去洗车',exact:true})).toHaveAttribute('href',/#\/play\/H03\?car=CAR01/);
 const code=paints.getByRole('textbox',{name:'颜色代码'});
 await code.fill('invalid');await code.press('Enter');
 await expect(paints.getByRole('alert')).toBeVisible();
 await expect(canvas).toHaveAttribute('data-paint','original');
 await code.fill('#29b');await paints.getByRole('button',{name:'应用',exact:true}).click();
 await expect(canvas).toHaveAttribute('data-paint','#2299bb');
 await expect(paints.getByRole('alert')).toHaveCount(0);
 const custom=paints.getByLabel('自定义颜色');
 await custom.fill('#ad8b26');
 await expect(canvas).toHaveAttribute('data-paint','#ad8b26');
 await expect(code).toHaveValue('#ad8b26');
 await paints.getByRole('button',{name:'还原原色',exact:true}).click();
 await expect(canvas).toHaveAttribute('data-paint','original');
 await page.getByRole('button',{name:/选择.*Chiron Profilée/}).click();
 await expect(details).toHaveAttribute('aria-expanded','false');
 await details.click();
 await expect(profile).toContainText('布加迪 Chiron Profilée');
 await expect(profile).toContainText('只造了一辆');
 await expect(profile.getByRole('link',{name:'查看车型资料'})).toHaveAttribute('href',/bugatti\.com.*chiron-profilee/);
 await expect(page).toHaveURL(/#\/cars$/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test.describe('触屏立体展台',()=>{
 test.use({hasTouch:true,isMobile:true,viewport:{width:390,height:844}});
 test('车身横拖能旋转，双击和双指留在原比例，竖划可以滚动',async({page,context})=>{
  await page.goto('/#/cars');
  const canvas=page.locator('.vehicle-webgl[data-ready=true]');
  await expect(canvas).toBeVisible({timeout:30000});
  await expect(canvas).toHaveCSS('touch-action','pan-y');
  const {x,y,width,height}=(await canvas.boundingBox())!;
  const initial=await canvas.getAttribute('data-yaw');
  const scale=()=>page.evaluate(()=>window.visualViewport!.scale);
  const startScale=await scale();
  const input=await context.newCDPSession(page);
  const touch=(type:'touchStart'|'touchMove'|'touchEnd',...points:{x:number;y:number}[])=>input.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((point,id)=>({...point,id}))});
  const middle={x:x+width/2,y:y+height/2};
  await touch('touchStart',{x:middle.x-50,y:middle.y});
  for(let dx=-30;dx<=50;dx+=20)await touch('touchMove',{x:middle.x+dx,y:middle.y});
  await touch('touchEnd');
  await expect(canvas).not.toHaveAttribute('data-yaw',initial!);
  await page.touchscreen.tap(middle.x,middle.y);
  await page.touchscreen.tap(middle.x,middle.y);
  await touch('touchStart',{x:middle.x-20,y:middle.y},{x:middle.x+20,y:middle.y});
  for(let dx=30;dx<=90;dx+=15)await touch('touchMove',{x:middle.x-dx,y:middle.y},{x:middle.x+dx,y:middle.y});
  await touch('touchEnd');
  const beforeScroll=await page.evaluate(()=>scrollY);
  expect(await scale()).toBe(startScale);
  await touch('touchStart',{x:middle.x,y:middle.y+65});
  for(let dy=45;dy>=-75;dy-=20)await touch('touchMove',{x:middle.x,y:middle.y+dy});
  await touch('touchEnd');
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(beforeScroll+30);
  expect(await scale()).toBe(startScale);
 });
});

test('更换车型后播放对应的全名音频，无需浏览器语音',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(window,'speechSynthesis',{value:undefined}));
 await page.goto('/#/cars');
 await expect(page.getByRole('button',{name:'听车名',exact:true})).toBeEnabled();
 await page.evaluate(()=>{
  const prototype=(Reflect.get(window,'Howl') as {prototype:{play:(...args:unknown[])=>unknown}}).prototype;
  const play=prototype.play;
  prototype.play=function(...args:unknown[]){
   const clip=this as unknown as {once:(event:string,callback:()=>void)=>void;_src:string};
   clip.once('play',()=>Reflect.set(window,'__playingCarName',clip._src));
   return Reflect.apply(play,this,args);
  };
 });
 const listen=page.getByRole('button',{name:'听车名',exact:true});
 for(const id of ['CAR05','CAR09','CAR160']){
  const car=content.cars.find(car=>car.id===id)!;
  await page.getByRole('searchbox',{name:'查找车型或品牌'}).fill(car.model);
  await page.getByRole('button',{name:`选择 ${car.name}，有独立立体模型`,exact:true}).click();
  const pattern=new RegExp('/vehicle-name-'+id+'\\.mp3(?:\\?|$)');
  const response=page.waitForResponse(response=>pattern.test(response.url())&&response.ok());
  await listen.click();
  await response;
  await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__playingCarName'))).toMatch(pattern);
 }
});

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
  await tile.scrollIntoViewIfNeeded();
  await expect(tile.getByRole('img',{name:`${car.name}，同车型独立立体模型渲染图`,exact:true})).toHaveAttribute('src',new RegExp(car.id.toLowerCase()+'-front-left\\.webp'));
  await tile.click();await expect(canvas).toHaveAttribute('data-car',car.id,{timeout:45000});await expect(canvas).toHaveAttribute('data-ready','true',{timeout:45000});
  await expect(page.locator('.vehicle-swatches button')).toHaveCount(7);
  await page.getByRole('button',{name:'立体车试红色',exact:true}).click();const red=await vehiclePixels(canvas);
  await page.getByRole('button',{name:'立体车试蓝色',exact:true}).click();const blue=await vehiclePixels(canvas);
  const r=await sharp(red).removeAlpha().raw().toBuffer(),b=await sharp(blue).removeAlpha().raw().toBuffer();
  let visible=0;
  let redPixels=0,bluePixels=0,changed=0;
  for(let i=0;i<r.length;i+=3){if(r[i]+r[i+1]+r[i+2]>45)visible++;if(r[i]>r[i+1]*1.35&&r[i]>r[i+2]*1.15&&r[i]>60)redPixels++;if(b[i+2]>b[i]*1.25&&b[i+2]>b[i+1]*1.05&&b[i+2]>50)bluePixels++;if(Math.abs(r[i]-b[i])+Math.abs(r[i+1]-b[i+1])+Math.abs(r[i+2]-b[i+2])>70)changed++;}
  results.push({id:car.id,red:redPixels,blue:bluePixels,changed,visible});
  if(redPixels<Math.max(500,visible*.03)||bluePixels<Math.max(500,visible*.03)||changed<Math.max(1500,visible*.05)){failures.push(car.id);await fs.writeFile(info.outputPath(car.id+'-red.png'),red);await fs.writeFile(info.outputPath(car.id+'-blue.png'),blue);}
 }
 await info.attach('all-car-paint-pixels',{body:Buffer.from(JSON.stringify(results,null,2)),contentType:'application/json'});
 expect(failures,'Cars must change actual body pixels, not just button state').toEqual([]);
});

test('分离车漆和不同贴图车身都能还原原色',async({page})=>{
 test.setTimeout(90000);await page.setViewportSize({width:960,height:820});
 for(const id of ['CAR01','CAR160','CAR192']){
  await page.goto(`/#/cars/${id}`);const canvas=page.locator('.vehicle-webgl[data-ready=true]');
  await expect(canvas).toHaveAttribute('data-car',id,{timeout:45000});
  const reset=page.getByRole('button',{name:'还原原色'});await reset.click();const original=await canvas.screenshot();
  await page.getByRole('button',{name:'立体车试绿色',exact:true}).click();
  await expect(reset).toHaveAttribute('aria-pressed','false');await canvas.screenshot();
  await reset.click();await expect(reset).toHaveAttribute('aria-pressed','true');const restored=await canvas.screenshot();
  const a=await sharp(original).removeAlpha().raw().toBuffer(),b=await sharp(restored).removeAlpha().raw().toBuffer();
  expect(a.length).toBe(b.length);let changed=0;for(let i=0;i<a.length;i+=3)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>10)changed++;
  expect(changed/(a.length/3),id+' must retain its original appearance').toBeLessThan(.005);
 }
});
