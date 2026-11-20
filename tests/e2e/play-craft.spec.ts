import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {dragTouch,dropTouch,localRows,touchState} from './touch-helpers';

test.use({reducedMotion:'reduce'});

test('图标图片失效仍显示内置同款画面，平面玩法可操作',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/play-icons/*.webp',route=>route.fulfill({status:503,body:'temporarily unavailable'}));
 await page.goto('/#/explore');
 await expect(page.locator('.picture-home .play-symbol img')).toHaveAttribute('src',/^data:image\/webp;base64,/);
 await expect(page.locator('.town-destination')).toHaveCount(6);
 await page.goto('/#/play/L01?car=CAR01&view=2d');
 await expect(page.locator('.touch-canvas')).toBeVisible();
 await expect.poll(async()=>(await touchState(page)).ready).toBe(true);
 await dropTouch(page,'water','bag');
 await expect.poll(async()=>(await touchState(page)).items.find(item=>item.id==='water')?.placed).toBe(true);
 expect(errors).toEqual([]);
});

test('手机出行物件有可辨识尺寸且切换画面保留已装物品',async({page})=>{
 test.setTimeout(100000);
 await page.setViewportSize({width:390,height:844});await page.goto('/#/play/L01?car=CAR01&view=3d');
 const world=page.locator('.touch-world-canvas');await expect(world).toHaveAttribute('data-ready','true',{timeout:45000});
 await expect.poll(()=>world.evaluate(canvas=>{const s=JSON.parse(canvas.getAttribute('data-state')||'{}');return s.actors?.length||0;})).toBe(4);
 const dimensions=await world.evaluate(canvas=>{const rect=canvas.getBoundingClientRect(),s=JSON.parse(canvas.getAttribute('data-state')!);return{backing:(canvas as HTMLCanvasElement).width,css:rect.width,props:s.actors.map((actor:{id:string;screenBounds:{min:{x:number;y:number};max:{x:number;y:number}}})=>({id:actor.id,size:Math.max((actor.screenBounds.max.x-actor.screenBounds.min.x)*rect.width,(actor.screenBounds.max.y-actor.screenBounds.min.y)*rect.height)}))};});
 // Software GL retains a desktop pixel budget but must not enlarge a subpixel
 // phone backing buffer. The visible object, not an invisible proxy, is checked.
 expect(dimensions.backing).toBeGreaterThanOrEqual(Math.floor(dimensions.css));
 for(const prop of dimensions.props)expect(prop.size,prop.id).toBeGreaterThan(36);
 await dropTouch(page,'water','bag');
 await expect.poll(async()=>(await touchState(page)).items.find(item=>item.id==='water')?.placed).toBe(true);
 await page.getByRole('button',{name:'使用平面简化玩法',exact:true}).click();
 await expect(page.locator('.touch-canvas')).toBeVisible();
 expect((await touchState(page)).items.find(item=>item.id==='water')?.placed).toBe(true);
 await page.getByRole('button',{name:'打开立体玩法',exact:true}).click();
 await expect(world).toHaveAttribute('data-ready','true',{timeout:45000});
 expect((await touchState(page)).items.find(item=>item.id==='water')?.placed).toBe(true);
});

test('平衡材质路径能实际绘制登记车型 @balanced-render-path',async({page},info)=>{
 test.setTimeout(90000);
 // Exercise the PBR/environment/shadow branch on the available software GPU.
 // This is branch coverage, not a hardware-device or hardware-performance claim.
 await page.addInitScript(()=>{for(const proto of [WebGLRenderingContext.prototype,WebGL2RenderingContext.prototype]){const original=proto.getParameter;proto.getParameter=function(parameter:number){return parameter===37446?'ANGLE (Test Intel Iris balanced branch verification)':original.call(this,parameter);};}});
 await page.setViewportSize({width:960,height:820});await page.goto('/#/play/E02?car=CAR11&view=3d');
 const world=page.locator('.touch-world-canvas');await expect(world).toHaveAttribute('data-ready','true',{timeout:45000});await expect(world).toHaveAttribute('data-quality','balanced');
 await expect.poll(async()=>{const {data,info}=await sharp(await world.screenshot()).removeAlpha().raw().toBuffer({resolveWithObject:true});const colors=new Set<number>();for(let y=Math.floor(info.height*.2);y<info.height*.8;y+=5)for(let x=Math.floor(info.width*.15);x<info.width*.85;x+=5){const i=(y*info.width+x)*info.channels;colors.add((data[i]>>5)*64+(data[i+1]>>5)*8+(data[i+2]>>5));}return colors.size;},{timeout:20000}).toBeGreaterThan(20);
 await page.screenshot({path:info.outputPath('balanced-path-car11.png')});
});

test('浏览器隐藏GPU信息时仍可辨认并操作车型部件',async({page})=>{
 await page.addInitScript(()=>{for(const proto of [WebGLRenderingContext.prototype,WebGL2RenderingContext.prototype]){const original=proto.getExtension;Object.defineProperty(proto,'getExtension',{value:function(this:WebGLRenderingContext|WebGL2RenderingContext,name:string){return name==='WEBGL_debug_renderer_info'?null:Reflect.apply(original,this,[name]);}});}});
 await page.setViewportSize({width:390,height:844});await page.goto('/#/play/T01?car=CAR01&view=3d');
 const world=page.locator('.touch-world-canvas');await expect(world).toHaveAttribute('data-ready','true',{timeout:45000});await expect(world).toHaveAttribute('data-quality','simple');
 await world.focus();await page.keyboard.press('Enter');
 await expect.poll(()=>world.evaluate(canvas=>JSON.parse(canvas.getAttribute('data-state')||'{}').parts?.length||0)).toBe(1);
});

test('跨域图标加载后作品画布仍可导出',async({page})=>{
 let anonymousLoads=0;
 // Redirect targets are served by a real second HTTP origin: Playwright routes
 // do not intercept every hop of an HTTP redirect chain.
 const server=createServer(async(request,response)=>{
  if(request.headers.origin)anonymousLoads++;
  try{const bytes=await fs.readFile(path.resolve('public/media/play-icons',path.basename(request.url||'')));response.writeHead(200,{'content-type':'image/webp','access-control-allow-origin':'*'});response.end(bytes);}catch{response.writeHead(404);response.end();}
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=(server.address() as AddressInfo).port;
 try{
  await page.route('**/play-icons/*.webp',route=>route.fulfill({status:302,headers:{location:`http://127.0.0.1:${port}/`+new URL(route.request().url()).pathname.split('/').at(-1)}}));
  await page.goto('/#/play/A01?car=CAR01&view=2d');
  await expect(page.locator('.touch-canvas')).toBeVisible();await expect.poll(async()=>(await touchState(page)).ready).toBe(true);
  expect(anonymousLoads).toBeGreaterThan(0);
  const exported=await page.locator('.touch-canvas').evaluate(canvas=>(canvas as HTMLCanvasElement).toDataURL('image/png'));
  expect(exported).toMatch(/^data:image\/png;base64,/);
 }finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});

test('立体画纸选择后切到平面仍保留所选纸色',async({page})=>{
 await page.goto('/#/play/A01?car=CAR01&view=3d');const world=page.locator('.touch-world-canvas');
 await expect(world).toHaveAttribute('data-ready','true',{timeout:45000});
 const point=await world.evaluate(canvas=>{const actor=JSON.parse(canvas.getAttribute('data-state')!).actors.find((a:{id:string})=>a.id==='paper'),rect=canvas.getBoundingClientRect();return{x:rect.x+actor.screen.x*rect.width,y:rect.y+actor.screen.y*rect.height};});
 await page.mouse.click(point.x,point.y);
 await page.getByRole('button',{name:'使用平面简化玩法',exact:true}).click();
 const flat=page.locator('.touch-canvas');await expect(flat).toBeVisible();
 const height=await flat.evaluate((canvas:HTMLCanvasElement)=>canvas.height);
 const {items}=await touchState(page);
 await dragTouch(page,items.find(item=>item.id==='stamp-0')!,{x:260,y:height*.38});
 await page.getByRole('button',{name:'保存海报',exact:true}).click();
 await expect.poll(async()=>(await localRows(page,'creations'))[0]?.background).toBe('#f4ddcc');
});
