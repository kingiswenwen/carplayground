import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const models=JSON.parse(fs.readFileSync('content/vehicle-models.json','utf8')) as {id:string;catalogKey:string}[];
test.use({viewport:{width:1000,height:760}});
for(const model of models)test(`${model.id} ${model.catalogKey} 独立模型与部件操作`,async({page})=>{
 test.setTimeout(65000);await page.goto(`/#/play/E02?car=${model.id}`);const canvas=page.locator('canvas.touch-world-canvas');await expect(canvas).toHaveAttribute('data-ready','true',{timeout:45000});
 const snapshot=async()=>JSON.parse((await canvas.getAttribute('data-state'))!);let s=await snapshot();expect(s.actors.find((a:any)=>a.id==='parts-car').sourceCar).toBe(model.id);expect(s.triangles).toBeGreaterThan(100);
 await page.screenshot({path:`.private/r15-catalog-play-audit/model-check/${model.id}.png`});
 for(const part of ['wheel','light','door']){s=await snapshot();expect(s.partScreens?.[part],`${model.id} visible ${part}`).toBeTruthy();const p=s.partScreens[part],b=(await canvas.boundingBox())!;await page.mouse.click(b.x+p.x*b.width,b.y+p.y*b.height);await expect.poll(async()=>(await snapshot()).parts.includes(part),{timeout:20000}).toBe(true);}
 await expect(page.locator('.touch-play')).toHaveAttribute('data-completed','true');
});

test.afterEach(async({page},info)=>{if(info.status!==info.expectedStatus){const canvas=page.locator('canvas.touch-world-canvas');if(await canvas.count())console.log('MODEL_FAILURE_STATE',await canvas.getAttribute('data-state'));}});
