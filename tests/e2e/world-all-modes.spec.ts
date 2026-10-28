import {test,expect,type Page} from '@playwright/test';
import * as T from 'three';
import {flickPointer} from './touch-helpers';
test.use({viewport:{width:1000,height:760}});
const world=(p:Page)=>p.locator('canvas.touch-world-canvas');
const snap=async(p:Page)=>JSON.parse((await world(p).getAttribute('data-state'))!);
async function open(p:Page,id:string){await p.goto(`/#/play/${id}?car=CAR01`);await expect(world(p)).toHaveAttribute('data-ready','true',{timeout:45000});}
async function at(p:Page,v:{x:number;y:number}){const b=(await world(p).boundingBox())!;return{x:b.x+v.x*b.width,y:b.y+v.y*b.height};}
async function click(p:Page,id:string){const s=await snap(p),v=await at(p,s.actors.find((a:any)=>a.id===id).screen);await p.mouse.click(v.x,v.y);}
async function drag(p:Page,id:string,to:{x:number;y:number},steps=6){const s=await snap(p),a=await at(p,s.actors.find((a:any)=>a.id===id).screen),b=await at(p,to);await p.mouse.move(a.x,a.y);await p.mouse.down();await p.mouse.move(b.x,b.y,{steps});await p.mouse.up();}
async function drop(p:Page,id:string,target:string){await expect.poll(async()=>(await snap(p)).recovering).toBe(false);const s=await snap(p);await drag(p,id,s.targetScreens.find((t:any)=>t.id===target).screen);}
async function ground(p:Page,x:number,y:number){const s=await snap(p);const v=new T.Vector3((x-500)*.02,0,(y-s.boardHeight/2)*.02).applyMatrix4(new T.Matrix4().fromArray(s.floorProjection));return{x:(v.x+1)/2,y:(1-v.y)/2};}
async function flick(p:Page,id:string){
 const s=await snap(p),a=await at(p,s.actors.find((a:any)=>a.id===id).screen),b=await at(p,await ground(p,410,230));
 await flickPointer(p,a,b);
}
async function done(p:Page){await expect(p.locator('.touch-play')).toHaveAttribute('data-completed','true',{timeout:25000});await expect.poll(async()=>(await snap(p)).progress).toBe(1);}
const ids=['E01','E02','E03','M01','M02','M03','M04','C01','C02','C03','S01','S02','S03','T01','T02','T03','H01','H02','H03','A01','A02','L01','L02','L03','P01','T04'];
for(const id of ids)test(`${id} 立体场景完整实际操作 @worldmatrix`,async({page})=>{
 test.setTimeout(150000);await open(page,id);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 if(['M01','M02','M03','L03'].includes(id)){const n=id==='M01'?2:3;for(let i=0;i<n;i++){if(id==='M02'&&i===2)await drop(page,'extra-bay','bay-2');await drop(page,`car-${i}`,`bay-${i}`);}}
 else if(id==='E01'){await drop(page,'blue','color-home');expect((await snap(page)).progress).toBe(0);for(const c of ['red','blue','white'])await drop(page,c,'color-home');}
 else if(id==='M04'){await drop(page,'red','pattern-4');await drop(page,'blue','pattern-5');}
 else if(id==='T04'){for(const x of ['body','wheel-0','wheel-1'])await drop(page,x,x);}
 else if(id==='C02'){for(let i=0;i<3;i++)await drop(page,`step-${i}`,`step-${i}`);}
 else if(id==='S03'){await drop(page,'pack-2','bag');expect((await snap(page)).progress).toBe(0);for(let i=0;i<2;i++)await drop(page,`pack-${i}`,'bag');}
 else if(id==='L01'){await drop(page,'water','bag');await drop(page,'hat','bag');await drop(page,'belt','seat');}
 else if(id==='H02'){for(let i=0;i<3;i++)await drop(page,`tool-${i}`,`help-${i}`);}
 else if(id==='H01')await drop(page,'visitor','place-0');
 else if(id==='L02')await drop(page,'request','friend');
 else if(['C01','C03','A01'].includes(id)){for(let i=0;i<2;i++)await drag(page,`stamp-${i}`,await ground(page,250+i*450,240));}
 else if(id==='A02')await drag(page,'my-car',await ground(page,720,300));
 else if(['P01','S01'].includes(id)){await flick(page,'runner');}
 else if(id==='E03'){await drag(page,'runner',await ground(page,680,360));expect((await snap(page)).completed).toBe(false);await click(page,'signal');await drag(page,'runner',await ground(page,650,360));await click(page,'signal');}
 else if(id==='S02'){await drag(page,'lamp',await ground(page,200,140));await drag(page,'lamp',await ground(page,800,140));}
 else if(id==='T02'){await drop(page,'short','bridge');expect((await snap(page)).completed).toBe(false);await drop(page,'long','bridge');}
 else if(id==='T03'){for(const [level,actions]of [[0,[['road-1',1]]],[1,[['road-1',2]]],[2,[['road-1',1],['road-2',2],['road-5',1]]]] as const){for(const [road,n] of actions)for(let i=0;i<n;i++){const before=(await snap(page)).road.shapes[Number(road.slice(5))];await click(page,road);await expect.poll(async()=>(await snap(page)).road.shapes[Number(road.slice(5))]).not.toBe(before);}await expect.poll(async()=>(await snap(page)).road.won,{timeout:25000}).toBe(true);if(level<2){await click(page,'next-road');await expect.poll(async()=>(await snap(page)).road.level).toBe(level+1);await expect.poll(async()=>(await snap(page)).road.won).toBe(false);}}}
 else if(id==='H03'){for(let car=0;car<2;car++){for(let n=0;n<30;n++){const s=await snap(page);if(s.wash.clean>car)break;const a=await at(page,s.dirt[0]),before=s.dirt.length;await page.mouse.click(a.x,a.y);await expect.poll(async()=>{const next=await snap(page);return next.wash.clean>car||next.dirt.length<before;}).toBe(true);}await expect.poll(async()=>(await snap(page)).wash.clean).toBe(car+1);if(car===0){await click(page,'next-car');await expect.poll(async()=>(await snap(page)).wash.waiting).toBe(false);await expect.poll(async()=>(await snap(page)).dirt.length).toBeGreaterThan(0);}}}
 else if(['E02','T01'].includes(id)){const initial=await snap(page);expect(initial.partScreens.other).toBeTruthy();const roof=await at(page,initial.partScreens.other);await page.mouse.click(roof.x,roof.y);expect((await snap(page)).parts).toEqual([]);for(const part of ['wheel','door','light']){const s=await snap(page);const point=s.partScreens?.[part];expect(point,`visible ${part} hit point`).toBeTruthy();const a=await at(page,point);await page.mouse.click(a.x,a.y);} }
 await done(page);if(id==='P01'){const result=(await snap(page)).comparison.at(-1);expect(result.smooth).toBeGreaterThan(result.rough);expect(result.rough).toBeGreaterThan(0);}expect(errors).toEqual([]);await page.screenshot({path:`.private/r15-catalog-play-audit/modes/${id}.png`});
});

test.afterEach(async({page},info)=>{if(info.status!==info.expectedStatus&&await world(page).count())console.log("FINAL_STATE",JSON.stringify(await snap(page)));});
