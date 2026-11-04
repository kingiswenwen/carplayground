import {test,expect,type Page} from '@playwright/test';
import {localRows,openTouch,touchState} from './touch-helpers';

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
