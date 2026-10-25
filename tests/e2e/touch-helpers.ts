import {expect,type Page} from '@playwright/test';
import fs from 'node:fs';
const carContent=JSON.parse(fs.readFileSync('content/r3.json','utf8')) as {cars:{id:string;hotspots:{id:string;x:number;y:number}[]}[]};
export function partTouchPoints(carId='CAR02',height=680){return carContent.cars.find(c=>c.id===carId)!.hotspots.map(p=>({x:50+p.x*900,y:height*.49-202.5+p.y*405}));}
export type TouchState={ready:boolean;completed:boolean;progress:number;moving:boolean;items:{id:string;x:number;y:number;placed:boolean}[];targets:{id:string;x:number;y:number;occupied?:boolean}[]};
export const touchCanvas=(page:Page)=>page.locator('canvas.touch-canvas');
export const touchState=async(page:Page):Promise<TouchState>=>JSON.parse((await touchCanvas(page).getAttribute('data-state'))!);
export async function openTouch(page:Page,id:string,car='CAR02'){
 await page.goto(`/#/play/${id}?car=${car}`);await expect(page.locator('.touch-play')).toHaveAttribute('data-activity',id);await expect(touchCanvas(page)).toBeVisible();await expect.poll(async()=>(await touchState(page)).ready).toBe(true);
}
export async function touchPosition(page:Page,p:{x:number;y:number}){
 const box=(await touchCanvas(page).boundingBox())!,height=await touchCanvas(page).evaluate(c=>(c as HTMLCanvasElement).height);
 return{x:box.x+p.x/1000*box.width,y:box.y+p.y/height*box.height};
}
export async function dragTouch(page:Page,from:{x:number;y:number},to:{x:number;y:number}){
 const a=await touchPosition(page,from),b=await touchPosition(page,to);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:14});await page.mouse.up();
}
export async function dropTouch(page:Page,item:string,target:string){await expect.poll(async()=>JSON.parse((await touchCanvas(page).getAttribute('data-state'))!).recovering).toBe(false);const s=await touchState(page);await dragTouch(page,s.items.find(i=>i.id===item)!,s.targets.find(t=>t.id===target)!);}
export async function completedTouch(page:Page){await expect.poll(async()=>(await touchState(page)).completed,{timeout:12000}).toBe(true);}
export async function localRows(page:Page,table:string){return page.evaluate(name=>new Promise<Record<string,unknown>[]>((resolve,reject)=>{const request=indexedDB.open('carplayground-local-v1');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,read=db.transaction(name).objectStore(name).getAll();read.onerror=()=>{db.close();reject(read.error);};read.onsuccess=()=>{db.close();resolve(read.result);};};}),table);}
