import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {dropTouch,touchState,completedTouch} from './touch-helpers';
const inventory=JSON.parse(fs.readFileSync('docs/TOWN_ACTIVITY_INVENTORY.json','utf8')) as {proposedAreas:[string,string[]][]};
const places=['showroom','parking','workshop','wash','park','studio'];
for(const width of [320,768,1440])test(`六地点通向全部26项活动，保留选车与可触碰入口 ${width}px @smoke`,async({page})=>{
 test.setTimeout(60000);await page.setViewportSize({width,height:1000});
 await page.goto('/#/explore');
 const destinations=page.getByRole('navigation',{name:'选择小镇地点'}).getByRole('link');
 await expect(destinations).toHaveCount(6);
 for(let index=0;index<6;index++){
  const route=places[index],ids=inventory.proposedAreas[index][1] as string[];
  await page.goto(`/#/explore/${route}`);
  const links=page.locator('.picture-activities a');await expect(links).toHaveCount(ids.length);
  const hrefs=await links.evaluateAll(elements=>elements.map(a=>a.getAttribute('href')));
  expect(hrefs.map(href=>href!.match(/play\/([^?]+)/)![1])).toEqual(ids);
  for(const link of await links.all()){
   expect(await link.locator('img').count()).toBe(1);
   const box=(await link.boundingBox())!;expect(box.width).toBeGreaterThanOrEqual(100);expect(box.height).toBeGreaterThanOrEqual(100);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 }
});
test('场景图失败仍可进入活动，晴天准备不再藏在雨天画面中 @smoke',async({page})=>{
 await page.route('**/media/town/wash.webp*',route=>route.abort());
 await page.goto('/#/explore/wash');await expect(page.getByRole('link',{name:'泡泡洗车屋',exact:true})).toBeVisible();
 await page.getByRole('link',{name:'泡泡洗车屋',exact:true}).click();await expect(page.locator('.touch-play')).toHaveAttribute('data-activity','H03');
 await page.goto('/#/stories/ST02?step=1');
 await expect(page.getByText('雨停了，太阳出来啦')).toBeVisible();
 await expect(page.locator('.town-story-environment img')).toHaveAttribute('src',/story-ST02-1\.webp/);
 await page.getByRole('link',{name:'一起玩：出发准备',exact:true}).click();
 await expect(page).toHaveURL(/play\/L01\?story=ST02&step=1&car=/);
 await page.getByRole('link',{name:'回到故事',exact:true}).click();
 await expect(page.locator('.picture-story')).toHaveAttribute('data-frame','1');
});

test('小镇字体与场景共用版本化媒体路径，并能实际加载 @smoke',async({page})=>{
 const fonts:string[]=[];page.on('request',request=>{if(/town-sans-(regular|bold)\.woff$/.test(request.url()))fonts.push(request.url());});
 await page.goto('/#/explore');await expect(page.locator('.town-map-art img')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>[...document.fonts].filter(font=>font.family.replaceAll('"','')==='Town Sans'&&font.status==='loaded').length)).toBe(2);
 const scene=await page.locator('.town-map-art img').getAttribute('src');
 const base=new URL(scene!,page.url()).href.replace(/town\.webp$/,'');
 expect(fonts).toHaveLength(2);for(const font of fonts)expect(font.startsWith(base)).toBe(true);
});

test('手机停车放大与横竖屏切换保留已停车辆及有余车位 @town-resize',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/#/play/M03?car=CAR03');
 const world=page.locator('.touch-world-canvas');await expect(world).toHaveAttribute('data-ready','true',{timeout:45000});
 await dropTouch(page,'car-0','bay-0');
 for(const viewport of [{width:844,height:390},{width:390,height:844}]){
  await page.setViewportSize(viewport);
  await expect.poll(async()=>{const raw=await world.getAttribute('data-state');return raw?JSON.parse(raw).boardHeight:undefined;}).toBe(viewport.width<600?1200:680);
  await expect(world).toHaveAttribute('data-ready','true',{timeout:45000});
  expect((await touchState(page)).items.filter(item=>item.id.startsWith('car-')&&item.placed)).toHaveLength(1);
 }
 await dropTouch(page,'car-1','bay-1');await dropTouch(page,'car-2','bay-2');await completedTouch(page);
 expect(JSON.parse((await world.getAttribute('data-state'))!).targets.filter((target:{occupied?:boolean})=>!target.occupied)).toHaveLength(1);
});
