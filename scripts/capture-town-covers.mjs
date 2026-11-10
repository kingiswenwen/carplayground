// Run against a local development server after changes to the gameplay visuals.
// Covers are exact gameplay renders, not inferred teaching diagrams.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {chromium} from '@playwright/test';
const baseURL=process.env.PLAYWRIGHT_BASE_URL||'http://localhost:5173';
const content=JSON.parse(await fs.readFile('content/r3.json','utf8'));
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1280,height:1000},reducedMotion:'reduce'});
const records=[];
try{
 for(const activity of content.activities){
  await page.goto(`${baseURL}/#/play/${activity.id}?car=CAR01${['C03','A01','A02'].includes(activity.id)?'&view=2d':''}`);
  await page.waitForFunction(()=>JSON.parse(document.querySelector('.touch-canvas')?.getAttribute('data-state')||'{}').ready);
  await page.waitForFunction(()=>document.querySelector('.touch-canvas')?.getAttribute('data-presentation')==='flat'||document.querySelector('.touch-world-canvas')?.getAttribute('data-ready')==='true');
  const gestures=[];
  if(['C03','A01','A02'].includes(activity.id)){
   const canvas=page.locator('.touch-canvas');
   const point=async(x,y)=>{const r=await canvas.boundingBox();return{x:r.x+x/1000*r.width,y:r.y+y/680*r.height};};
   const drag=async(id,x,y)=>{
    const state=JSON.parse(await canvas.getAttribute('data-state')),item=state.items.find(item=>item.id===id),from=await point(item.x,item.y),to=await point(x,y);
    await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:20});await page.mouse.up();gestures.push({id,from:{x:item.x,y:item.y},to:{x,y},action:'real pointer drag'});
   };
   if(activity.id==='C03'){await drag('my-car',300,380);await drag('stamp-0',770,360);await drag('stamp-1',730,130);await drag('stamp-2',220,140);}
   if(activity.id==='A01'){await drag('stamp-0',800,330);await drag('stamp-1',220,170);await drag('stamp-2',760,180);}
   if(activity.id==='A02'){
    const ink=await point(420,680*.13);await page.mouse.click(ink.x,ink.y);gestures.push({id:'ink-1',action:'real pointer tap'});
    await drag('my-car',220,440);await drag('my-car',760,300);await drag('my-car',350,510);
   }
  }
  await page.addStyleTag({content:'.world-camera-tools{visibility:hidden!important}'});
  const presentation=await page.locator('.touch-canvas').getAttribute('data-presentation');
  const surface=page.locator(presentation==='three'?'.touch-world-canvas':'.touch-canvas');
  const pixels=await surface.screenshot();
  const file=`media/town/activity-${activity.id}.webp`;
  const output=await sharp(pixels).resize(720,490,{fit:'contain',background:'#f5efdf'}).webp({quality:86}).toBuffer();
  await fs.writeFile(`public/${file}`,output);
  const sha256=createHash('sha256').update(output).digest('hex');
  const asset={id:`town-activity-${activity.id}`,kind:'image',path:file,sha256,status:'approved',width:720,height:490,source:'Origin: actual TouchBoard / TouchWorldRenderer render; scripts/capture-town-covers.mjs; content/town-cover-renders.json'};
  const prior=content.assets.findIndex(a=>a.id===asset.id);if(prior>=0)content.assets[prior]=asset;else content.assets.push(asset);
  records.push({activityId:activity.id,path:file,sha256,carId:'CAR01',presentation,gestures,goal:activity.goal,mode:activity.mode,source:'TouchBoard shared rule engine; original item/target geometry and colours',viewport:{width:1280,height:1000},captureScript:'scripts/capture-town-covers.mjs'});
  console.log(`${activity.id}: ${presentation}`);
 }
 await fs.writeFile('content/r3.json',JSON.stringify(content,null,2)+'\n');
 await fs.writeFile('content/town-cover-renders.json',JSON.stringify(records,null,2)+'\n');
}finally{await browser.close();}
