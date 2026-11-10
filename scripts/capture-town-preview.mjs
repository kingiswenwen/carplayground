import fs from 'node:fs/promises';
import sharp from 'sharp';
import {chromium} from '@playwright/test';
const browser=await chromium.launch();
const directory=process.argv[2]||'docs/town-preview';
await fs.mkdir(directory,{recursive:true});
const captures=[];
try{
 for(const[device,width,height]of[['desktop',1440,1000],['tablet',768,1024],['phone',390,844]]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
  for(const[name,route]of[['home','/explore'],['showroom','/cars'],['wash','/play/H03'],['parking','/play/M03'],['bridge','/play/T02'],['studio','/explore/studio'],['story','/stories/ST02?step=1'],['garage','/garage'],['parent','/parent']]){
   await page.goto(`http://localhost:5173/#${route}`);
   await page.locator('h1').first().waitFor();
   if(route.includes('/play/')){
    await page.waitForFunction(()=>JSON.parse(document.querySelector('.touch-canvas')?.getAttribute('data-state')||'{}').ready);
    await page.waitForFunction(()=>document.querySelector('.touch-canvas')?.getAttribute('data-presentation')==='flat'||document.querySelector('.touch-world-canvas')?.getAttribute('data-ready')==='true');
   }
   if(route==='/cars')await page.waitForFunction(()=>document.querySelector('.vehicle-stage')?.getAttribute('data-ready')==='true'||document.querySelector('.vehicle-angle')?.getAttribute('data-ready')==='true');
   // IntersectionObserver also mounts images. Scroll each catalogue/artwork
   // placeholder into view before promoting the mounted img elements to eager.
   for(const image of await page.locator('.car-image').all()){
    await image.scrollIntoViewIfNeeded();
    await image.locator('img').waitFor({state:'attached'});
    await image.evaluate(async element=>{const img=element.querySelector('img');if(img){img.loading='eager';await img.decode().catch(()=>{});}});
   }
   await page.evaluate(()=>window.scrollTo(0,0));
   await page.evaluate(async()=>{await document.fonts.ready;for(const image of document.images)image.loading='eager';await Promise.all([...document.images].map(img=>img.decode().catch(()=>{})));});
   const path=`${directory}/${name}-${device}.webp`;
   await sharp(await page.screenshot({fullPage:true})).webp({quality:86}).toFile(path);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
   captures.push({name,route,device,width,height,path,overflow});console.log(`${name} ${device}${overflow?' OVERFLOW':''}`);
  }
  await page.close();
 }
 await fs.writeFile(`${directory}/captures.json`,JSON.stringify(captures,null,2)+'\n');
}finally{await browser.close();}
