import {test,expect,type Page} from '@playwright/test';
import {dropTouch,localRows,openTouch,touchState} from './touch-helpers';

const playing=(page:Page)=>page.evaluate(()=>{
 const howler=Reflect.get(window,'Howler') as unknown as {_howls:{playing:()=>boolean}[]}|undefined;
 return howler?howler._howls.filter(clip=>clip.playing()).length:0;
});
const soundId=(page:Page)=>page.evaluate(()=>{
 const howler=Reflect.get(window,'Howler') as unknown as {_howls:{_sounds:{_id:number}[]}[]};
 return howler._howls[0]?._sounds[0]?._id;
});

test('静音时主动重听玩法能播放，离开后自动引导仍静音',async({page})=>{
 let requests=0;page.on('request',r=>{if(/\.mp3(?:\?|$)/.test(r.url()))requests++;});
 await openTouch(page,'H03');
 await expect(page.getByRole('button',{name:'开启声音',exact:true})).toBeVisible();
 expect(requests).toBe(0);
 await page.getByRole('button',{name:'重听玩法',exact:true}).click();
 await expect.poll(()=>playing(page)).toBe(1);
 await expect(page.getByRole('button',{name:'开启声音',exact:true})).toBeVisible();
 expect((await localRows(page,'settings'))[0]?.sound??false).toBe(false);
 await page.getByRole('link',{name:'回到乐园',exact:true}).click();
 await expect.poll(()=>playing(page)).toBe(0);
 const count=requests;
 await page.evaluate(()=>{location.hash='/play/E02?car=CAR03&view=2d';});
 await expect.poll(async()=>(await touchState(page)).ready).toBe(true);
 expect(await playing(page)).toBe(0);expect(requests).toBe(count);
});

test('静音故事可主动听当前幕，从第一幕从头听也会重新播放',async({page})=>{
 await page.goto('/#/stories/ST01');
 await expect(page.locator('.picture-story')).toHaveAttribute('data-save','saved');
 expect(await playing(page)).toBe(0);
 await page.getByRole('button',{name:'听这一幕',exact:true}).click();
 await expect.poll(()=>playing(page)).toBe(1);
 const previous=await soundId(page);
 await page.getByRole('button',{name:'从头听',exact:true}).click();
 await expect.poll(()=>soundId(page)).not.toBe(previous);
 await expect.poll(()=>playing(page)).toBe(1);
 await expect(page.locator('.picture-story')).toHaveAttribute('data-frame','0');
 await page.getByRole('button',{name:'跳过玩法，继续故事',exact:true}).click();
 await expect(page.locator('.picture-story')).toHaveAttribute('data-frame','1');
 expect(await playing(page)).toBe(0);
 await expect(page.getByRole('button',{name:'开启声音',exact:true})).toBeVisible();
});

test('静音时可重听当前展台颜色，仍保留静音设置',async({page})=>{
 await openTouch(page,'E01');
 await dropTouch(page,'red','color-home');
 const button=page.getByRole('button',{name:'听登场提示',exact:true});
 await expect(button).toBeEnabled();
 const clip=page.waitForRequest(request=>/color-blue[^/]*\.mp3(?:\?|$)/.test(request.url()));
 await button.click();await clip;
 await expect.poll(()=>playing(page)).toBe(1);
 await expect(page.getByRole('button',{name:'开启声音',exact:true})).toBeVisible();
});

test('家长试听可以停止，退出入口回到原按钮，试听保持原静音设置',async({page})=>{
 await page.goto('/#/explore');
 const gate=page.getByRole('button',{name:/家长设置/});
 await gate.click();
 await page.getByRole('dialog',{name:'请家长来看看'}).press('Escape');
 await expect(gate).toBeFocused();
 await gate.click();
 await page.getByRole('link',{name:'我是家长，进入设置'}).click();
 const soundSetting=page.getByRole('checkbox',{name:/声音引导/});
 await expect(soundSetting).not.toBeChecked();
 await page.getByRole('button',{name:'听一段中文引导'}).click();
 await expect.poll(()=>playing(page)).toBe(1);
 await page.getByRole('button',{name:'停止试听'}).click();
 await expect.poll(()=>playing(page)).toBe(0);
 await expect(soundSetting).not.toBeChecked();
 await page.reload();
 await expect(soundSetting).not.toBeChecked();
});
