// Run against a local preview after changes to the illustrated gameplay.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {chromium} from '@playwright/test';
const baseURL=process.env.PLAYWRIGHT_BASE_URL||'http://localhost:5173';
const content=JSON.parse(await fs.readFile('content/r3.json','utf8'));
const viewport={width:1280,height:1000};
const browser=await chromium.launch({executablePath:process.env.CARPLAYGROUND_COVER_CHROMIUM});
const page=await browser.newPage({viewport,reducedMotion:'reduce'});
const canvas=page.locator('canvas.touch-canvas[data-scene-art="illustrated"]');
const read=async()=>JSON.parse(await canvas.getAttribute('data-state'));
const records=[];
const covers=[];
try{
 for(const activity of content.activities){
  await page.goto('about:blank');
  await page.goto(`${baseURL}/#/play/${activity.id}?car=CAR01&view=2d`);
  await canvas.waitFor();
  await page.waitForFunction(()=>JSON.parse(document.querySelector('.touch-canvas')?.dataset.state||'{}').ready);
  const size=await canvas.evaluate(element=>({width:element.width,height:element.height}));
  const point=async({x,y})=>{
   const box=await canvas.boundingBox();
   return {x:box.x+x/size.width*box.width,y:box.y+y/size.height*box.height};
  };
  const gestures=[];
  const drag=async(id,destination)=>{
   const state=await read(),item=state.items.find(item=>item.id===id);
   const target=typeof destination==='string'?state.targets.find(target=>target.id===destination):destination;
   const from=await point(item),to=await point(target);
   await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});await page.mouse.up();
   gestures.push({id,from:{x:item.x,y:item.y},to:{x:target.x,y:target.y},action:'real pointer drag'});
  };
  if(activity.id==='M01')await drag('car-0','bay-0');
  if(activity.id==='T02')await drag('long','bridge');
  if(activity.id==='T04'){
   await drag('body','body');await drag('wheel-0','wheel-0');
  }
  if(activity.id==='C03'){
   await drag('my-car',{x:300,y:380});await drag('stamp-0',{x:770,y:360});
   await drag('stamp-1',{x:730,y:130});await drag('stamp-2',{x:220,y:140});
  }
  if(activity.id==='A01'){
   await drag('stamp-0',{x:800,y:330});await drag('stamp-1',{x:220,y:235});await drag('stamp-2',{x:760,y:240});
  }
  if(activity.id==='A02'){
   const ink=await point((await read()).items.find(item=>item.id==='ink-1'));
   await page.mouse.click(ink.x,ink.y);gestures.push({id:'ink-1',action:'real pointer tap'});
   await drag('my-car',{x:220,y:440});await drag('my-car',{x:760,y:300});await drag('my-car',{x:350,y:510});
  }
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const pixels=await canvas.screenshot();
  const file=`media/town/activity-${activity.id}.webp`;
  const output=await sharp(pixels).resize(720,490,{fit:'cover'}).webp({quality:86}).toBuffer();
  covers.push({file,output});
  const sha256=createHash('sha256').update(output).digest('hex');
  const asset={id:`town-activity-${activity.id}`,kind:'image',path:file,sha256,status:'approved',width:720,height:490,source:'Origin: actual illustrated TouchBoard render; scripts/capture-town-covers.mjs; content/town-cover-renders.json'};
  const prior=content.assets.findIndex(a=>a.id===asset.id);if(prior>=0)content.assets[prior]=asset;else content.assets.push(asset);
  records.push({activityId:activity.id,path:file,sha256,carId:'CAR01',presentation:'flat',captureProfile:'illustrated gameplay',gestures,goal:activity.goal,mode:activity.mode,source:'TouchBoard shared rule engine with authored backgrounds, object layers and original teaching colours',viewport,captureScript:'scripts/capture-town-covers.mjs'});
  console.log(`${activity.id}: illustrated`);
 }
 await Promise.all(covers.map(({file,output})=>fs.writeFile(`public/${file}`,output)));
 await fs.writeFile('content/r3.json',JSON.stringify(content,null,2)+'\n');
 await fs.writeFile('content/town-cover-renders.json',JSON.stringify(records,null,2)+'\n');
}finally{await browser.close();}
