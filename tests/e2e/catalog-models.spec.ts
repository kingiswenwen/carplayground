import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const models=JSON.parse(fs.readFileSync('content/vehicle-models.json','utf8')) as {id:string;catalogKey:string}[];
test.describe.configure({mode:'parallel'});
test.use({viewport:{width:1000,height:760}});
for(const model of models)test(`${model.id} ${model.catalogKey} 独立模型与部件操作`,async({page})=>{
 test.setTimeout(65000);await page.goto(`/#/play/E02?car=${model.id}`);const canvas=page.locator('canvas.touch-world-canvas');await expect(canvas).toHaveAttribute('data-ready','true',{timeout:45000});
 const snapshot=async()=>JSON.parse((await canvas.getAttribute('data-state'))!);let s=await snapshot();expect(s.actors.find((a:any)=>a.id==='parts-car').sourceCar).toBe(model.id);expect(s.triangles).toBeGreaterThan(100);
 await page.screenshot({path:`.private/r15-catalog-play-audit/model-check/${model.id}.png`});
 for(const part of ['wheel','light','door']){s=await snapshot();expect(s.partScreens?.[part],`${model.id} visible ${part}`).toBeTruthy();const p=s.partScreens[part],b=(await canvas.boundingBox())!;await page.mouse.click(b.x+p.x*b.width,b.y+p.y*b.height);await expect.poll(async()=>(await snapshot()).parts.includes(part),{timeout:20000}).toBe(true);}
 await expect(page.locator('.touch-play')).toHaveAttribute('data-completed','true');
});

test.describe('手机装配',()=>{
test.use({hasTouch:true,viewport:{width:390,height:844}});
for(const model of models)test(`${model.id} ${model.catalogKey} 手机立体装配完整操作`,async({page})=>{
 test.setTimeout(90000);await page.setViewportSize({width:390,height:844});
 await page.goto(`/#/play/T04?car=${model.id}`);const canvas=page.locator('canvas.touch-world-canvas');
 await expect(canvas).toHaveAttribute('data-ready','true',{timeout:45000});
 const snapshot=async()=>JSON.parse((await canvas.getAttribute('data-state'))!);
 const tap=async(p:{x:number;y:number})=>{const box=(await canvas.boundingBox())!;await page.touchscreen.tap(box.x+p.x*box.width,box.y+p.y*box.height);};
 for(const id of ['body','wheel-0','wheel-1']){
  const before=await snapshot();await tap(before.actors.find((actor:any)=>actor.id===id).screen);
  await expect.poll(async()=>(await snapshot()).selected,{message:`${model.id} selects visible ${id}`}).toBe(id);
  await tap((await snapshot()).targetScreens.find((target:any)=>target.id===id).screen);
  await expect.poll(async()=>(await snapshot()).items.find((item:any)=>item.id===id).placed,{message:`${model.id} places ${id}`}).toBe(true);
 }
 await expect(page.locator('.touch-play')).toHaveAttribute('data-completed','true');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`.private/catalog-expansion/assembly/${model.id}.png`});
});
});

test.afterEach(async({page},info)=>{if(info.status!==info.expectedStatus){const canvas=page.locator('canvas.touch-world-canvas');if(await canvas.count())console.log('MODEL_FAILURE_STATE',await canvas.getAttribute('data-state'));}});
