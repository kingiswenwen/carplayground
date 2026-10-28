import {expect,type Page} from '@playwright/test';
import fs from 'node:fs';
const carContent=JSON.parse(fs.readFileSync('content/r3.json','utf8')) as {cars:{id:string;hotspots:{id:string;x:number;y:number}[]}[]};
export function partTouchPoints(carId='CAR02',height=680){return carContent.cars.find(c=>c.id===carId)!.hotspots.map(p=>({x:50+p.x*900,y:height*.49-202.5+p.y*405}));}
export type TouchState={ready:boolean;completed:boolean;progress:number;moving:boolean;items:{id:string;x:number;y:number;placed:boolean}[];targets:{id:string;x:number;y:number;occupied?:boolean}[]};
export const touchCanvas=(page:Page)=>page.locator('canvas.touch-canvas');
export const touchState=async(page:Page):Promise<TouchState>=>{
 const world=page.locator('canvas.touch-world-canvas');
 const rendered=await world.evaluateAll(nodes=>nodes[0]?.getAttribute('data-state')??null);
 return JSON.parse(rendered||(await touchCanvas(page).getAttribute('data-state'))!);
};
export async function openTouch(page:Page,id:string,car='CAR02'){
 await page.goto(`/#/play/${id}?car=${car}&view=2d`);await expect(page.locator('.touch-play')).toHaveAttribute('data-activity',id);await expect(touchCanvas(page)).toBeVisible();await expect.poll(async()=>(await touchState(page)).ready).toBe(true);
}
export async function touchPosition(page:Page,p:{x:number;y:number}){
 const box=(await touchCanvas(page).boundingBox())!,height=await touchCanvas(page).evaluate(c=>(c as HTMLCanvasElement).height);
 return{x:box.x+p.x/1000*box.width,y:box.y+p.y/height*box.height};
}
export async function dragTouch(page:Page,from:{x:number;y:number},to:{x:number;y:number},steps=14){
 const a=await touchPosition(page,from),b=await touchPosition(page,to);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps});await page.mouse.up();
}
// A flick needs a recent velocity sample. Unpaced mouse.move({steps}) depends on
// machine load and can represent either a held car or a sub-8ms gesture.
export async function flickPointer(page:Page,from:{x:number;y:number},to:{x:number;y:number}){
 if(page.context().browser()?.browserType().name()==='chromium'){
  const input=await page.context().newCDPSession(page),time=Date.now()/1000;
  try{
   await input.send('Input.dispatchMouseEvent',{type:'mousePressed',...from,button:'left',buttons:1,clickCount:1,timestamp:time});
   for(let n=1;n<=3;n++)await input.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:from.x+(to.x-from.x)*n/3,y:from.y+(to.y-from.y)*n/3,button:'left',buttons:1,timestamp:time+n*.025});
   await input.send('Input.dispatchMouseEvent',{type:'mouseReleased',...to,button:'left',buttons:0,clickCount:1,timestamp:time+.085});
  }finally{await input.detach();}
 }else{
  // Playwright's non-CDP mouse API cannot set timestamps. Keep real browser
  // hit-testing/capture, but pace the event timestamps, not slow driver IPC.
  const timing=await page.evaluateHandle(()=>{
   let time=performance.now();
   const stamp=(event:Event)=>{Object.defineProperty(event,'timeStamp',{value:time});time+=25;};
   const types=['pointerdown','pointermove','pointerup'];
   for(const type of types)window.addEventListener(type,stamp,true);
   return()=>{for(const type of types)window.removeEventListener(type,stamp,true);};
  });
  try{
   await page.mouse.move(from.x,from.y);await page.mouse.down();
   for(let n=1;n<=3;n++)await page.mouse.move(from.x+(to.x-from.x)*n/3,from.y+(to.y-from.y)*n/3);
   await page.mouse.up();
  }finally{await timing.evaluate(dispose=>dispose());await timing.dispose();}
 }
}
export async function flickTouch(page:Page,from:{x:number;y:number},to:{x:number;y:number}){
 await flickPointer(page,await touchPosition(page,from),await touchPosition(page,to));
}
export async function dropTouch(page:Page,item:string,target:string){
 const world=page.locator('canvas.touch-world-canvas');
 if(await touchCanvas(page).getAttribute('data-presentation')==='three'){
  await expect(world).toHaveAttribute('data-ready','true',{timeout:45000});
  await expect.poll(async()=>JSON.parse((await world.getAttribute('data-state'))!).recovering).toBe(false);
  const s=JSON.parse((await world.getAttribute('data-state'))!),box=(await world.boundingBox())!;
  const from=s.actors.find((actor:{id:string})=>actor.id===item).screen,to=s.targetScreens.find((slot:{id:string})=>slot.id===target).screen;
  await page.mouse.move(box.x+from.x*box.width,box.y+from.y*box.height);await page.mouse.down();
  await page.mouse.move(box.x+to.x*box.width,box.y+to.y*box.height,{steps:6});await page.mouse.up();
  await expect.poll(async()=>JSON.parse((await world.getAttribute('data-state'))!).items.find((actor:{id:string})=>actor.id===item).placed).toBe(true);return;
 }
 await expect.poll(async()=>JSON.parse((await touchCanvas(page).getAttribute('data-state'))!).recovering).toBe(false);const s=await touchState(page);await dragTouch(page,s.items.find(i=>i.id===item)!,s.targets.find(t=>t.id===target)!);
}
export async function completedTouch(page:Page){await expect.poll(async()=>(await touchState(page)).completed,{timeout:12000}).toBe(true);}
export async function localRows(page:Page,table:string){return page.evaluate(name=>new Promise<Record<string,unknown>[]>((resolve,reject)=>{const request=indexedDB.open('carplayground-local-v1');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,read=db.transaction(name).objectStore(name).getAll();read.onerror=()=>{db.close();reject(read.error);};read.onsuccess=()=>{db.close();resolve(read.result);};};}),table);}
