import {test,expect,type Page} from '@playwright/test';
import sharp from 'sharp';
import {touchCanvas,touchState,touchPosition,completedTouch} from './touch-helpers';
test.use({viewport:{width:390,height:844},hasTouch:true});
async function drop(page:Page,id:string,target:string){
 const world=page.locator('canvas.touch-world-canvas'),three=await world.count()>0,canvas=three?world:touchCanvas(page);
 await expect.poll(async()=>JSON.parse((await canvas.getAttribute('data-state'))!).recovering).toBe(false);
 const state=JSON.parse((await canvas.getAttribute('data-state'))!);
 const rect=await canvas.boundingBox();
 const project=(p:{x:number;y:number})=>({x:rect!.x+p.x*rect!.width,y:rect!.y+p.y*rect!.height});
 const a=three?project(state.actors.find((actor:any)=>actor.id===id).screen):await touchPosition(page,state.items.find((item:any)=>item.id===id));
 const b=three?project(state.targetScreens.find((item:any)=>item.id===target).screen):await touchPosition(page,state.targets.find((item:any)=>item.id===target));
 const input=await page.context().newCDPSession(page);
 try{
  await input.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});
  for(let n=1;n<=8;n++)await input.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*n/8,y:a.y+(b.y-a.y)*n/8,id:1}]});
  await input.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }finally{await input.detach();}
}
for(const car of ['CAR65','CAR171','CAR05','CAR119','CAR170','CAR177','CAR187','CAR192','CAR129','CAR42','CAR118','CAR160','CAR162','CAR166'])for(const mode of ['E01','M04','L03'])test(`${car} ${mode} 不可换色车型使用正确颜色车图并完成触摸玩法`,async({page})=>{
 test.setTimeout(60000);await page.goto(`/#/play/${mode}?car=${car}`);
 await expect(touchCanvas(page)).toBeVisible();await expect.poll(async()=>(await touchState(page)).ready).toBe(true);
 await expect(page.locator('canvas.touch-world-canvas')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'打开立体玩法',exact:true})).toHaveCount(0);
 await page.screenshot({path:`.private/catalog-expansion/color-${car}-${mode}.png`});
 if(mode==='E01'){
  const colours=await touchCanvas(page).evaluate(canvas=>{
   const c=canvas as HTMLCanvasElement,ctx=c.getContext('2d')!,state=JSON.parse(c.dataset.state!);
   return ['red','blue'].map(id=>{const item=state.items.find((i:any)=>i.id===id),pixels=ctx.getImageData(Math.round(item.x-110),Math.round(item.y-55),220,110).data;let count=0;for(let i=0;i<pixels.length;i+=4){const r=pixels[i],g=pixels[i+1],b=pixels[i+2];if(id==='red'?r>g*1.35&&r>b*1.35&&r>90:b>r*1.35&&b>g*1.1&&b>90)count++;}return count;});
  });
  expect(colours[0]).toBeGreaterThan(800);expect(colours[1]).toBeGreaterThan(800);
  for(const colour of ['red','blue','white'])await drop(page,colour,'color-home');
 }else if(mode==='M04'){await drop(page,'red','pattern-4');await drop(page,'blue','pattern-5');}
 else for(let i=0;i<3;i++)await drop(page,`car-${i}`,`bay-${i}`);
 await completedTouch(page);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test.describe('独立车身材质的实际颜色',()=>{
 test.use({viewport:{width:1000,height:760}});
 for(const car of ['CAR159','CAR141','CAR14','CAR15','CAR22','CAR23','CAR26'])test(`${car} 车型查看器试颜色确实改变车身`,async({page})=>{
  test.setTimeout(60000);await page.goto(`/#/cars/${car}`);
  const canvas=page.locator('canvas.vehicle-webgl');await expect(canvas).toHaveAttribute('data-ready','true',{timeout:45000});
  await page.getByRole('button',{name:'立体车试红色',exact:true}).click();
  const red=await sharp(await canvas.screenshot()).ensureAlpha().raw().toBuffer();
  await page.getByRole('button',{name:'立体车试白色',exact:true}).click();
  const white=await sharp(await canvas.screenshot()).ensureAlpha().raw().toBuffer();let painted=0,changed=0;
  for(let i=0;i<red.length;i+=4)if(red[i]>90&&red[i]>red[i+1]*1.35&&red[i]>red[i+2]*1.35){painted++;const channels=[white[i],white[i+1],white[i+2]];if(Math.min(...channels)>110&&Math.max(...channels)-Math.min(...channels)<50)changed++;}
  expect(painted).toBeGreaterThan(1000);expect(changed/painted).toBeGreaterThan(.5);
 });
 for(const car of ['CAR66','CAR116','CAR120','CAR141','CAR159','CAR172','CAR182','CAR08','CAR195','CAR29','CAR190','CAR14','CAR15','CAR22','CAR23','CAR26'])test(`${car} E01 三维车身显示红白颜色并完成触摸玩法`,async({page})=>{
  test.setTimeout(60000);await page.goto(`/#/play/E01?car=${car}`);
  const canvas=page.locator('canvas.touch-world-canvas');
  await expect(canvas).toHaveAttribute('data-ready','true');
  const state=JSON.parse((await canvas.getAttribute('data-state'))!);
  const {data,info}=await sharp(await canvas.screenshot()).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(const id of ['red','white']){
   const bounds=state.actors.find((actor:any)=>actor.id===id).screenBounds;let matching=0,total=0;
   for(let y=Math.max(0,Math.floor(bounds.min.y*info.height));y<Math.min(info.height,Math.ceil(bounds.max.y*info.height));y++)for(let x=Math.max(0,Math.floor(bounds.min.x*info.width));x<Math.min(info.width,Math.ceil(bounds.max.x*info.width));x++){
    const n=(y*info.width+x)*4,r=data[n],g=data[n+1],b=data[n+2];total++;
    if(id==='red'?r>90&&r>g*1.35&&r>b*1.35:Math.min(r,g,b)>135&&Math.max(r,g,b)-Math.min(r,g,b)<28)matching++;
   }
   expect(matching/total,`${car} ${id} 车身颜色面积`).toBeGreaterThan(id==='red'?.12:.08);
  }
  for(const colour of ['red','blue','white'])await drop(page,colour,'color-home');
  await completedTouch(page);
 });
});
