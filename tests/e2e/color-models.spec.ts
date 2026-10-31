import {test,expect,type Page} from '@playwright/test';
import {touchCanvas,touchState,touchPosition,completedTouch} from './touch-helpers';
test.use({viewport:{width:390,height:844},hasTouch:true});
async function drop(page:Page,id:string,target:string){
 await expect.poll(async()=>JSON.parse((await touchCanvas(page).getAttribute('data-state'))!).recovering).toBe(false);
 const state=await touchState(page),a=await touchPosition(page,state.items.find(item=>item.id===id)!),b=await touchPosition(page,state.targets.find(item=>item.id===target)!);
 const input=await page.context().newCDPSession(page);
 try{
  await input.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});
  for(let n=1;n<=8;n++)await input.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*n/8,y:a.y+(b.y-a.y)*n/8,id:1}]});
  await input.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }finally{await input.detach();}
}
for(const car of ['CAR65','CAR171'])for(const mode of ['E01','M04','L03'])test(`${car} ${mode} 不可换色车型使用正确颜色车图并完成触摸玩法`,async({page})=>{
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
