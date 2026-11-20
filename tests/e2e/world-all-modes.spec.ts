import {test,expect,type Page} from '@playwright/test';
import * as T from 'three';
import {flickPointer} from './touch-helpers';
const world=(p:Page)=>p.locator('canvas.touch-world-canvas');
const snap=async(p:Page)=>JSON.parse((await world(p).getAttribute('data-state'))!);
async function open(p:Page,id:string){await p.goto(`/#/play/${id}?car=CAR01&view=3d`);await expect(world(p)).toHaveAttribute('data-ready','true',{timeout:45000});}
async function at(p:Page,v:{x:number;y:number}){const b=(await world(p).boundingBox())!;return{x:b.x+v.x*b.width,y:b.y+v.y*b.height};}
const touch=(p:Page)=>(p.viewportSize()?.width||1000)<=768;
async function tap(p:Page,v:{x:number;y:number}){if(touch(p))await p.touchscreen.tap(v.x,v.y);else await p.mouse.click(v.x,v.y);}
async function click(p:Page,id:string){const s=await snap(p),v=await at(p,s.actors.find((a:any)=>a.id===id).screen);await tap(p,v);}
async function drag(p:Page,id:string,to:{x:number;y:number},steps=6){
 const s=await snap(p),a=await at(p,s.actors.find((a:any)=>a.id===id).screen),b=await at(p,to);
 if(touch(p)){
  const input=await p.context().newCDPSession(p);
  try{await input.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});for(let n=1;n<=steps;n++)await input.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*n/steps,y:a.y+(b.y-a.y)*n/steps,id:1}]});await input.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}finally{await input.detach();}
 }else{await p.mouse.move(a.x,a.y);await p.mouse.down();await p.mouse.move(b.x,b.y,{steps});await p.mouse.up();}
}
async function drop(p:Page,id:string,target:string){await expect.poll(async()=>(await snap(p)).recovering).toBe(false);if(target==='color-home')await expect.poll(async()=>(await snap(p)).colorStage.presenting,{timeout:15000}).toBe(false);const s=await snap(p);await drag(p,id,s.targetScreens.find((t:any)=>t.id===target).screen);}
async function ground(p:Page,x:number,y:number){const s=await snap(p);const v=new T.Vector3((x-500)*.02,0,(y-s.boardHeight/2)*.02).applyMatrix4(new T.Matrix4().fromArray(s.floorProjection));return{x:(v.x+1)/2,y:(1-v.y)/2};}
async function flick(p:Page,id:string){
 const s=await snap(p),a=await at(p,s.actors.find((a:any)=>a.id===id).screen),b=await at(p,await ground(p,410,230));
 if(touch(p)){
  const input=await p.context().newCDPSession(p),time=Date.now()/1000;
  try{await input.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}],timestamp:time});for(let n=1;n<=3;n++)await input.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*n/3,y:a.y+(b.y-a.y)*n/3,id:1}],timestamp:time+n*.025});await input.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[],timestamp:time+.085});}finally{await input.detach();}
 }else await flickPointer(p,a,b);
}
async function done(p:Page){await expect(p.locator('.touch-play')).toHaveAttribute('data-completed','true',{timeout:25000});await expect.poll(async()=>(await snap(p)).progress).toBe(1);}
const ids=['E01','E02','E03','M01','M02','M03','M04','C01','C02','C03','S01','S02','S03','T01','T02','T03','H01','H02','H03','A01','A02','L01','L02','L03','P01','T04'];
for(const viewport of [{name:'desktop',width:1000,height:760},{name:'tablet',width:768,height:1024},{name:'phone',width:390,height:844}])test.describe(viewport.name,()=>{
test.use({viewport:{width:viewport.width,height:viewport.height},hasTouch:viewport.name!=='desktop'});
for(const id of ids)test(`${id} 立体场景完整实际操作 @worldmatrix`,async({page},info)=>{
 const evidence=`playability-audit/${info.project.name}/${viewport.name}/${id}`;
 test.setTimeout(150000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page,id);await page.screenshot({path:test.info().outputPath(`${evidence}-start.png`)});
 if(['M01','M02','M03'].includes(id)){const n=id==='M01'?2:3;for(let i=0;i<n;i++){if(id==='M02'&&i===2)await drop(page,'extra-bay','bay-2');await drop(page,`car-${i}`,id==='M03'&&i===2?'bay-3':`bay-${i}`);}}
 else if(id==='E01'){
  await drop(page,'blue','color-home');
  expect((await snap(page)).progress).toBe(0);
  for(const color of ['red','blue','white']){
   await expect.poll(async()=>(await snap(page)).colorStage.color).toBe(color);
   await drop(page,color,'color-home');
   await expect.poll(async()=>(await snap(page)).items.find((item:{id:string})=>item.id===color).placed).toBe(true);
  }
 }
 else if(id==='M04'){
  await drop(page,'red','pattern-4');await drop(page,'blue','pattern-5');
  await page.getByRole('button',{name:'接下一队车'}).click();
  await drop(page,'blue','pattern-4');await drop(page,'red','pattern-5');
 }
 else if(id==='L03'){
  for(let i=0;i<3;i++)await drop(page,`car-${i}`,`bay-${i}`);
  await page.getByRole('button',{name:'换成长短挂牌'}).click();
  for(const [i,slot] of [1,2,0].entries())await drop(page,`car-${i}`,`bay-${slot}`);
 }
 else if(id==='T04'){for(const x of ['body','wheel-0','wheel-1'])await drop(page,x,x);await page.getByRole('button',{name:'推车试走'}).click();}
 else if(id==='C02'){
  for(const [i,slot] of [1,0,2].entries())await drop(page,`step-${i}`,`step-${slot}`);
  await page.getByRole('button',{name:'照顺序演一遍'}).click();await done(page);
  await page.getByRole('button',{name:'换成洗车前'}).click();
  for(let i=0;i<3;i++)await drop(page,`step-${i}`,`step-${i}`);
  await page.getByRole('button',{name:'照顺序演一遍'}).click();
  await expect.poll(async()=>(await snap(page)).sequence.phase,{timeout:15000}).toBe('passed');
 }
 else if(id==='S03'){
  await drop(page,'pack-2','bag');await page.getByRole('button',{name:'试试下雨'}).click();
  await expect.poll(async()=>(await snap(page)).rain.result).toBe('wet');await page.getByRole('button',{name:'换一套再试'}).click();
  await drop(page,'pack-1','bag');await page.getByRole('button',{name:'试试下雨'}).click();
  await expect.poll(async()=>(await snap(page)).rain.result).toBe('dry');
 }
 else if(id==='L01'){
  await page.getByRole('button',{name:'开车出门'}).click();await expect.poll(async()=>(await snap(page)).trip.phase).toBe('blocked');
  await drop(page,'water','bag');await drop(page,'hat','bag');await drop(page,'belt','seat');
  await page.getByRole('button',{name:'开车出门'}).click();
 }
 else if(id==='H02'){for(let i=0;i<3;i++)await drop(page,`tool-${i}`,`help-${i}`);}
 else if(id==='H01'){
  await drop(page,'visitor','place-0');await expect.poll(async()=>(await snap(page)).visit.location).toBe(0);
  expect((await snap(page)).completed).toBe(false);await click(page,'exhibit');await done(page);
  await page.getByRole('button',{name:'回地图'}).click();await drop(page,'visitor','place-2');
  await page.getByRole('button',{name:'打开标本箱'}).click();await expect.poll(async()=>(await snap(page)).visit.visited).toEqual([0,2]);
 }
 else if(id==='L02'){
  await page.getByRole('button',{name:'推推小车'}).click();
  await page.getByRole('button',{name:'招招手'}).click();
  await expect(page.locator('.town-action-cue')).toContainText('挡板挪开了');
  await page.getByRole('button',{name:'推推小车'}).click();
 }
 else if(id==='C01'){
  await drag(page,'stamp-0',await ground(page,250,(await snap(page)).boardHeight*.4));
  await expect.poll(async()=>(await snap(page)).stand.count).toBe(1);
  await page.getByRole('button',{name:'换背景'}).click();
  await page.getByRole('button',{name:'从观众席看'}).click();
  await page.getByRole('button',{name:'保存展位'}).click();
 }
 else if(id==='C03'){
  await click(page,'story-door');await page.getByRole('button',{name:'去第二幕'}).click();
  await expect.poll(async()=>(await snap(page)).story.discovery).toBe('butterfly');
  await drag(page,'stamp-0',await ground(page,300,(await snap(page)).boardHeight*.46));
  await expect.poll(async()=>(await snap(page)).story.count).toBe(2);
  await page.getByRole('button',{name:'播放我的故事'}).click();
 }
 else if(id==='A01'){
  const H=(await snap(page)).boardHeight;
  await drag(page,'stamp-0',await ground(page,260,H*.36));
  await drag(page,'stamp-1',await ground(page,700,H*.38));
  await expect.poll(async()=>(await snap(page)).poster.count).toBe(2);
  expect((await snap(page)).completed).toBe(false);
  await page.getByRole('button',{name:'保存海报'}).click();
 }
 else if(id==='A02'){
  const H=(await snap(page)).boardHeight;
  await drag(page,'my-car',await ground(page,710,H*.48));
  const first=(await snap(page)).tracks.count;
  await page.getByRole('button',{name:'折线轮纹'}).click();
  await drag(page,'my-car',await ground(page,310,H*.42));
  await expect.poll(async()=>(await snap(page)).tracks.count).toBeGreaterThan(first);
  await page.getByRole('button',{name:'撤回',exact:true}).click();
  await expect.poll(async()=>(await snap(page)).tracks.count).toBe(first);
 }
 else if(id==='P01'){
  await flick(page,'runner');await page.getByRole('button',{name:'交换路面'}).click();
  await page.getByRole('button',{name:'用同样的力再试'}).click();
 }
 else if(id==='S01'){
  await page.getByRole('button',{name:'猜方块更远'}).click();await page.getByRole('button',{name:'放开挡板'}).click();
  await page.getByRole('button',{name:'换个坡面'}).click();
  await page.getByRole('button',{name:'猜小球更远'}).click();await page.getByRole('button',{name:'放开挡板'}).click();
 }
 else if(id==='E03'){
  await drag(page,'runner',await ground(page,720,360));
  expect((await snap(page)).completed).toBe(false);
  await expect.poll(async()=>(await snap(page)).signalGreen).toBe(true);
  await drag(page,'runner',await ground(page,900,(await snap(page)).boardHeight*.54));
 }
 else if(id==='S02'){await drag(page,'lamp',await ground(page,200,140));await drag(page,'lamp',await ground(page,800,140));}
 else if(id==='T02'){
  const trial=page.getByRole('button',{name:'推车试桥'});
  await drop(page,'short','bridge');await trial.click();await expect(page.locator('.town-action-cue')).toContainText('桥板还够不到');
  await drop(page,'long','bridge');await trial.click();await page.getByRole('button',{name:'去更宽的河段'}).click();
  await expect.poll(async()=>(await snap(page)).items.find((item:any)=>item.id==='long').available).toBe(false);
  await click(page,'bridge-shed');await expect.poll(async()=>(await snap(page)).items.find((item:any)=>item.id==='long').available).toBe(true);
  await drop(page,'long','bridge');await trial.click();
 }
 else if(id==='T03'){for(const [level,actions]of [[0,[['road-1',1]]],[1,[['road-1',2]]],[2,[['road-1',1],['road-2',2],['road-5',1]]]] as const){for(const [road,n] of actions)for(let i=0;i<n;i++){const before=(await snap(page)).road.shapes[Number(road.slice(5))];await click(page,road);await expect.poll(async()=>(await snap(page)).road.shapes[Number(road.slice(5))]).not.toBe(before);}await page.getByRole('button',{name:'让小车试路'}).click();await expect.poll(async()=>(await snap(page)).road.won,{timeout:25000}).toBe(true);if(level<2){await expect.poll(async()=>{const actor=(await snap(page)).actors.find((a:any)=>a.id==='next-road'),bounds=actor?.screenBounds,rect=await world(page).boundingBox();return bounds&&rect?Math.max((bounds.max.x-bounds.min.x)*rect.width,(bounds.max.y-bounds.min.y)*rect.height):0;}).toBeGreaterThan(24);await click(page,'next-road');await expect.poll(async()=>(await snap(page)).road.level).toBe(level+1);await expect.poll(async()=>(await snap(page)).road.won).toBe(false);}}}
 else if(id==='H03'){
  test.setTimeout(210000);
  for(let car=0;car<2;car++){
   for(let n=0;n<60;n++){
    const s=await snap(page);if(s.wash.clean>car)break;
    const patch=s.washDirt[0],tool=patch.kind==='stubborn'?'用海绵':'喷水';
    await page.getByRole('button',{name:tool,exact:true}).click();
    const a=await at(page,patch.point),before=s.dirt.length;
    await tap(page,a);
    await expect.poll(async()=>{const next=await snap(page);return next.wash.clean>car||next.dirt.length<before||next.washing.stubborn<s.washing.stubborn;}).toBe(true);
   }
   await expect.poll(async()=>(await snap(page)).wash.clean).toBe(car+1);
   if(car===0){await click(page,'next-car');await expect.poll(async()=>(await snap(page)).wash.waiting).toBe(false);await expect.poll(async()=>(await snap(page)).dirt.length).toBeGreaterThan(0);}
  }
 }
 else if(['E02','T01'].includes(id)){const initial=await snap(page);expect(initial.partScreens.other).toBeTruthy();const roof=await at(page,initial.partScreens.other);await tap(page,roof);expect((await snap(page)).parts).toEqual([]);for(const part of ['wheel','door','light']){const s=await snap(page);const point=s.partScreens?.[part];expect(point,`visible ${part} hit point`).toBeTruthy();const a=await at(page,point);await tap(page,a);} }
 await done(page);if(id==='P01'){const result=(await snap(page)).comparison.at(-1);expect(result.smooth).toBeGreaterThan(result.rough);expect(result.rough).toBeGreaterThan(0);}expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:test.info().outputPath(`${evidence}-done.png`)});
});
});

test.afterEach(async({page},info)=>{if(info.status!==info.expectedStatus&&await world(page).count())console.log("FINAL_STATE",JSON.stringify(await snap(page)));});
