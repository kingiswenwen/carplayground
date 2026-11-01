import {test,expect,type Page} from '@playwright/test';
test.use({viewport:{width:1000,height:760}});
const world=(page:Page)=>page.locator('canvas.touch-world-canvas');
const snapshot=async(page:Page)=>JSON.parse((await world(page).getAttribute('data-state'))!);
async function open(page:Page,id:string,car="CAR01"){await page.goto(`/#/play/${id}?car=${car}`);await expect(world(page)).toHaveAttribute('data-ready','true',{timeout:45000});}
async function drag(page:Page,from:{x:number;y:number},to:{x:number;y:number}){const b=(await world(page).boundingBox())!;await page.mouse.move(b.x+from.x*b.width,b.y+from.y*b.height);await page.mouse.down();await page.mouse.move(b.x+to.x*b.width,b.y+to.y*b.height,{steps:4});await page.mouse.up();}
test('立体停车直接拖独立网格入位，能切换镜头而不丢进度 @smoke',async({page})=>{
 test.setTimeout(90000);await open(page,'M01');let s=await snapshot(page);expect(s.triangles).toBeGreaterThan(5000);expect(s.actors.filter((a:{mesh:boolean})=>a.mesh)).toHaveLength(2);
 await drag(page,s.actors.find((a:{id:string})=>a.id==='car-0').screen,s.targetScreens[0].screen);
 await expect.poll(async()=>(await snapshot(page)).items.find((a:{id:string})=>a.id==='car-0').placed).toBe(true);
 await page.getByRole('button',{name:'转动看看立体场景'}).click();await page.getByRole('button',{name:'回到触碰玩法'}).click();
 s=await snapshot(page);await drag(page,s.actors.find((a:{id:string})=>a.id==='car-1').screen,s.targetScreens[1].screen);
 await expect(page.locator('.touch-play')).toHaveAttribute('data-completed','true');await page.screenshot({path:'.private/r14-3d-world/parking-3d.png'});
});
test('立体洗车指针擦除车身污渍，键盘可逐处擦洗并轮流换车 @smoke',async({page})=>{
 test.setTimeout(180000);await open(page,'H03');const b=(await world(page).boundingBox())!;
 const initial=await snapshot(page);console.log('wash quality',await world(page).getAttribute('data-quality'));const point=initial.dirt[Math.floor(initial.dirt.length/2)];await page.mouse.move(b.x+point.x*b.width,b.y+point.y*b.height);await page.mouse.down();await page.mouse.move(b.x+(point.x+.02)*b.width,b.y+point.y*b.height);await page.mouse.up();
 await expect.poll(async()=>(await snapshot(page)).dirt.length).toBeLessThan(initial.dirt.length);
 for(let car=0;car<2;car++){
  for(let press=0;press<24;press++){const s=await snapshot(page);if(s.wash.clean>car)break;console.log('wash step',car,press,s.wash.clean,s.dirt.length);await world(page).press('Enter');}
  await expect.poll(async()=>(await snapshot(page)).wash.clean).toBe(car+1);
  if(car===0){await world(page).press('Enter');await expect.poll(async()=>(await snapshot(page)).wash.waiting).toBe(false);}
 }
 await expect(page.locator('.touch-play')).toHaveAttribute('data-completed','true');
});
test('立体装车和推车使用实体模型，松手惯性仍按实际操作完成 @smoke',async({page})=>{
 test.setTimeout(120000);await open(page,'T04');
 for(const id of ['body','wheel-0','wheel-1']){const s=await snapshot(page);await drag(page,s.actors.find((a:{id:string})=>a.id===id).screen,s.targetScreens.find((t:{id:string})=>t.id===id).screen);}
 await expect(page.locator('.touch-play')).toHaveAttribute('data-completed','true');
 await open(page,'P01');await world(page).focus();await world(page).press('Enter');await expect.poll(async()=>(await snapshot(page)).completed,{timeout:30000}).toBe(true);
});

test('新增跑车进入玩法时加载自己的车型网格，模型失败可简化并重试 @smoke',async({page})=>{
 test.setTimeout(90000);await open(page,'M01','CAR31');expect((await snapshot(page)).actors.find((a:{id:string})=>a.id==='car-0').sourceCar).toBe('CAR31');
 await page.route(/\/models\/(?:play\/)?car31\.glb/,r=>r.abort());await page.reload();await expect(page.locator('.touch-canvas[data-presentation=flat]')).toBeVisible({timeout:45000});
 await page.unroute(/\/models\/(?:play\/)?car31\.glb/);await page.getByRole('button',{name:'打开立体玩法',exact:true}).click();await expect(world(page)).toHaveAttribute('data-ready','true',{timeout:45000});expect((await snapshot(page)).actors.find((a:{id:string})=>a.id==='car-0').sourceCar).toBe('CAR31');
});
test('26个玩法均可打开真实立体场景 @smoke',async({page})=>{
 test.setTimeout(240000);for(const id of ['E01','E02','E03','M01','M02','M03','M04','C01','C02','C03','S01','S02','S03','T01','T02','T03','H01','H02','H03','A01','A02','L01','L02','L03','P01','T04']){await open(page,id);expect((await snapshot(page)).actors.length,id).toBeGreaterThan(0);}
});
test('新增Countach装配后整车保持入镜，实际轮组插槽支持窄屏拖装 @smoke',async({page})=>{
 test.setTimeout(120000);await open(page,'T04','CAR31');let s=await snapshot(page);expect(s.actors.find((a:{id:string})=>a.id==='body').wheelCount).toBeGreaterThan(3);
 await drag(page,s.actors.find((a:{id:string})=>a.id==='body').screen,s.targetScreens.find((t:{id:string})=>t.id==='body').screen);
 await expect.poll(async()=>(await snapshot(page)).items.find((i:{id:string})=>i.id==='body').placed).toBe(true);
 for(const size of [{width:390,height:844},{width:1280,height:720}]){
  await page.setViewportSize(size);
  // Let ResizeObserver and React apply the new surface before checking its model.
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await expect(world(page)).toHaveAttribute('data-ready','true',{timeout:45000});
  await expect.poll(async()=>{const s=await snapshot(page);if(!s)return false;const body=s.actors.find((a:{id:string})=>a.id==='body'),b=body.screenBounds;return b.min.x>=.04&&b.min.y>=.04&&b.max.x<=.96&&b.max.y<=.96;}).toBe(true);
 }
 for(const id of ['wheel-0','wheel-1']){s=await snapshot(page);await drag(page,s.actors.find((a:{id:string})=>a.id===id).screen,s.targetScreens.find((t:{id:string})=>t.id===id).screen);}
 await expect(page.locator('.touch-play')).toHaveAttribute('data-completed','true');
});

test('手机洗车镜头靠近可操作车身，横竖屏往返不会越变越小',async({page})=>{
 test.setTimeout(90000);await page.setViewportSize({width:390,height:844});await open(page,'H03','CAR14');
 const width=async()=>{const state=await snapshot(page),bounds=state?.actors.find((actor:{id:string})=>actor.id==='wash-car')?.screenBounds;return bounds?bounds.max.x-bounds.min.x:0;};
 await expect.poll(width).toBeGreaterThan(.5);const original=await width();
 for(let round=0;round<2;round++){
  await page.setViewportSize({width:844,height:390});
  await expect(world(page)).toHaveAttribute('data-ready','true',{timeout:45000});
  await page.setViewportSize({width:390,height:844});
  await expect(world(page)).toHaveAttribute('data-ready','true',{timeout:45000});
  await expect.poll(width).toBeGreaterThan(original*.95);
 }
});
