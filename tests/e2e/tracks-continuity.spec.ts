import {test,expect} from '@playwright/test';
import {touchCanvas,dragTouch,localRows} from './touch-helpers';
test('95点轮印满额后新轮印仍重绘，几何位置与保存作品一致 @smoke',async({page},info)=>{
  test.setTimeout(120000);await page.setViewportSize({width:1000,height:760});await page.goto('/#/play/A02?car=CAR01&view=2d');
  const flat=async()=>JSON.parse((await touchCanvas(page).getAttribute('data-state'))!);
  await expect.poll(async()=>(await flat()).ready).toBe(true);
  for(let stroke=0;stroke<12;stroke++){
    const car=(await flat()).items.find((i:{id:string})=>i.id==='my-car');await dragTouch(page,car,{x:stroke%2?320:680,y:car.y},36);
  }
  await expect.poll(async()=>(await localRows(page,'creations'))[0]?.marks&&((await localRows(page,'creations'))[0].marks as unknown[]).length).toBe(95);
  await page.getByRole('button',{name:'打开立体玩法',exact:true}).click();const world=page.locator('canvas.touch-world-canvas');
  await expect(world).toHaveAttribute('data-ready','true',{timeout:45000});
  const state=async()=>JSON.parse((await world.getAttribute('data-state'))!);
  const before=await state();expect(before.tracks.count).toBe(190);await page.screenshot({path:info.outputPath('tracks-at-cap.png')});
  const actor=before.actors.find((a:{id:string})=>a.id==='my-car'),box=(await world.boundingBox())!;
  await page.mouse.move(box.x+actor.screen.x*box.width,box.y+actor.screen.y*box.height);await page.mouse.down();
  await page.mouse.move(box.x+(actor.screen.x+(before.items.find((i:{id:string})=>i.id==='my-car').x<500?.18:-.18))*box.width,box.y+actor.screen.y*box.height,{steps:36});await page.mouse.up();
  await expect.poll(async()=>(await state()).tracks.revision).toBeGreaterThan(before.tracks.revision);
  const after=await state();expect(after.tracks.count).toBe(190);expect(after.tracks.first).not.toEqual(before.tracks.first);expect(after.tracks.last).not.toEqual(before.tracks.last);
  await expect.poll(async()=>{
    const marks=(await localRows(page,'creations'))[0]?.marks as {x:number;y:number}[]|undefined,last=marks?.at(-1);
    return last?Math.abs((last.x*1000-500)*.02-after.tracks.last[0])<.001&&Math.abs((last.y*after.boardHeight-after.boardHeight/2)*.02+.5-after.tracks.last[2])<.001:false;
  }).toBe(true);
  await page.screenshot({path:info.outputPath('tracks-after-cap.png')});
});
