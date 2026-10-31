import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const models=JSON.parse(fs.readFileSync('content/vehicle-models.json','utf8')) as {id:string;catalogKey:string}[];
test.describe.configure({mode:'parallel'});
test.use({viewport:{width:390,height:844},hasTouch:true});
for(const model of models)test(`${model.id} ${model.catalogKey} 手机立体洗车与换车`,async({page})=>{
 test.setTimeout(90000);await page.goto(`/#/play/H03?car=${model.id}`);
 const canvas=page.locator('canvas.touch-world-canvas');await expect(canvas).toHaveAttribute('data-ready','true',{timeout:45000});
 const snapshot=async()=>JSON.parse((await canvas.getAttribute('data-state'))!);
 const tap=async(p:{x:number;y:number})=>{const box=(await canvas.boundingBox())!;await page.touchscreen.tap(box.x+p.x*box.width,box.y+p.y*box.height);};
 for(let car=0;car<2;car++){
  await expect.poll(async()=>(await snapshot()).dirt.length,{message:`${model.id} has dirt on the visible car surface`}).toBeGreaterThan(0);
  for(let n=0;n<48;n++){
   const before=await snapshot();if(before.wash.clean>car)break;
   await tap(before.dirt[0]);
   await expect.poll(async()=>{const after=await snapshot();return after.wash.clean>car||after.dirt.length<before.dirt.length;},{message:`${model.id} visible dirt can be cleaned`}).toBe(true);
  }
  await expect.poll(async()=>(await snapshot()).wash.clean).toBe(car+1);
  if(car===0){
   await tap((await snapshot()).actors.find((actor:any)=>actor.id==='next-car').screen);
   await expect.poll(async()=>(await snapshot()).wash.waiting).toBe(false);
  }
 }
 await expect(page.locator('.touch-play')).toHaveAttribute('data-completed','true');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`.private/catalog-expansion/wash/${model.id}.png`});
});
